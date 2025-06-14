import puppeteer, { ElementHandle, JSHandle, Page } from 'puppeteer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 環境変数を.envファイルから読み込む
dotenv.config();

// 設定
interface Config {
  email: string;
  password: string;
  targetUrl: string;
  checkInterval: number; // ミリ秒
  headless: boolean;
  screenshotDir: string;
  likeLimit: number;
}

const config: Config = {
  email: process.env.INSTA_ID || '',
  password: process.env.INSTA_PASSWORD || '',
  targetUrl: process.env.TARGET_URL || 'https://www.instagram.com/',
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '5000'), // デフォルト5秒
  headless: process.env.HEADLESS !== 'false', // デフォルトはheadlessモード
  screenshotDir: process.env.SCREENSHOT_DIR || './screenshots',
  likeLimit: parseInt(process.env.LIKE_LIMIT || '30'),
};

// スクリーンショット用ディレクトリの作成
if (!fs.existsSync(config.screenshotDir)) {
  fs.mkdirSync(config.screenshotDir, { recursive: true });
}

// スクリーンショットを保存する関数
async function saveScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filePath = path.join(config.screenshotDir, `${timestamp}_${name}.png`);
  await page.screenshot({ path: filePath });
  console.log(`スクリーンショット保存: ${filePath}`);
}

// 指定した範囲でランダムな待機を行う
async function waitRandom(minMs = 15000, maxMs = 45000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

const clickButtonByText = async (page: Page, text: string) => {
  return await page.evaluate((targetText) => {
    const elements = Array.from(document.querySelectorAll('button'));
    const button = elements.find((el) =>
      (el.textContent?.trim().toLowerCase() || '').includes(targetText.toLowerCase())
    );

    if (button) {
      button.click();
      return true;
    }
    return false;
  }, text);
};

const clickAByText = async (page: Page, text: string) => {
  return await page.evaluate((targetText) => {
    const elements = Array.from(document.querySelectorAll('a'));
    const button = elements.find((el) =>
      (el.textContent?.trim().toLowerCase() || '').includes(targetText.toLowerCase())
    );

    if (button) {
      button.click();
      return true;
    }
    return false;
  }, text);
};

const SESSION_FILE = './session.json';
const LOG_FILE = './like_log.csv';

function appendLikeLog(postUrl: string, username: string): void {
  const header = 'post_url,like_date,owner_url\n';
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, header);
  }
  const likeDate = new Date().toISOString().split('T')[0];
  const ownerUrl = `https://www.instagram.com/${username}/`;
  fs.appendFileSync(LOG_FILE, `${postUrl},${likeDate},${ownerUrl}\n`);
}

async function saveSession(page: Page) {
  const cookies = await page.cookies();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
  console.log('セッション情報を保存しました');
}

async function loadSession(page: Page): Promise<boolean> {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      await page.setCookie(...cookies);
      console.log('セッション情報を復元しました');
      return true;
    }
  } catch (error) {
    console.log('セッション復元に失敗:', error);
  }
  return false;
}

async function performLogin(page: Page) {
  console.log('ログイン処理を開始します...');

  // ログインページに移動（既にInstagramにいる場合）
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

  // ログインフォームの入力
  await page.waitForSelector('input[name="username"]');
  await page.type('input[name="username"]', config.email);
  await page.type('input[name="password"]', config.password);

  // ログインボタンをクリック
  await page.click('button[type="submit"]');

  // ログイン完了まで待機
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // セッション情報を保存
  await saveSession(page);

  console.log('ログイン完了');
}

const clickLikeButton = async (page: Page): Promise<boolean> => {
  return await page.evaluate(() => {
    const likeButton = document.querySelector('svg[aria-label="いいね!"]');
    if (likeButton) {
      // SVGの親要素（通常はbutton）を探してクリック
      let parent = likeButton.parentElement;
      while (parent && parent.tagName !== 'BUTTON') {
        parent = parent.parentElement;
      }
      console.log(3);

      if (parent) {
        parent.click();
        return true;
      }
    }
    return false;
  }, false);
};

const clickFollowButton = async (page: Page): Promise<boolean> => {
  const followButtons = await page.$$('div[role="button"]');
  for (const btn of followButtons) {
    const text = await btn.evaluate((el) => el.textContent?.trim() || '');
    if (text.includes('フォローする')) {
      await btn.evaluate((el: HTMLElement) => {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        }
      });
      await btn.tap();
      return true;
    }
  }
  return false;
};

