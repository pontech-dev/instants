# 環境設定

1. Node.js 20.x 以上をインストールしてください。
2. プロジェクトルートで `npm install` を実行し、依存パッケージをインストールします。
3. `.env.example` を `.env` にコピーし、必要な値（Instagram の ID やパスワードなど）を設定します。
   `LIKE_LIMIT` を変更することで、1回の実行で行う「いいね」の件数を調整できます。
   `FOLLOW_DAILY_LIMIT`、`LIKE_DAILY_LIMIT`、`COMMENT_DAILY_LIMIT` を設定することで、1日に実行する各アクション数の上限を指定できます（デフォルトはそれぞれ 20/100/10 です）。
   `COMMENT_TEXT` を設定すると、各投稿に自動でコメントを残します（空欄ならコメントしません）。

# データ準備
- APPIFYのInstagramでjson形式で出力
  - https://console.apify.com/actors/reGe1ST3OBgYZSsZJ/input
- data.jsonに貼り付け

# 起動方法

```bash
  npm run like
```

実行が完了すると `action_log.csv` に以下の形式でログが追記されます。

```
date,action,url,owner_url
```

`owner_url` には `data.json` の `ownerUsername` を用いたアカウントURLが記録されます。`action` は `like`、`follow`、`comment` のいずれかです。
