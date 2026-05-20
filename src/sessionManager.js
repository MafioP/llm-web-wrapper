// src/sessionManager.js — manages long-lived Puppeteer browser sessions
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { getAdapter } from "./adapters/index.js";

puppeteer.use(StealthPlugin());

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const idleTimers = new Map();

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];
const POOL_SIZE = parseInt(process.env.POOL_SIZE ?? "3");

// botName → Session[]
const pools = new Map();

// botName → index (round robin counter)
const counters = new Map();
// botName → { browser, page, adapter, botName }
const sessions = new Map();

async function killLeftoverChrome() {
  try {
    execSync("pkill -f 'chrome.*remote-debugging'", { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 500));
  } catch (_) { }
}

async function clearProfileLocks(profileDir) {
  const locks = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const lock of locks) {
    try {
      fs.unlinkSync(path.join(profileDir, lock));
    } catch (_) { } // ignore if they don't exist
  }
}


export async function createSession(botName, options = {}) {
  const adapter = getAdapter(botName); // throws if unknown

  // Close any existing session for this bot first
  await destroySession(botName);

  const headless = options.headless ?? (process.env.HEADLESS === "true");
  const profileDir = options.profileDir ?? `./profiles/${botName}-${index}`;
  clearProfileLocks(profileDir);

  const browser = await puppeteer.launch({
    headless,
    userDataDir: profileDir,
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1280, height: 900 },
  });

  // Close leftover tabs from previous session
  const existingPages = await browser.pages();
  const page = existingPages[0] ?? await browser.newPage();
  // close any extra tabs beyond the first
  await Promise.all(existingPages.slice(1).map((p) => p.close()));

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

  const session = { browser, page, adapter, botName, messageCount: 0 };
  sessions.set(botName, session);
  return session;
}

export async function destroySession(botName) {
  if (!pools.has(botName)) return;
  const pool = pools.get(botName);
  pools.delete(botName);
  counters.delete(botName);
  await Promise.all(pool.map((s) => s.browser.close().catch(() => { })));
}

export async function destroyAllSessions() {
  await Promise.all([...pools.keys()].map(destroySession));
}

export function getActiveSessions() {
  return [...pools.entries()].map(([bot, pool]) => ({
    bot,
    sessions: pool.length,
  }));
}

function resetIdleTimer(botName) {
  if (idleTimers.has(botName)) clearTimeout(idleTimers.get(botName));
  idleTimers.set(
    botName,
    setTimeout(async () => {
      console.log(`[${botName}] Idle timeout — closing session`);
      await destroySession(botName);
    }, IDLE_TIMEOUT_MS)
  );
}

export async function sendPrompt(botName, promptText) {
  const pool = await getPool(botName);
  const index = counters.get(botName) % pool.length;
  counters.set(botName, index + 1);

  return enqueue(botName, index, async () => {
    const session = pool[index];
    const { page, adapter } = session;

    resetIdleTimer(botName);

    // reset conversation every 50 messages
    session.messageCount = (session.messageCount ?? 0) + 1;
    if (session.messageCount >= 50) {
      console.warn(`[${botName}:${index}] Message limit reached — resetting conversation`);
      await page.goto(adapter.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      session.messageCount = 0;
    }

    await page.waitForSelector(adapter.inputSelector, { timeout: 15_000 });
    await adapter.typePrompt(page, promptText);
    await page.waitForSelector(adapter.submitSelector, { timeout: 5_000 });
    await adapter.submitPrompt(page, adapter.submitSelector);
    await adapter.waitForResponse(page);

    let response = await adapter.extractResponse(page);

    // empty response fallback — start fresh and retry once
    if (!response) {
      console.warn(`[${botName}:${index}] Empty response — retrying with fresh conversation`);
      await page.goto(adapter.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      session.messageCount = 0;
      await page.waitForSelector(adapter.inputSelector, { timeout: 15_000 });
      await adapter.typePrompt(page, promptText);
      await page.waitForSelector(adapter.submitSelector, { timeout: 5_000 });
      await adapter.submitPrompt(page, adapter.submitSelector);
      await adapter.waitForResponse(page);
      response = await adapter.extractResponse(page);
    }

    return response ?? "(no response found)";
  });
}
async function getPool(botName) {
  if (!pools.has(botName)) {
    console.log(`[${botName}] Initializing pool of ${POOL_SIZE} sessions...`);
    const sessions = await Promise.all(
      Array.from({ length: POOL_SIZE }, () => createSession(botName))
    );
    pools.set(botName, sessions);
    counters.set(botName, 0);
  }
  return pools.get(botName);
}

export async function getSession(botName) {
  const pool = await getPool(botName);

  // round robin across the pool
  const index = counters.get(botName) % pool.length;
  counters.set(botName, index + 1);

  // health check — replace dead sessions
  try {
    await pool[index].browser.version();
  } catch (_) {
    console.warn(`[${botName}] Session ${index} dead — recreating`);
    pool[index] = await createSession(botName);
  }

  return pool[index];
}
