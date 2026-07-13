const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
  
  console.log('Starting browser...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.waitForSelector('input[type="text"], input[type="email"], input[name="username"], input[name="account"]', { timeout: 30000 })
      .catch(() => console.log('Username input not found, trying generic input'));
    
    const usernameSelectors = [
      'input[type="text"]',
      'input[type="email"]', 
      'input[name="username"]',
      'input[name="account"]',
      'input[placeholder*="账号"], input[placeholder*="account"]',
      'input[placeholder*="邮箱"], input[placeholder*="email"]'
    ];
    
    for (const selector of usernameSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.type(ACCOUNT, { delay: 50 });
        console.log('Username entered');
        break;
      }
    }
    
    await page.waitForTimeout(500);
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="密码"], input[placeholder*="password"]'
    ];
    
    for (const selector of passwordSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.type(PASSWORD, { delay: 50 });
        console.log('Password entered');
        break;
      }
    }
    
    await page.waitForTimeout(500);
    
    const submitSelectors = [
      'button[type="submit"]',
      'button:contains("登录"), button:contains("登录")',
      'button:contains("登陆"), button:contains("登陆")',
      'button:contains("Login"), button:contains("Sign in")',
      '.login-btn, .submit-btn, .btn-primary'
    ];
    
    for (const selector of submitSelectors) {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log('Login button clicked');
        break;
      }
    }
    
    await page.waitForTimeout(5000);
    
    const subscriptions = [];
    
    const linkSelectors = [
      'a[href*="subscription"]',
      'a[href*="sub"]',
      'a[href*="link"]',
      '.subscription-link',
      '.sub-link',
      '[class*="subscription"] a',
      '[class*="sub"] a'
    ];
    
    for (const selector of linkSelectors) {
      const links = await page.$$(selector);
      for (const link of links) {
        const href = await link.evaluate(el => el.href);
        const text = await link.evaluate(el => el.textContent.trim());
        if (href && !subscriptions.find(s => s.href === href)) {
          subscriptions.push({ href, text });
        }
      }
    }
    
    const pageContent = await page.content();
    const urlMatches = pageContent.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const url of urlMatches) {
      if (!subscriptions.find(s => s.href === url) && 
          (url.includes('subscription') || url.includes('sub') || url.includes('link'))) {
        subscriptions.push({ href: url, text: url });
      }
    }
    
    if (subscriptions.length > 0) {
      console.log(`Found ${subscriptions.length} subscription links`);
      
      const extractedContent = [];
      
      for (const sub of subscriptions) {
        try {
          console.log(`Fetching: ${sub.text}`);
          const subPage = await browser.newPage();
          await subPage.goto(sub.href, { waitUntil: 'networkidle2', timeout: 30000 });
          
          const content = await subPage.evaluate(() => {
            const preTags = document.querySelectorAll('pre');
            const codeTags = document.querySelectorAll('code');
            const textareas = document.querySelectorAll('textarea');
            
            if (preTags.length > 0) {
              return Array.from(preTags).map(el => el.textContent).join('\n');
            }
            if (codeTags.length > 0) {
              return Array.from(codeTags).map(el => el.textContent).join('\n');
            }
            if (textareas.length > 0) {
              return Array.from(textareas).map(el => el.value || el.textContent).join('\n');
            }
            
            return document.body ? document.body.innerText : '';
          });
          
          if (content && content.trim()) {
            extractedContent.push(`=== ${sub.text} ===`);
            extractedContent.push(content.trim());
            extractedContent.push('');
          }
          
          await subPage.close();
        } catch (err) {
          console.error(`Failed to fetch ${sub.href}: ${err.message}`);
        }
      }
      
      if (extractedContent.length > 0) {
        const outputPath = path.join(__dirname, 'sub_content.txt');
        fs.writeFileSync(outputPath, extractedContent.join('\n'), 'utf8');
        console.log(`Content saved to ${outputPath}`);
      } else {
        console.log('No content extracted');
      }
    } else {
      console.log('No subscription links found');
    }
    
    await browser.close();
    console.log('Done');
    
  } catch (error) {
    console.error('Error:', error.message);
    await browser.close();
    process.exit(1);
  }
}

main();