// メイン処理
async function main() {
  const browser = await puppeteer.launch({
    headless: config.headless,
    defaultViewport: null,
    args: ['--window-size=1366,768'],
  });

  try {
    const page = await browser.newPage();

    // ユーザーエージェントの設定
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    // まずInstagramのホームページに移動
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

    // 既存セッションの復元を試行
    const sessionRestored = await loadSession(page);

    if (sessionRestored) {
      // セッションが復元された場合、リロードして確認
      await page.reload({ waitUntil: 'networkidle2' });

      // ログイン状態かチェック
      const isLoggedIn = (await page.$('svg[aria-label="ホーム"]')) !== null;

      if (isLoggedIn) {
        console.log('既存セッションでログイン済み');
      } else {
        console.log('セッション期限切れ、再ログインします');
        await performLogin(page);
      }
    } else {
      console.log('新規ログインを実行します');
      await performLogin(page);
    }

    // 複数ページの処理
    const dataPath = path.resolve(__dirname, '../data.json');
    type DataItem = { url?: string; ownerUsername?: string };
    let dataItems: DataItem[] = [];
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        dataItems = json as DataItem[];
      } else {
        console.error('data.json の形式が正しくありません');
        return;
      }
    } catch (err) {
      console.error('data.json の読み込みに失敗しました:', err);
      return;
    }

    let likeCount = 0;

    for (const item of dataItems) {
      const url = item.url;
      const username = item.ownerUsername || '';
      if (!url) {
        continue;
      }
      if (likeCount >= config.likeLimit) {
        console.log(`いいね上限 (${config.likeLimit}) に達したため処理を終了します`);
        break;
      }
      console.log(`処理中: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });

      // フォローボタンがあればクリック
      try {
        const followed = await clickFollowButton(page);
        if (followed) {
          console.log('フォローしました');
          await waitRandom();
        }
      } catch (error) {
        console.log('フォローボタンが見つかりません:', error);
      }

      const likeIconSelector = 'svg[aria-label="いいね！"]';

      let svgIconHandle: ElementHandle | null = null;
      let buttonJsHandle: JSHandle | null = null; // SVGの祖先のbutton要素のJSHandle

      try {
        // 1. "いいね！" の aria-label を持つSVG要素を探します。
        //    要素が表示されるまで最大5秒待機します。
        try {
          await page.waitForSelector(likeIconSelector, { timeout: 5000, visible: true });
          svgIconHandle = await page.$(likeIconSelector);
        } catch (e) {
          console.log(
            `いいね！SVGアイコン (${likeIconSelector}) が表示されませんでした、またはタイムアウトしました。`
          );
          return false;
        }

        if (!svgIconHandle) {
          console.log(
            `いいね！SVGアイコン (${likeIconSelector}) が見つかりませんでした (waitForSelector後)。`
          );
          return false;
        }

        // 2. SVG要素の最も近い祖先で role="button" を持つ要素を探します。
        //    これがクリック対象のボタン要素となります。
        buttonJsHandle = await svgIconHandle.evaluateHandle((el) => el.closest('[role="button"]'));

        const buttonElementH = buttonJsHandle.asElement(); // ElementHandleにキャスト (存在すれば)
        console.log(buttonElementH, 'buttonElement');

        if (!buttonElementH) {
          console.log(
            'クリック可能なボタン要素 (role="button"を持つ祖先) が見つかりませんでした。'
          );
          // svgIconHandle と buttonJsHandle は finally ブロックで解放されます。
          return false;
        }

        const buttonElement = buttonElementH as ElementHandle<HTMLElement>;
        // もし HTMLElement である確信がない場合は ElementHandle<Element> にする

        await buttonElement.evaluate((btn: HTMLElement) => {
          // HTMLElement には scrollIntoView メソッドが存在する
          if (typeof btn.scrollIntoView === 'function') {
            btn.scrollIntoView({ block: 'center', inline: 'center' });
          }
        });

        await buttonElement.tap();
        likeCount++;
        if (url) {
          appendLikeLog(url, username);
        }

        await waitRandom();
      } catch (error) {
        console.log('いいねボタンが見つかりません:', error);
      }

      // 次のページに移動する前に少し待機
      await waitRandom();
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await browser.close();
  }
}

// スクリプト実行
(async () => {
  try {
    await main();
  } catch (error) {
    console.error('致命的なエラーが発生しました:', error);
    // process.exit(1);
  }
})();
