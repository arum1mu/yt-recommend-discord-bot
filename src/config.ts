export interface Config {
  YOUTUBE_API_KEY: string;
  DISCORD_BOT_TOKEN: string;
  MARIADB_HOST: string;
  MARIADB_PORT: number;
  MARIADB_USER: string;
  MARIADB_PASSWORD: string;
  MARIADB_DATABASE: string;
}

const cfg: Config = {
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || "",
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || "",
  MARIADB_HOST: process.env.MARIADB_HOST || "",
  MARIADB_PORT: process.env.MARIADB_PORT ? Number(process.env.MARIADB_PORT) : 3306,
  MARIADB_USER: process.env.MARIADB_USER || "",
  MARIADB_PASSWORD: process.env.MARIADB_PASSWORD || "",
  MARIADB_DATABASE: process.env.MARIADB_DATABASE || "yt_recommend_discord_bot",
};

const missing: string[] = [];
if (!cfg.YOUTUBE_API_KEY) missing.push("YOUTUBE_API_KEY");
if (!cfg.DISCORD_BOT_TOKEN) missing.push("DISCORD_BOT_TOKEN");
if (!cfg.MARIADB_HOST) missing.push("MARIADB_HOST");
if (!cfg.MARIADB_USER) missing.push("MARIADB_USER");
if (!cfg.MARIADB_PASSWORD) missing.push("MARIADB_PASSWORD");
if (!cfg.MARIADB_DATABASE) missing.push("MARIADB_DATABASE");

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

export default cfg;
