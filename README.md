# 環境設定

1. Node.js 20.x 以上をインストールしてください。
2. プロジェクトルートで `npm install` を実行し、依存パッケージをインストールします。
3. `.env.example` を `.env` にコピーし、必要な値（Instagram の ID やパスワードなど）を設定します。

# 起動方法

- TypeScript を直接実行する場合は次のコマンドで起動します。
  ```bash
  npm start
  ```
- TypeScript をビルドして実行する場合は以下を実行します。
  ```bash
  npm run build
  node dist/monitor.js
  ```

