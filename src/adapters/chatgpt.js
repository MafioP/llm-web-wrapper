// src/adapters/chatgpt.js
import { BaseAdapter } from "./base.js";

export class ChatGPTAdapter extends BaseAdapter {
  url = "https://chatgpt.com/";
  inputSelector = "#prompt-textarea";
  submitSelector = 'button[data-testid="send-button"]';

  async waitForResponse(page) {
    await page.waitForSelector('[data-testid="stop-button"]', {
      timeout: 10_000,
    });
    await page.waitForSelector('[data-testid="stop-button"]', {
      hidden: true,
      timeout: 120_000,
    });
  }

  async extractResponse(page) {
    const messages = await page.$$eval(
      '[data-message-author-role="assistant"] .markdown',
      (els) => els.map((el) => el.innerText.trim())
    );
    return messages.at(-1) ?? "(no response found)";
  }
}
