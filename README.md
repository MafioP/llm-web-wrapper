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

---

## Docker deployment

### Prerequisites

Before running in Docker you need saved login sessions, since there is no display available. Run locally first for each bot you want to use:

```bash
HEADLESS=false node cli.js chatgpt
# log in, then /exit
HEADLESS=false node cli.js claude
# log in, then /exit
```

This saves sessions to `./profiles/` which is mounted into the container.

### Build and run

```bash
docker compose up --build
```

### Run in background

```bash
docker compose up --build -d

# Check logs
docker compose logs -f

# Stop
docker compose down
```

### Configuration

Set environment variables in `docker-compose.yml` or a `.env` file alongside it:

```bash
PORT=3000       # host port to expose
```

`HEADLESS` is always forced to `true` inside the container — there is no display.

### Notes

- `./profiles/` is mounted as a volume so login sessions survive restarts
- Chromium uses system shared memory — the `shm_size: 1gb` in the compose file prevents random crashes
- The container uses the system-installed Chromium rather than Puppeteer's bundled one, keeping the image smaller
