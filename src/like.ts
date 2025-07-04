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
  commentText: string;
  followDailyLimit: number;
  likeDailyLimit: number;
  commentDailyLimit: number;
  openaiApiKey: string;
}

const config: Config = {
  email: process.env.INSTA_ID || '',
  password: process.env.INSTA_PASSWORD || '',
  targetUrl: process.env.TARGET_URL || 'https://www.instagram.com/',
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '5000'), // デフォルト5秒
  headless: process.env.HEADLESS !== 'false', // デフォルトはheadlessモード
  screenshotDir: process.env.SCREENSHOT_DIR || './screenshots',
  likeLimit: parseInt(process.env.LIKE_LIMIT || '30'),
  commentText: process.env.COMMENT_TEXT || '',
  followDailyLimit: parseInt(process.env.FOLLOW_DAILY_LIMIT || '20'),
  likeDailyLimit: parseInt(process.env.LIKE_DAILY_LIMIT || '100'),
  commentDailyLimit: parseInt(process.env.COMMENT_DAILY_LIMIT || '10'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
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

const SESSION_FILE = './session.json';
const ACTION_LOG_FILE = './action_log.csv';

type ActionCounters = {
  executed: { follow: number; like: number; comment: number };
  skippedAlready: { follow: number; like: number; comment: number };
  skippedLimit: { follow: number; like: number; comment: number };
};

const counters: ActionCounters = {
  executed: { follow: 0, like: 0, comment: 0 },
  skippedAlready: { follow: 0, like: 0, comment: 0 },
  skippedLimit: { follow: 0, like: 0, comment: 0 },
};

function ensureActionLogFile(): void {
  const header = 'date,action,url,owner_url\n';
  if (!fs.existsSync(ACTION_LOG_FILE)) {
    fs.writeFileSync(ACTION_LOG_FILE, header);
  }
}

function appendLikeLog(postUrl: string, username: string): void {
  ensureActionLogFile();
  const date = new Date().toISOString().split('T')[0];
  const ownerUrl = `https://www.instagram.com/${username}/`;
  fs.appendFileSync(ACTION_LOG_FILE, `${date},like,${postUrl},${ownerUrl}\n`);
}

function appendFollowLog(username: string): void {
  ensureActionLogFile();
  const date = new Date().toISOString().split('T')[0];
  const ownerUrl = `https://www.instagram.com/${username}/`;
  fs.appendFileSync(ACTION_LOG_FILE, `${date},follow,,${ownerUrl}\n`);
}

function appendCommentLog(postUrl: string, username: string): void {
  ensureActionLogFile();
  const date = new Date().toISOString().split('T')[0];
  const ownerUrl = `https://www.instagram.com/${username}/`;
  fs.appendFileSync(ACTION_LOG_FILE, `${date},comment,${postUrl},${ownerUrl}\n`);
}

function getTodayActionCount(action: string): number {
  if (!fs.existsSync(ACTION_LOG_FILE)) {
    return 0;
  }
  const today = new Date().toISOString().split('T')[0];
  const lines = fs.readFileSync(ACTION_LOG_FILE, 'utf8').trim().split('\n').slice(1);
  return lines.filter((line) => {
    const parts = line.split(',');
    return parts[0] === today && parts[1] === action;
  }).length;
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
    // 既にフォロー済みの場合
    if (text.includes('フォロー中') || text.includes('メッセージ')) {
      break; // 既にフォローしているのでループを終了
    }
  }
  return false;
};

