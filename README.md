# 🤖 llm-web-wrapper

Puppeteer-powered interface for chatting with AI chatbots (ChatGPT, Claude, Gemini) — with stealth mode, a REST API server, and a terminal CLI.

## Setup

```bash
npm install
cp .env.example .env
```

---

## Deployment (Docker + linux server)

### 1. Run the deploy script

The deploy script installs all dependencies (Xvfb, x11vnc, Docker), sets up systemd services for the virtual display, and builds and starts the container.

```bash
chmod +x deploy.sh
bash deploy.sh
```

At the end it prints your API URL and VNC address.

### 2. Log in to each bot via VNC

Since Cloudflare blocks headless browsers, the container runs against a virtual display (Xvfb) that looks like a real headed browser. You need to log in to each bot once so the session is saved.

Connect to the VNC server from your machine using any VNC client (RealVNC, TigerVNC, etc.):

```
<your-lxc-ip>:5900
```

Once connected, open Chromium on the virtual display:

```bash
DISPLAY=:99 chromium --no-sandbox &
```

Then for each bot:

1. Go to the bot's URL (`https://chatgpt.com`, `https://claude.ai`, `https://gemini.google.com`)
2. Solve any Cloudflare challenge
3. Log in normally
4. Close Chromium

### 3. Copy the saved profiles

```bash
cp -r ~/.config/chromium/Default ./profiles/chatgpt
cp -r ~/.config/chromium/Default ./profiles/claude
cp -r ~/.config/chromium/Default ./profiles/gemini
```

### 4. Restart the container

```bash
docker compose restart
```

The container will now use the saved sessions — no login or Cloudflare challenge needed on future restarts.

### Useful commands

```bash
# View logs
docker compose logs -f

# Restart
docker compose restart

# Stop
docker compose down

# Rebuild after code changes
docker compose build --no-cache && docker compose up -d

# Clear Singleton locks manually if needed
rm -f profiles/*/Singleton*
```

---

## API Server

```bash
# local development
npm start
# → http://localhost:3000
```

### Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/api/bots` | — | List available bots |
| `GET` | `/api/sessions` | — | List active sessions |
| `POST` | `/api/sessions/:bot` | — | Start a session |
| `DELETE` | `/api/sessions/:bot` | — | Destroy a session |
| `DELETE` | `/api/sessions` | — | Destroy all sessions |
| `POST` | `/api/prompt` | `{ bot, message }` | Send a prompt |

### Example

```bash
# Send a prompt
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{ "bot": "chatgpt", "message": "What is the capital of France?" }'

# Response
{ "ok": true, "bot": "chatgpt", "response": "The capital of France is Paris." }
```

```js
// JavaScript fetch
const res = await fetch("http://localhost:3000/api/prompt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bot: "chatgpt", message: "Hello!" }),
});
const { response } = await res.json();
```

---

## CLI

```bash
# Start with ChatGPT (default)
npm run cli

# Start with a specific bot
npm run cli:chatgpt
npm run cli:claude
npm run cli:gemini

# Headless (requires saved session in profiles/)
node cli.js chatgpt --headless
```

### Commands

| Command | Action |
|---|---|
| `(any text)` | Send as a prompt to the current bot |
| `/bot <name>` | Switch bot mid-session |
| `/clear` | Clear the terminal |
| `/exit` | Close browser and quit |

---

## Configuration — `.env`

```bash
PORT=3000
HEADLESS=false   # always false when using Xvfb
```

---

## Project structure

```
llm-web-wrapper/
├── src/
│   ├── server.js          # Express app and graceful shutdown
│   ├── router.js          # API route definitions
│   ├── sessionManager.js  # browser lifecycle, one session per bot
│   ├── queue.js           # per-bot request queue
│   └── adapters/
│       ├── base.js        # shared interface and typePrompt/submitPrompt
│       ├── index.js       # adapter registry
│       ├── claude.js
│       ├── chatgpt.js
│       └── gemini.js
├── cli.js                 # terminal IO entry point
├── deploy.sh              # LXC deployment script
├── Dockerfile
├── docker-compose.yml
├── profiles/              # saved browser sessions (gitignored)
├── .env
└── package.json
```

---

## Adding a new bot

Create a new file in `src/adapters/`:

```js
// src/adapters/mybot.js
import { BaseAdapter } from "./base.js";

export class MyBotAdapter extends BaseAdapter {
  url = "https://example-chatbot.com";
  inputSelector = "textarea#input";
  submitSelector = 'button[type="submit"]';

  async waitForResponse(page) {
    await page.waitForSelector(".loading", { timeout: 10_000 });
    await page.waitForSelector(".loading", { hidden: true, timeout: 120_000 });
  }

  async extractResponse(page) {
    const msgs = await page.$$eval(".response", (els) =>
      els.map((e) => e.innerText.trim())
    );
    return msgs.at(-1) ?? "(no response found)";
  }
}
```

Then register it in `src/adapters/index.js`:

```js
import { MyBotAdapter } from "./mybot.js";

export const ADAPTERS = {
  // ...existing adapters
  mybot: new MyBotAdapter(),
};
```

---

## Notes

- Selectors may break when chatbot UIs update — inspect the DOM and update them if needed
- Concurrent requests to the same bot are queued automatically
- Singleton lock files are cleared automatically on every container start
- The virtual display (Xvfb) makes the browser appear headed to Cloudflare without needing a real monitor
- `puppeteer-extra-plugin-stealth` patches ~20 browser fingerprinting vectors
