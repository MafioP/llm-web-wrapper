// src/adapters/index.js — registry of all available adapters
import { ClaudeAdapter } from "./claude.js";
import { ChatGPTAdapter } from "./chatgpt.js";
import { GeminiAdapter } from "./gemini.js";

export const ADAPTERS = {
  claude: new ClaudeAdapter(),
  chatgpt: new ChatGPTAdapter(),
  gemini: new GeminiAdapter(),
};

export function getAdapter(botName) {
  const adapter = ADAPTERS[botName];
  if (!adapter) {
    throw new Error(
      `Unknown bot "${botName}". Available: ${Object.keys(ADAPTERS).join(", ")}`
    );
  }
  return adapter;
}

export const BOT_NAMES = Object.keys(ADAPTERS);
