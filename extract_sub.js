/**
 * black-sea.top 订阅地址自动提取脚本
 * 无头模式，只控制台输出
 */

const puppeteer = require('puppeteer-core');

// ── 配置 ──────────────────────────────────────────
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LOGIN_URL = 'https://black-sea.top/#/login';
const ACCOUNT   = '35'+'69'+'181'+'14'+'7'+'@'+'q'+'q'+'.'+'c'+'o'+'m';
const PASSWORD  = 'q'+'w'+'e'+'1'+'2'+'3'+'12'+'3';

// ── 工具函数：等待直到元素出现（轮询+超时） ──────
async function waitForElement(page, selector, { xpath, timeout = 60000, interval = 500 } = {}) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeout) {
    try {
      let el;
      if (xpath) {
        const els = await page.$x(xpath);
        el = els[0];
      } else {
        el = await page.$(selector);
      }
      if (el) return el;
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`waitForElement: not found within ${timeout}ms (${xpath ? 'xpath' : selector})`);
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  console.log('[1/5] 启动浏览器…');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(120000);

  // 伪装 User-Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // ── 步骤 1：打开登录页 ──────────────────────
  console.log('[2/5] 打开登录页…');
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 120000 });

  // 给 Vue SPA 额外渲染时间
  console.log('  → 等待 SPA 渲染…');
  await new Promise(r => setTimeout(r, 5000));
  console.log('  → 页面加载完成, URL:', page.url());

  // ── 步骤 2：填入账号密码 ────────────────────
  console.log('[3/5] 填入账号密码…');

  const emailInput = await waitForElement(page, '#email', { timeout: 60000 });
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(ACCOUNT, { delay: 30 });
  console.log('  → 账号已填入');

  const pwdInput = await waitForElement(page, '#password', { timeout: 10000 });
  await pwdInput.click({ clickCount: 3 });
  await pwdInput.type(PASSWORD, { delay: 30 });
  console.log('  → 密码已填入');

  // ── 步骤 3：点击登录按钮 ────────────────────
  console.log('[4/5] 点击登录…');

  // 登录按钮 CSS 选择器（用户提供）
  const LOGIN_BTN_SEL = '#app > div > div:nth-child(1) > div > div.auth-card > form > button';
  const loginBtn = await waitForElement(page, LOGIN_BTN_SEL, { timeout: 10000 });
  await loginBtn.click();
  console.log('  → 已点击登录，等待 Dashboard…');

  // ── 步骤 4：等待 Dashboard ──────────────────
  // 等待 URL 或等待某个 dashboard 元素
  await new Promise(r => setTimeout(r, 3000));
  try {
    await page.waitForURL('**/dashboard', { timeout: 60000 });
  } catch {
    console.log('  → URL 未变，继续等待页面内容…');
  }
  console.log('  → Dashboard 已加载, URL:', page.url());

  // ── 步骤 5：耐心等待订阅 input 出现 ─────────
  console.log('[5/5] 等待订阅地址 input 出现…');

  // const XPATH_SUB = '/html/body/div/div/div[2]/div[2]/div/div[1]/div/div/div/div[3]/div[2]/div[1]/div/input';
  const XPATH_SUB = 'input[type="text"]';
  const BACKUP_SELS = [
    'input',
    'input[type="text"]',
    '#app input[type="text"]',
    '/html/body/div/div/div[2]/div[2]/div/div[1]/div/div/div/div[3]/div[2]/div[1]/div/input',
    '#app input[readonly]',
    'input[readonly]',
  ];

  let subUrl = null;

  // 先试完整 XPath，最长等 10 秒
  // console.log('  → 尝试完整 XPath…');
  // try {
  //   const el = await waitForElement(page, null, { xpath: XPATH_SUB, timeout: 10000 });
  //   subUrl = await page.evaluate(el => el.value, el);
  //   console.log('  → 通过 XPath 找到');
  // } catch {
  //   console.log('  → XPath 未命中，尝试备用选择器…');
  // }

  if (!subUrl) {
    for (const sel of BACKUP_SELS) {
      try {
        const el = await waitForElement(page, sel, { timeout: 20000 });
        const val = await page.evaluate(el => el.value, el);
        if (val && val.startsWith('http')) {
          subUrl = val;
          console.log(`  → 通过 "${sel}" 找到`);
          break;
        }
      } catch { /* next */ }
    }
  }

  // ── 输出 ──────────────────────────────────────
  if (subUrl) {
    console.log('\n═══════════════════════════════════════════');
    console.log('  ✅ 订阅地址:', subUrl);
    console.log('═══════════════════════════════════════════');
  } else {
    console.log('\n❌ 未找到订阅地址');

    const allInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        type: i.type,
        value: i.value?.substring(0, 60),
        placeholder: i.placeholder,
        className: i.className,
      }))
    );
    console.log('页面 input 列表:', JSON.stringify(allInputs, null, 2));

    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('页面文本:', pageText);
  }

  await browser.close();
  console.log('\n浏览器已关闭 ✅');
}

main().catch(err => {
  console.error('\n❌ 脚本出错:', err.message);
  process.exit(1);
});