// OpenAI APIを使ってコメントを生成する関数
async function generateComment(caption: string): Promise<string> {
  if (!config.openaiApiKey) {
    console.log('OpenAI API キーが設定されていません。固定コメントを使用します。');
    return config.commentText || '素敵な投稿ですね！';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // より安価なモデルを使用（gpt-4.1は存在しないため修正）
        messages: [
          {
            role: 'system',
            content:
              'あなたはInstagramのフレンドリーなフォロワーです。投稿に対して自然で親しみやすい40字以下の日本語コメントを生成してください。絵文字を適度に使い、スパムっぽくならないよう注意してください。',
          },
          {
            role: 'user',
            content: `以下の投稿に対して、自然で親しみやすいコメントを40字以下で生成してください：\n\n${caption}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedComment = data.choices[0]?.message?.content?.trim();

    if (!generatedComment) {
      throw new Error('OpenAI APIからコメントを取得できませんでした');
    }

    console.log(`生成されたコメント: ${generatedComment}`);
    return generatedComment;
  } catch (error) {
    console.error('OpenAI API呼び出しエラー:', error);
    console.log('固定コメントを使用します。');
    return config.commentText || '素敵な投稿ですね！';
  }
}

const postComment = async (page: Page, comment: string): Promise<void> => {
  try {
    const inputSelector = 'textarea[aria-label="コメントを追加…"]';
    await page.waitForSelector(inputSelector, { visible: true, timeout: 5000 });
    await page.type(inputSelector, comment);

    await page.waitForFunction(
      () => {
        return [...document.querySelectorAll('div[role="button"]')].some(
          (el) => el.textContent?.trim() === '投稿する'
        );
      },
      { timeout: 5000 }
    );

    const buttons = await page.$$('div[role="button"]');
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent?.trim() || '');
      if (text === '投稿する') {
        await btn.evaluate((el: HTMLElement) => {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        });
        await btn.tap();
        console.log('コメントを投稿しました');
        return;
      }
    }
    console.log('投稿するボタンが見つかりませんでした');
  } catch (error) {
    console.log('コメント投稿に失敗:', error);
  }
};

// 投稿が既にいいね済みか判定する
const isPostLiked = async (page: Page): Promise<boolean> => {
  const unlikeIcon = await page.$('svg[aria-label="いいね！取り消し"]');
  return unlikeIcon !== null;
};

// メイン処理
async function main(): Promise<void> {
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
    type DataItem = { url?: string; ownerUsername?: string; caption?: string };
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
    let todayLikeCount = getTodayActionCount('like');
    let todayFollowCount = getTodayActionCount('follow');
    let todayCommentCount = getTodayActionCount('comment');

    for (const item of dataItems) {
      const url = item.url;
      const username = item.ownerUsername || '';
      const caption = item.caption;
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
        if (todayFollowCount >= config.followDailyLimit) {
          console.log('フォローの1日あたりの上限に達しました');
          counters.skippedLimit.follow++;
        } else {
          const followed = await clickFollowButton(page);
          if (followed) {
            console.log('フォローしました');
            todayFollowCount++;
            counters.executed.follow++;
            appendFollowLog(username);
            await waitRandom();
          } else {
            console.log('既にフォロー済みのためスキップ');
            counters.skippedAlready.follow++;
          }
        }
      } catch (error) {
        console.log('フォローボタンが見つかりません:', error);
      }

      const likeIconSelector = 'svg[aria-label="いいね！"]';

      let svgIconHandle: ElementHandle | null = null;
      let buttonJsHandle: JSHandle | null = null; // SVGの祖先のbutton要素のJSHandle

      try {
        if (await isPostLiked(page)) {
          console.log('既にいいね済みのためスキップ');
          counters.skippedAlready.like++;
          continue;
        }
        // 1. "いいね！" の aria-label を持つSVG要素を探します。
        //    要素が表示されるまで最大5秒待機します。
        try {
          await page.waitForSelector(likeIconSelector, { timeout: 5000, visible: true });
          svgIconHandle = await page.$(likeIconSelector);
        } catch (e) {
          console.log(
            `いいね！SVGアイコン (${likeIconSelector}) が表示されませんでした、またはタイムアウトしました。`
          );
          console.log('既にいいね済みのためスキップ');
          counters.skippedAlready.like++;
          continue;
        }

        if (!svgIconHandle) {
          console.log(
            `いいね！SVGアイコン (${likeIconSelector}) が見つかりませんでした (waitForSelector後)。`
          );
          console.log('既にいいね済みのためスキップ');
          counters.skippedAlready.like++;
          continue;
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
          continue;
        }

        const buttonElement = buttonElementH as ElementHandle<HTMLElement>;
        // もし HTMLElement である確信がない場合は ElementHandle<Element> にする

        await buttonElement.evaluate((btn: HTMLElement) => {
          // HTMLElement には scrollIntoView メソッドが存在する
          if (typeof btn.scrollIntoView === 'function') {
            btn.scrollIntoView({ block: 'center', inline: 'center' });
          }
        });

        if (todayLikeCount >= config.likeDailyLimit) {
          console.log('いいねの1日あたりの上限に達しました');
          counters.skippedLimit.like++;
        } else {
          await buttonElement.tap();
          likeCount++;
          counters.executed.like++;
          todayLikeCount++;
          if (url) {
            appendLikeLog(url, username);
          }
        }

        await waitRandom();
        if (todayCommentCount >= config.commentDailyLimit) {
          console.log('コメントの1日あたりの上限に達しました');
          counters.skippedLimit.comment++;
        } else {
          const commentToPost = await generateComment(caption || '素敵な投稿ですね!');
          await postComment(page, commentToPost);
          todayCommentCount++;
          counters.executed.comment++;
          appendCommentLog(url, username);
          await waitRandom();
        }
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
    const summary = {
      executed: counters.executed,
      skippedAlready: counters.skippedAlready,
      skippedLimit: counters.skippedLimit,
    };
    console.log('Action summary');
    console.table(summary);
    const summaryDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    fs.writeFileSync(`summary_${summaryDate}.txt`, JSON.stringify(summary, null, 2));
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
