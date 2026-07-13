/**
 * black-sea.top subscription extractor
 * Supports Windows (Edge) and Linux (Chromium)
 */

const puppeteer = require("puppeteer-core");

const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";

const LOGIN_URL = process.env.LOGIN_URL || "https://black-sea.top/#/login";
const ACCOUNT   = process.env.ACCOUNT   || "35691818147@qq.com";
const PASSWORD  = process.env.PASSWORD || "qwe123123";

const BROWSER_PATHS = {
  win32: [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  linux: [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ],
  darwin: [
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]
};

async function waitForElement(page, selector, { timeout = 60000, interval = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const el = await page.$(selector);
      if (el) return el;
    } catch (e) { /* ignore */ }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error("Element not found: " + selector);
}

async function findBrowser() {
  const paths = BROWSER_PATHS[process.platform] || [];
  const fs = require("fs");
  const { execSync } = require("child_process");

  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log("  -> Found browser: " + p);
      return p;
    }
  }

  if (isLinux) {
    console.log("  -> Installing Chromium...");
    try {
      execSync("apt-get update && apt-get install -y chromium", { stdio: "pipe" });
      return "/usr/bin/chromium";
    } catch (e) { /* continue */ }
  }
  return null;
}

async function main() {
  console.log("[Platform] " + process.platform);
  console.log("[1/6] Finding browser...");

  const browserPath = await findBrowser();

  console.log("[2/6] Launching browser...");
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  };
  if (browserPath) launchOptions.executablePath = browserPath;

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0");
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  console.log("[3/6] Opening login page...");
  await page.goto(LOGIN_URL, { waitUntil: "load", timeout: 120000 });
  await new Promise(r => setTimeout(r, 5000));
  console.log("  -> URL:", page.url());

  console.log("[4/6] Filling credentials...");
  try {
    const emailInput = await waitForElement(page, "#email", { timeout: 60000 });
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(ACCOUNT, { delay: 30 });

    const pwdInput = await waitForElement(page, "#password", { timeout: 10000 });
    await pwdInput.click({ clickCount: 3 });
    await pwdInput.type(PASSWORD, { delay: 30 });
  } catch (e) { console.log("  -> Warning:", e.message); }

  console.log("[5/6] Clicking login...");
  try {
    const loginBtn = await waitForElement(page, "#app > div > div:nth-child(1) > div > div.auth-card > form > button", { timeout: 10000 });
    await loginBtn.click();
  } catch (e) { console.log("  -> Button click failed"); }

  await new Promise(r => setTimeout(r, 3000));
  try { await page.waitForURL("**/dashboard", { timeout: 60000 }); } catch {}
  console.log("  -> Dashboard:", page.url());

  console.log("[6/6] Looking for subscription...");
  let subUrl = null;
  const sels = ["input[type=\"text\"]", "input", "#app input[type=\"text\"]", "input[readonly]"];

  for (const sel of sels) {
    try {
      const el = await waitForElement(page, sel, { timeout: 15000 });
      const val = await page.evaluate(el => el.value, el);
      if (val && (val.startsWith("http") || val.length > 20)) {
        subUrl = val;
        console.log("  -> Found via:", sel);
        break;
      }
    } catch {}
  }

  let subContent = null;
  if (subUrl) {
    console.log("\n=== SUBSCRIPTION URL ===");
    console.log(subUrl);
    console.log("=======================\n");

    try {
      const response = await page.goto(subUrl, { waitUntil: "load", timeout: 60000 });
      subContent = await response.text();
    } catch (e) {
      console.log("  -> Trying curl...");
      try {
        const { execSync } = require("child_process");
        subContent = execSync("curl -sL \"" + subUrl + "\"", { timeout: 60000, encoding: "utf8" });
      } catch (e2) { console.log("  -> Failed:", e2.message); }
    }
  } else {
    console.log("\n[!] URL not found");
  }

  await browser.close();

  const fs = require("fs");
  if (subContent) fs.writeFileSync("sub_content.txt", subContent);
  if (subUrl) fs.writeFileSync("sub_url.txt", subUrl);
  console.log("\n[*] Done");
}

main().catch(err => { console.error("\n[!] Error:", err.message); process.exit(1); });
