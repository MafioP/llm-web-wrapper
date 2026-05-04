#!/usr/bin/env node
// cli.js — Terminal IO, delegates all browser logic to sessionManager
import "dotenv/config";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { createSession, destroySession, sendPrompt } from "./sessionManager.js";
import { BOT_NAMES } from "./adapters/index.js";

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
  const args = process.argv.slice(2);
  let botName = args.find((a) => !a.startsWith("--")) ?? "chatgpt";
  const headless = args.includes("--headless");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("close", async () => {
    console.log(chalk.yellow("\n👋  Bye!"));
    await destroySession(botName);
    process.exit(0);
  });

  printBanner(botName);
  console.log(chalk.gray(`Starting browser for ${chalk.white(botName)}…\n`));

  await createSession(botName, { headless });
  console.log(
    chalk.green(
      `✔  Browser ready. ${headless ? "" : "Log in if needed, then come back here."}\n`
    )
  );

  while (true) {
    const raw = await ask(rl, chalk.bold.blue("You › ")).catch(() => "/exit");
    const input = raw.trim();

    if (!input) continue;

    if (input === "/exit") {
      await destroySession(botName);
      rl.close();
      break;
    }

    if (input === "/clear") {
      console.clear();
      printBanner(botName);
      continue;
    }

    if (input.startsWith("/bot ")) {
      const newBot = input.slice(5).trim();
      if (!BOT_NAMES.includes(newBot)) {
        console.log(chalk.red(`Unknown bot. Available: ${BOT_NAMES.join(", ")}`));
        continue;
      }
      console.log(chalk.yellow(`Switching to ${newBot}…`));
      await destroySession(botName);
      botName = newBot;
      await createSession(botName, { headless });
      console.log(chalk.green(`✔  Switched to ${botName}\n`));
      continue;
    }

    const spinner = ora({ text: chalk.gray("Waiting for response…"), spinner: "dots" }).start();

    try {
      const response = await sendPrompt(botName, input);
      spinner.stop();
      console.log(chalk.bold.green(`\n${botName} ›`));
      console.log(chalk.white(response));
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      console.log(chalk.yellow("Tip: the bot UI may have changed — check selectors.\n"));
    }
  }
}

runCLI();
