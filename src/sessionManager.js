// src/sessionManager.js — manages long-lived Puppeteer browser sessions
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { getAdapter } from "./adapters/index.js";

puppeteer.use(StealthPlugin());

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

// botName → { browser, page, adapter, botName }
const sessions = new Map();

async function killLeftoverChrome() {
  try {
    execSync("pkill -f 'chrome.*remote-debugging'", { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 500));
  } catch (_) { }
}


export async function createSession(botName, options = {}) {
  const adapter = getAdapter(botName); // throws if unknown

  // Close any existing session for this bot first
  await destroySession(botName);

  const headless = options.headless ?? (process.env.HEADLESS === "true");
  const profileDir = options.profileDir ?? `./profiles/${botName}`;

  const browser = await puppeteer.launch({
    headless,
    userDataDir: profileDir,
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1280, height: 900 },
  });

  // Close leftover tabs from previous session
  const existingPages = await browser.pages();
  await Promise.all(existingPages.map((p) => p.close()));

  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.evaluateOnNewDocument(() => {
    // Always report the page as visible
    Object.defineProperty(document, "visibilityState", {
      get: () => "visible",
    });
    Object.defineProperty(document, "hidden", {
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Keep focus events firing normally
    window.addEventListener("blur", (e) => e.stopImmediatePropagation(), true);
  });
  await page.goto(adapter.url, { waitUntil: "networkidle2", timeout: 30_000 });

  const session = { browser, page, adapter, botName };
  sessions.set(botName, session);
  return session;
}

export async function destroySession(botName) {
  if (!sessions.has(botName)) return;
  const { browser } = sessions.get(botName);
  sessions.delete(botName);
  try {
    await browser.close();
  } catch (_) { }
}

export async function destroyAllSessions() {
  await Promise.all([...sessions.keys()].map(destroySession));
}

export function getActiveSessions() {
  return [...sessions.keys()];
}

export async function sendPrompt(botName, promptText) {
  const session = await getSession(botName);
  const { page, adapter } = session;

  await page.waitForSelector(adapter.inputSelector, { timeout: 15_000 });
  await adapter.typePrompt(page, promptText);

  await page.waitForSelector(adapter.submitSelector, { timeout: 5_000 });
  await page.click(adapter.submitSelector);

  await adapter.waitForResponse(page);
  return adapter.extractResponse(page);
}

export async function getSession(botName) {
  if (sessions.has(botName)) {
    const session = sessions.get(botName);
    // Check the browser is still alive
    try {
      await session.browser.version();
      return session;
    } catch (_) {
      // Browser is dead — recreate
      sessions.delete(botName);
    }
  }
  return createSession(botName);
}
