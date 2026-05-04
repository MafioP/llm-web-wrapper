// src/adapters/claude.js
import { BaseAdapter } from "./base.js";

export class ClaudeAdapter extends BaseAdapter {
  url = "https://claude.ai/new";
  inputSelector = 'div[contenteditable="true"]';
  submitSelector = 'button[aria-label="Send message"]';

  async waitForResponse(page) {
    await page.waitForSelector('button[aria-label="Stop response"]', {
      timeout: 10_000,
    });
    await page.waitForSelector('button[aria-label="Stop response"]', {
      hidden: true,
      timeout: 120_000,
    });
  }

  async extractResponse(page) {
    const messages = await page.$$eval(
      ".font-claude-response",
      (els) => els.map((el) => el.innerText.trim())
    );
    return messages.at(-1) ?? "(no response found)";
  }
}
