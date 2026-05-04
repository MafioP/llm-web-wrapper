// src/adapters/base.js — shared adapter interface

export class BaseAdapter {
  constructor() {
    if (new.target === BaseAdapter) {
      throw new Error("BaseAdapter is abstract");
    }
  }

  // Must be set by subclass
  url = null;
  inputSelector = null;
  submitSelector = null;

  async typePrompt(page, text) {
    await page.click(this.inputSelector);
    await page.evaluate((selector, t) => {
      const el = document.querySelector(selector);
      el.focus();
      // For contenteditable divs (Claude)
      el.innerText = t;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: t }));
    }, this.inputSelector, text);
  }

  // Subclasses must implement these
  async waitForResponse(_page) {
    throw new Error("waitForResponse() not implemented");
  }

  async extractResponse(_page) {
    throw new Error("extractResponse() not implemented");
  }
}
