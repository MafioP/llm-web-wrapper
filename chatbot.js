#!/usr/bin/env node
// chatbot.js — Puppeteer chatbot CLI with stealth + terminal IO
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";

puppeteer.use(StealthPlugin());

// ─── Adapters ────────────────────────────────────────────────────────────────

const ADAPTERS = {
  claude: {
    url: "https://claude.ai/new",
    inputSelector: 'div[contenteditable="true"]',
    submitSelector: 'button[aria-label="Send message"]',

    async typePrompt(page, text) {
      await page.click(this.inputSelector);
      await page.keyboard.type(text, { delay: randomDelay(10, 20) });
    },

    async waitForResponse(page) {
      await page.waitForSelector('button[aria-label="Stop response"]', {
        timeout: 10_000,
      });
      await page.waitForSelector('button[aria-label="Stop response"]', {
        hidden: true,
        timeout: 120_000,
      });
    },

    async extractResponse(page) {
      const messages = await page.$$eval(
        ".font-claude-message",
        (els) => els.map((el) => el.innerText.trim())
      );
      return messages.at(-1) ?? "(no response found)";
    },
  },

  chatgpt: {
    url: "https://chatgpt.com/",
    inputSelector: "#prompt-textarea",
    submitSelector: 'button[data-testid="send-button"]',

    async typePrompt(page, text) {
      await page.click(this.inputSelector);
      await page.keyboard.type(text, { delay: randomDelay(10, 20) });
    },

    async waitForResponse(page) {
      await page.waitForSelector('[data-testid="stop-button"]', {
        timeout: 10_000,
      });
      await page.waitForSelector('[data-testid="stop-button"]', {
        hidden: true,
        timeout: 120_000,
      });
    },

    async extractResponse(page) {
      const messages = await page.$$eval(
        '[data-message-author-role="assistant"] .markdown',
        (els) => els.map((el) => el.innerText.trim())
      );
      return messages.at(-1) ?? "(no response found)";
    },
  },

  gemini: {
    url: "https://gemini.google.com/app",
    inputSelector: "rich-textarea .ql-editor",
    submitSelector: 'button[aria-label="Send message"]',

    async typePrompt(page, text) {
      await page.click(this.inputSelector);
      await page.keyboard.type(text, { delay: randomDelay(10, 20) });
    },

    async waitForResponse(page) {
      await page.waitForSelector(".loading-indicator", { timeout: 10_000 });
      await page.waitForSelector(".loading-indicator", {
        hidden: true,
        timeout: 120_000,
      });
    },

    async extractResponse(page) {
      const messages = await page.$$eval(
        "model-response .markdown",
        (els) => els.map((el) => el.innerText.trim())
      );
      return messages.at(-1) ?? "(no response found)";
    },
  },
};

function randomDelay(min, max) {
  return Math.random() * (max - min) + min;
}
// ─── Session ─────────────────────────────────────────────────────────────────

async function createSession(botName, options = {}) {
  const adapter = ADAPTERS[botName];
  if (!adapter) {
    throw new Error(
      `Unknown bot "${botName}". Available: ${Object.keys(ADAPTERS).join(", ")}`
    );
  }

  // Kill any leftover Chrome instances before launching
  try {
    execSync("pkill -f 'chrome.*remote-debugging'", { stdio: "ignore" });
    await new Promise(r => setTimeout(r, 500)); // give it a moment to die
  } catch (_) {
    // pkill exits with code 1 if no process found — that's fine
  }

  const browser = await puppeteer.launch({
    headless: options.headless ?? false,
    userDataDir: options.profileDir ?? `./profiles/${botName}`,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const existingPages = await browser.pages();
  await Promise.all(existingPages.map((p) => p.close()));
  const page = await browser.newPage();

  // Extra stealth headers
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });

  await page.goto(adapter.url, { waitUntil: "networkidle2", timeout: 30_000 });

  return { browser, page, adapter, botName };
}

async function sendPrompt(session, promptText) {
  const { page, adapter } = session;

  await page.waitForSelector(adapter.inputSelector, { timeout: 15_000 });
  await adapter.typePrompt(page, promptText);

  await page.waitForSelector(adapter.submitSelector, { timeout: 5_000 });
  await page.click(adapter.submitSelector);

  await adapter.waitForResponse(page);
  return adapter.extractResponse(page);
}

// ─── Terminal IO ──────────────────────────────────────────────────────────────

function printBanner(botName) {
  console.log(
    chalk.bold.cyan(`
╔════════════════════════════════════════╗
║       🤖  Chatbot CLI — ${botName.padEnd(12)}  ║
║  Type your prompt. Commands:           ║
║    /exit  — quit                       ║
║    /clear — clear the terminal         ║
║    /bot <name> — switch bot            ║
╚════════════════════════════════════════╝`)
  );
}

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function runCLI() {
  // Parse CLI args: node chatbot.js [botName] [--headless]
  const args = process.argv.slice(2);
  let botName = args.find((a) => !a.startsWith("--")) ?? "chatgpt";
  const headless = args.includes("--headless");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("close", async () => {
    console.log(chalk.yellow("\n👋  Bye!"));
    await session.browser.close();
    process.exit(0);
  });

  printBanner(botName);
  console.log(chalk.gray(`Starting browser for ${chalk.white(botName)}…\n`));

  let session = await createSession(botName, { headless });
  console.log(
    chalk.green(
      `✔  Browser ready. ${headless ? "" : "Log in if needed, then come back here."}\n`
    )
  );

  while (true) {
    const raw = await ask(rl, chalk.bold.blue("You › ")).catch(() => "/exit");
    const input = raw.trim();

    if (!input) continue;

    // ── Commands ──
    if (input === "/exit") {
      await session.browser.close();
      rl.close();
      break;
    }

    if (input === "/clear") {
      console.clear();
      printBanner(session.botName);
      continue;
    }

    if (input.startsWith("/bot ")) {
      const newBot = input.slice(5).trim();
      if (!ADAPTERS[newBot]) {
        console.log(
          chalk.red(
            `Unknown bot. Available: ${Object.keys(ADAPTERS).join(", ")}`
          )
        );
        continue;
      }
      console.log(chalk.yellow(`Switching to ${newBot}…`));
      await session.browser.close();
      session = await createSession(newBot, { headless });
      console.log(chalk.green(`✔  Switched to ${newBot}\n`));
      continue;
    }

    // ── Send prompt ──
    const spinner = ora({
      text: chalk.gray("Waiting for response…"),
      spinner: "dots",
    }).start();

    try {
      const response = await sendPrompt(session, input);
      spinner.stop();

      console.log(chalk.bold.green(`\n${session.botName} ›`));
      console.log(chalk.white(response));
      console.log(); // blank line
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      console.log(
        chalk.yellow("Tip: the bot UI may have changed — check selectors.\n")
      );
    }
  }
}

runCLI();
