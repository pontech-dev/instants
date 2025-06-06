# 環境設定

1. Node.js 20.x 以上をインストールしてください。
2. プロジェクトルートで `npm install` を実行し、依存パッケージをインストールします。
3. `.env.example` を `.env` にコピーし、必要な値（Instagram の ID やパスワードなど）を設定します。
   `LIKE_LIMIT` を変更することで、1回の実行で行う「いいね」の件数を調整できます。

# データ準備
- APPIFYのInstagramでjson形式で出力
  - https://console.apify.com/actors/reGe1ST3OBgYZSsZJ/input
- data.jsonに貼り付け

# 起動方法

```bash
  npm run like
```

実行が完了すると `like_log.csv` に以下の形式でログが追記されます。

```
post_url,like_date,owner_url
```

`owner_url` には `data.json` の `ownerUsername` を用いたアカウントURLが記録されます。
