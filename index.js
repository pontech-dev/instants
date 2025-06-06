const puppeteer = require('puppeteer');

(async () => {
  // 1. ブラウザを起動
  // headless: false にすると、実際のブラウザが立ち上がるので動きを確認できます。
  const browser = await puppeteer.launch({
    headless: false, // 本番運用や速度優先の場合は true
  });

  // 2. 新しいページ（タブ）を作成
  const page = await browser.newPage();

  // 3. ページに移動
  await page.goto('https://www.enoteca.co.jp/item/detail/050241401', { waitUntil: 'networkidle2' });

  // 4. セレクタを待機（要素が出現するまで待つ）
  await page.waitForSelector('button.bg-WineRed.text-White');

  //   // 5. ボタンをクリック
  await page.click('button.bg-WineRed.text-White');

})();