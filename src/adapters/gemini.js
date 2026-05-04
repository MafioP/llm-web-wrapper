// src/adapters/gemini.js
import { BaseAdapter } from "./base.js";

export class GeminiAdapter extends BaseAdapter {
  url = "https://gemini.google.com/app";
  inputSelector = "rich-textarea .ql-editor";
  submitSelector = 'button[aria-label="Send message"]';

  async waitForResponse(page) {
    await page.waitForSelector(".loading-indicator", { timeout: 10_000 });
    await page.waitForSelector(".loading-indicator", {
      hidden: true,
      timeout: 120_000,
    });
  }

  async extractResponse(page) {
    const messages = await page.$$eval(
      "model-response .markdown",
      (els) => els.map((el) => el.innerText.trim())
    );
    return messages.at(-1) ?? "(no response found)";
  }
}
