const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const env = {};
  
  if (fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf8');
    content.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  
  const LOGIN_URL = env.LOGIN_URL || process.env.LOGIN_URL;
  const ACCOUNT = env.ACCOUNT || process.env.ACCOUNT;
  const PASSWORD = env.PASSWORD || process.env.PASSWORD;
  
  if (!LOGIN_URL || !ACCOUNT || !PASSWORD) {
    console.error('Missing required environment variables');
    process.exit(1);
  }
  
  console.log('[1/5] Starting browser...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('[2/5] Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input', { timeout: 30000 }).catch(() => console.log('No input found'));
    
    console.log('[3/5] Filling in credentials...');
    
    const usernameSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name="username"]', 'input[name="account"]'];
    let usernameFilled = false;
    for (const selector of usernameSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.type(ACCOUNT, { delay: 50 });
        usernameFilled = true;
        break;
      }
    }
    if (!usernameFilled) console.log('Username field not found');
    
    await sleep(500);
    
    const passwordSelectors = ['input[type="password"]', 'input[name="password"]'];
    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.type(PASSWORD, { delay: 50 });
        passwordFilled = true;
        break;
      }
    }
    if (!passwordFilled) console.log('Password field not found');
    
    await sleep(500);
    
    console.log('[4/5] Submitting login form...');
    const submitSelectors = ['button[type="submit"]', '.login-btn', '.submit-btn', '.btn-primary'];
    let loginClicked = false;
    for (const selector of submitSelectors) {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        loginClicked = true;
        break;
      }
    }
    if (!loginClicked) console.log('Login button not found, trying Enter key');
    if (!loginClicked) await page.keyboard.press('Enter');
    
    await sleep(5000);
    
    console.log('[5/5] Fetching subscription links...');
    const subscriptions = [];
    const linkSelectors = [
      'a[href*="subscription"]',
      'a[href*="sub"]',
      'a[href*="link"]',
      '.subscription-link',
      '.sub-link',
      '[data-clipboard-text]',
      '.copy-link',
      'a[href*="v2ray"]',
      'a[href*="ssr://"]',
      'a[href*="vmess://"]',
      'a[href*="trojan://"]'
    ];
    
    for (const selector of linkSelectors) {
      const links = await page.$$(selector);
      for (const link of links) {
        const href = await link.evaluate(el => el.href || el.getAttribute('data-clipboard-text') || '');
        const text = await link.evaluate(el => el.textContent.trim() || el.getAttribute('data-clipboard-text') || '');
        if (href && !subscriptions.find(s => s.href === href)) {
          subscriptions.push({ href, text });
        }
      }
    }
    
    const clipboardData = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-clipboard-text]');
      return Array.from(elements).map(el => el.getAttribute('data-clipboard-text')).filter(Boolean);
    });
    
    for (const data of clipboardData) {
      if (!subscriptions.find(s => s.href === data)) {
        subscriptions.push({ href: data, text: data.substring(0, 50) });
      }
    }
    
    if (subscriptions.length > 0) {
      console.log(`Found ${subscriptions.length} subscription links`);
      
      const extractedContent = subscriptions.map(s => s.href);
      
      const outputPath = path.join(__dirname, 'sub_content.txt');
      fs.writeFileSync(outputPath, extractedContent.join('\n'), 'utf8');
      console.log(`Content saved to ${outputPath}`);
    } else {
      console.log('No subscription links found, saving page content');
      const pageText = await page.evaluate(() => document.body ? document.body.innerText : '');
      const outputPath = path.join(__dirname, 'sub_content.txt');
      fs.writeFileSync(outputPath, pageText, 'utf8');
      console.log(`Page content saved to ${outputPath}`);
    }
    
    await browser.close();
    console.log('Done');
    
  } catch (error) {
    console.error('Script error:', error.message);
    try { await browser.close(); } catch (e) {}
    process.exit(1);
  }
}

main();
