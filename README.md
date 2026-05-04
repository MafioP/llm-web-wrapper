# 🤖 Chatbot CLI

Puppeteer-powered terminal interface for chatting with AI chatbots (ChatGPT, Claude, Gemini) — with stealth mode to avoid bot detection.

## Setup

```bash
npm install
```

## Usage

```bash
# Start with ChatGPT (default)
npm start

# Start with a specific bot
npm run cli:claude
npm run cli:chatgpt
npm run cli:gemini

# Or directly:
node chatbot.js claude
node chatbot.js chatgpt --headless
```

## First run — logging in

The browser opens in **headed mode** by default and saves your session to `./profiles/<botname>/`. On first launch:

1. The browser window opens
2. Log in normally in the browser
3. Come back to the terminal and start typing prompts
4. Your session is saved — next launches skip login

## Terminal commands

| Command | Action |
|---|---|
| `(any text)` | Send as a prompt to the current bot |
| `/bot chatgpt` | Switch to ChatGPT mid-session |
| `/bot claude` | Switch to Claude mid-session |
| `/bot gemini` | Switch to Gemini mid-session |
| `/clear` | Clear the terminal |
| `/exit` | Close browser and quit |

## Options

| Flag | Effect |
|---|---|
| `--headless` | Run browser invisibly (requires saved session) |

## Supported bots

| Name | URL |
|---|---|
| `chatgpt` | chatgpt.com |
| `claude` | claude.ai |
| `gemini` | gemini.google.com |

## Adding a new bot

Add an entry to the `ADAPTERS` object in `chatbot.js`:

```js
mybот: {
  url: "https://example-chatbot.com",
  inputSelector: "textarea#input",
  submitSelector: 'button[type="submit"]',

  async typePrompt(page, text) {
    await page.click(this.inputSelector);
    await page.keyboard.type(text, { delay: 15 });
  },

  async waitForResponse(page) {
    await page.waitForSelector(".loading", { timeout: 10_000 });
    await page.waitForSelector(".loading", { hidden: true, timeout: 120_000 });
  },

  async extractResponse(page) {
    const msgs = await page.$$eval(".response", els => els.map(e => e.innerText));
    return msgs.at(-1) ?? "";
  },
},
```

## Notes

- Selectors may break when chatbot UIs update — inspect the DOM and update selectors if needed
- Add delays between rapid prompts to avoid rate limits
- `puppeteer-extra-plugin-stealth` patches ~20 browser fingerprinting vectors
