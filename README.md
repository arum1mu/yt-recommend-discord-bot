# YouTube Recommend Discord Bot

定期的に YouTube Data API v3 で検索し、関連する動画を Discord の指定チャンネルへ投稿する bot です。

この bot は、どの Discord サーバーのどのチャンネルに動画を投稿するか、検索ワード、投稿数、投稿頻度などの設定を MariaDB で管理します。管理者権限を持つユーザーはスラッシュコマンドを使って登録・解除を行えます。

## 概要

- YouTube Data API v3 を利用して動画を検索
- 指定した検索ワードに一致する動画を定期的に取得
- 投稿先の Discord サーバーとチャンネル情報を MariaDB に保存
- 管理者権限を持つユーザーのみが登録・解除可能なスラッシュコマンドを提供
- 1回に投稿する動画数、投稿頻度、検索ワードを柔軟に設定可能
- 投稿頻度は時間単位で指定し、デフォルトは1時間ごとに1回

## 主な機能

### 1. 定期検索と投稿

- 指定したキーワードで YouTube を検索
- 直近の検索結果から候補動画を抽出
- Discord の対象チャンネルへ動画リンクを投稿
- 定期ジョブで再実行し、異なる動画を継続して共有

### 2. 管理設定の永続化

- サーバー ID
- チャンネル ID
- 検索ワード
- 一度に投稿する動画数
- 投稿頻度
- 登録日時 / 更新日時
- 管理者ユーザー情報

などを MariaDB に保存し、再起動後も設定を維持できるようにします。

### 3. スラッシュコマンド

管理者用コマンドで以下のような操作を想定します。

- `/yt-register`
  - `/yt-register search_query:"machine learning" max_results:3 interval_hours:3`
  - 検索ワード、対象チャンネル、投稿数、頻度を登録
- `/yt-unregister`
  - `/yt-unregister`
  - 登録済み設定を解除
- `/yt-list`
  - `/yt-list`
  - 現在の設定を確認

権限チェックを行い、Discord の管理者権限を持つユーザーのみが実行できるように設計します。

## 環境変数

- `YOUTUBE_API_KEY`
  - Google Cloud の YouTube Data API v3 キー
- `DISCORD_BOT_TOKEN`
  - Discord Bot のトークン
- `MARIADB_HOST`
  - MariaDB のホスト名
- `MARIADB_PORT`
  - MariaDB のポート番号、デフォルトは3306
- `MARIADB_USER`
  - DB 接続ユーザー
- `MARIADB_PASSWORD`
  - DB 接続パスワード
- `MARIADB_DATABASE`
  - 使用するデータベース名、デフォルトはyt-recommend-discord-bot

## docker-compose.yml の記述例

以下は Docker Compose を使う例です。

```yaml
services:
  bot:
    build: .
    container_name: yt-recommend-bot
    restart: unless-stopped
    environment:
      YOUTUBE_API_KEY: ${YOUTUBE_API_KEY}
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      MARIADB_HOST: mariadb
      MARIADB_PORT: 3306
      MARIADB_USER: ${MARIADB_USER}
      MARIADB_PASSWORD: ${MARIADB_PASSWORD}
      MARIADB_DATABASE: ${MARIADB_DATABASE}
    depends_on:
      - mariadb

  mariadb:
    image: mariadb:11
    container_name: yt-recommend-db
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: ${MARIADB_ROOT_PASSWORD}
      MARIADB_DATABASE: ${MARIADB_DATABASE}
      MARIADB_USER: ${MARIADB_USER}
      MARIADB_PASSWORD: ${MARIADB_PASSWORD}
    volumes:
      - mariadb_data:/var/lib/mysql

volumes:
  mariadb_data:
```
