import { google, youtube_v3 } from "googleapis";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import { Generated, Kysely, Selectable, sql } from "kysely";
import { MariadbDialect } from "kysely-mariadb";
import { createPool } from "mariadb";

interface YoutubeRecommendJobTable {
  id: Generated<number>;
  guild_id: string;
  channel_id: string;
  search_query: string;
  max_results: number;
  interval_hours: number;
  last_posted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface Database {
  youtube_recommend_jobs: YoutubeRecommendJobTable;
}

type YoutubeRecommendJob = Selectable<YoutubeRecommendJobTable>;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MARIADB_HOST = process.env.MARIADB_HOST;
const MARIADB_PORT = Number(process.env.MARIADB_PORT) || 3306;
const MARIADB_USER = process.env.MARIADB_USER;
const MARIADB_PASSWORD = process.env.MARIADB_PASSWORD;
const MARIADB_DATABASE = process.env.MARIADB_DATABASE || "yt_recommend_discord_bot";

//環境変数のチェック
if (!YOUTUBE_API_KEY || !DISCORD_BOT_TOKEN || !MARIADB_HOST || !MARIADB_USER || !MARIADB_PASSWORD || !MARIADB_DATABASE) {
  console.error("Missing required environment variables: YOUTUBE_API_KEY, DISCORD_BOT_TOKEN, MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, or MARIADB_DATABASE");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const youtube = google.youtube({
  version: "v3",
  auth: YOUTUBE_API_KEY,
});

const pool = createPool({
  host: MARIADB_HOST,
  port: MARIADB_PORT,
  user: MARIADB_USER,
  password: MARIADB_PASSWORD,
  database: MARIADB_DATABASE,
});

const db = new Kysely<Database>({
  dialect: new MariadbDialect({ mariadb: pool }),
});

async function initDb() {
  await db.schema
    .createTable("youtube_recommend_jobs")
    .ifNotExists()
    .addColumn("id", "bigint", (col) => col.primaryKey().autoIncrement())
    .addColumn("guild_id", "varchar(20)", (col) => col.notNull())
    .addColumn("channel_id", "varchar(20)", (col) => col.notNull())
    .addColumn("search_query", "varchar(255)", (col) => col.notNull())
    .addColumn("max_results", "integer", (col) => col.notNull().defaultTo(3))
    .addColumn("interval_hours", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("last_posted_at", "datetime")
    .addColumn("created_at", "datetime", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "datetime", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

client.once(Events.ClientReady, async () => {
  try {
    await initDb();
    await registerCommands();
    await loadAndScheduleJobs();
  } catch (err) {
    console.error("Initialization error:", err);
  }
});

function fetchVideos(query: string, maxResults = 5) {
  return youtube.search.list({
    part: ["snippet"],
    q: query,
    maxResults: maxResults,
    type: "video",
  } as unknown as youtube_v3.Params$Resource$Search$List);
}

async function registerCommands() {
  if (!client.application) return;

  const commands = [
    new SlashCommandBuilder()
      .setName("yt-register")
      .setDescription("管理者用: このチャンネルに YouTube動画を定期的に投稿するジョブを登録します。")
      .addStringOption((option) =>
        option
          .setName("search_query")
          .setDescription("検索ワード")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("max_results")
          .setDescription("1-5 の範囲で投稿数")
          .setMinValue(1)
          .setMaxValue(5)
      )
      .addIntegerOption((option) =>
        option
          .setName("interval_hours")
          .setDescription("投稿間隔(時間)")
          .setMinValue(1)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("投稿先チャンネル (省略時はコマンドチャンネル)")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("yt-unregister")
      .setDescription("管理者用: このチャンネルの YouTube ジョブを解除します。")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("対象チャンネル (省略時はコマンドチャンネル)")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("yt-list")
      .setDescription("管理者用: 登録された YouTube ジョブを一覧表示します。")
      .toJSON(),
  ];

  await client.application.commands.set(commands);
}

async function registerJob(guildId: string, channelId: string, searchQuery: string, maxResults = 3, intervalHours = 1) {
  await db.insertInto("youtube_recommend_jobs").values({
    guild_id: guildId,
    channel_id: channelId,
    search_query: searchQuery,
    max_results: maxResults,
    interval_hours: intervalHours,
    last_posted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }).execute();
}

async function unregisterJobs(guildId: string, channelId: string) {
  await db.deleteFrom("youtube_recommend_jobs")
    .where("guild_id", "=", guildId)
    .where("channel_id", "=", channelId)
    .execute();
}

async function listJobs(guildId: string): Promise<YoutubeRecommendJob[]> {
  return await db.selectFrom("youtube_recommend_jobs")
    .selectAll()
    .where("guild_id", "=", guildId)
    .execute();
}

const scheduledTimers = new Map<number, NodeJS.Timeout>();

async function loadAndScheduleJobs() {
  const jobs = await db.selectFrom("youtube_recommend_jobs").selectAll().execute();
  for (const job of jobs) {
    scheduleJob(job);
  }
}

function scheduleJob(job: YoutubeRecommendJob) {
  const intervalMs = Number(job.interval_hours) * 60 * 60 * 1000;
  const id = Number(job.id);
  if (scheduledTimers.has(id)) {
    clearInterval(scheduledTimers.get(id)!);
  }
  const timer = setInterval(async () => {
    try {
      const existingJob = await db.selectFrom("youtube_recommend_jobs")
        .select("id")
        .where("id", "=", job.id)
        .executeTakeFirst();
      if (!existingJob) {
        clearInterval(timer);
        scheduledTimers.delete(id);
        return;
      }

      const res = await fetchVideos(job.search_query, Number(job.max_results) || 3);
      const items = res.data.items ?? [];
      const channel = await client.channels.fetch(job.channel_id);
      if (!channel || !("send" in channel)) return;
      const textChannel = channel as TextChannel;
      const urls: string[] = items
        .map((it) => it.id?.videoId)
        .filter((videoId): videoId is string => Boolean(videoId))
        .map((videoId) => `https://youtu.be/${videoId}`);
      if (urls.length === 0) return;
      for (const url of urls) {
        await textChannel.send(url);
      }
      await db.updateTable("youtube_recommend_jobs")
        .set({ last_posted_at: new Date() })
        .where("id", "=", job.id)
        .execute();
    } catch (err) {
      console.error("Job run error:", err);
    }
  }, intervalMs);
  scheduledTimers.set(id, timer);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  if (!interaction.guildId) {
    await interaction.reply({ content: "サーバー内で実行してください。", ephemeral: true });
    return;
  }

  const isAdmin = (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) || false;

  try {
    if (commandName === "yt-register") {
      if (!isAdmin) {
        await interaction.reply({ content: "管理者権限が必要です。", ephemeral: true });
        return;
      }
      const searchQuery = interaction.options.getString("search_query", true);
      const maxResults = interaction.options.getInteger("max_results") || 3;
      const intervalHours = interaction.options.getInteger("interval_hours") || 1;
      const channelOpt = interaction.options.getChannel("channel");
      const channelId = channelOpt ? channelOpt.id : interaction.channelId!;
      await registerJob(interaction.guildId, channelId, searchQuery, Math.min(5, Math.max(1, maxResults)), intervalHours);
      // schedule immediately
      const job = await db.selectFrom("youtube_recommend_jobs")
        .selectAll()
        .where("guild_id", "=", interaction.guildId)
        .where("channel_id", "=", channelId)
        .where("search_query", "=", searchQuery)
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst();
      if (job) scheduleJob(job);
      await interaction.reply({ content: `登録しました: ${searchQuery}`, ephemeral: true });
    } else if (commandName === "yt-unregister") {
      if (!isAdmin) {
        await interaction.reply({ content: "管理者権限が必要です。", ephemeral: true });
        return;
      }
      const channelOpt = interaction.options.getChannel("channel");
      const channelId = channelOpt ? channelOpt.id : interaction.channelId!;
      await unregisterJobs(interaction.guildId, channelId);
      await interaction.reply({ content: `このチャンネル(${channelId}) の登録を解除しました。`, ephemeral: true });
    } else if (commandName === "yt-list") {
      const jobs = await listJobs(interaction.guildId);
      if (!jobs || jobs.length === 0) {
        await interaction.reply({ content: "登録されたジョブはありません。", ephemeral: true });
        return;
      }
      const lines = jobs.map((j) => {
        const intervalHours = Number(j.interval_hours);
        return `チャンネル: <#${j.channel_id}> | query: ${j.search_query} | max: ${j.max_results} | interval: ${intervalHours}h`;
      });
      await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: "エラーが発生しました。ログを確認してください。", ephemeral: true });
  }
});


client.login(DISCORD_BOT_TOKEN).then(() => {
  console.log(`Logged in as ${client.user?.tag}`);
}).catch((error) => {
  console.error("Error logging in to Discord:", error);
  process.exit(1);
});

pool.on("connection", (connection) => {
  console.log("MariaDB connection established:", connection.threadId);
});

pool.on("release", () => {
  // MariaDB pool released a connection
});