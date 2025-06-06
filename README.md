# 環境設定

1. Node.js 20.x 以上をインストールしてください。
2. プロジェクトルートで `npm install` を実行し、依存パッケージをインストールします。
3. `.env.example` を `.env` にコピーし、必要な値（Instagram の ID やパスワードなど）を設定します。
   `LIKE_LIMIT` を変更することで、1回の実行で行う「いいね」の件数を調整できます。

# データ準備
APPIFYのInstagramでjson形式で出力
https://console.apify.com/actors/reGe1ST3OBgYZSsZJ/input
data.jsonに貼り付け

# 起動方法

- 初回のみ
```
  npm i
```
- 起動
```bash
  npm run like
```
