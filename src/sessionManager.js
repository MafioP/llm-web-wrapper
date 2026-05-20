import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { getAdapter } from "./adapters/index.js";
import { enqueue } from "./queue.js";

puppeteer.use(StealthPlugin());

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const POOL_SIZE = parseInt(process.env.POOL_SIZE ?? "3");
const idleTimers = new Map();
const pools = new Map();
const counters = new Map();

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
];

function clearProfileLocks(profileDir) {
  for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try { fs.unlinkSync(path.join(profileDir, lock)); } catch (_) { }
  }
}

function resetIdleTimer(botName) {
  if (idleTimers.has(botName)) clearTimeout(idleTimers.get(botName));
  idleTimers.set(botName, setTimeout(async () => {
    console.log(`[${botName}] Idle timeout — closing sessions`);
    await destroySession(botName);
  }, IDLE_TIMEOUT_MS));
}

export async function createSession(botName, index = 0, options = {}) {
  const adapter = getAdapter(botName);
  const headless = options.headless ?? (process.env.HEADLESS === "true");
  const profileDir = options.profileDir ?? `./profiles/${botName}-${index}`;

  clearProfileLocks(profileDir);

  const browser = await puppeteer.launch({
    headless,
    userDataDir: profileDir,
    args: LAUNCH_ARGS,
    defaultViewport: { width: 1280, height: 900 },
  });

  const existingPages = await browser.pages();
  const page = existingPages[0] ?? await browser.newPage();
  await Promise.all(existingPages.slice(1).map((p) => p.close()));

  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "visible" });
    Object.defineProperty(document, "hidden", { get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    window.addEventListener("blur", (e) => e.stopImmediatePropagation(), true);
  });

  await page.goto(adapter.url, { waitUntil: "networkidle2", timeout: 30_000 });

  return { browser, page, adapter, botName, messageCount: 0 };
}

async function getPool(botName) {
  if (!pools.has(botName)) {
    console.log(`[${botName}] Initializing pool of ${POOL_SIZE} sessions...`);
    const pool = await Promise.all(
      Array.from({ length: POOL_SIZE }, (_, i) => createSession(botName, i))
    );
    pools.set(botName, pool);
    counters.set(botName, 0);
  }
  return pools.get(botName);
}
export async function getSession(botName) {
  const pool = await getPool(botName);
  const index = counters.get(botName) % pool.length;
  counters.set(botName, index + 1);

  try {
    await pool[index].browser.version();
  } catch (_) {
    console.warn(`[${botName}] Session ${index} dead — recreating`);
    pool[index] = await createSession(botName, index);
  }

  return pool[index];
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
  return [...pools.entries()].map(([bot, pool]) => ({ bot, sessions: pool.length }));
}

export async function sendPrompt(botName, promptText) {
  const pool = await getPool(botName);
  const index = counters.get(botName) % pool.length;
  counters.set(botName, index + 1);

  return enqueue(botName, index, async () => {
    const session = pool[index];
    const { page, adapter } = session;

    resetIdleTimer(botName);

    session.messageCount = (session.messageCount ?? 0) + 1;
    if (session.messageCount >= 50) {
      console.warn(`[${botName}:${index}] Message limit — resetting`);
      await page.goto(adapter.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      session.messageCount = 0;
    }

    await page.waitForSelector(adapter.inputSelector, { timeout: 15_000 });
    await adapter.typePrompt(page, promptText);
    await page.waitForSelector(adapter.submitSelector, { timeout: 5_000 });
    await adapter.submitPrompt(page, adapter.submitSelector);
    await adapter.waitForResponse(page);

    let response = await adapter.extractResponse(page);

    if (!response) {
      console.warn(`[${botName}:${index}] Empty response — retrying`);
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
