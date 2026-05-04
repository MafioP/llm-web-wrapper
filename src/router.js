// src/router.js — API route definitions
import { Router } from "express";
import { enqueue } from "./queue.js";
import {
  sendPrompt,
  createSession,
  destroySession,
  getActiveSessions,
  destroyAllSessions,
  getSession,
} from "./sessionManager.js";
import { BOT_NAMES } from "./adapters/index.js";

const router = Router();

// ── GET /bots — list available bots ─────────────────────────────────────────
router.get("/bots", (_req, res) => {
  res.json({ bots: BOT_NAMES });
});

// ── GET /sessions — list active sessions ────────────────────────────────────
router.get("/sessions", (_req, res) => {
  res.json({ active: getActiveSessions() });
});

// ── POST /sessions/:bot — start a session ───────────────────────────────────
router.post("/sessions/:bot", async (req, res) => {
  const { bot } = req.params;
  try {
    await createSession(bot);
    res.json({ ok: true, bot });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── DELETE /sessions/:bot — destroy a session ───────────────────────────────
router.delete("/sessions/:bot", async (req, res) => {
  const { bot } = req.params;
  await destroySession(bot);
  res.json({ ok: true, bot });
});

// ── DELETE /sessions — destroy all sessions ─────────────────────────────────
router.delete("/sessions", async (_req, res) => {
  await destroyAllSessions();
  res.json({ ok: true });
});

router.get("/screenshot/:bot", async (req, res) => {
  const session = await getSession(req.params.bot);
  const buf = await session.page.screenshot({ encoding: "binary" });
  res.setHeader("Content-Type", "image/png");
  res.send(buf);
});

// ── POST /prompt — send a prompt ────────────────────────────────────────────
// Body: { bot: "chatgpt" | "claude" | "gemini", message: "..." }
router.post("/prompt", async (req, res) => {
  const { bot, message } = req.body;

  if (!bot || !message) {
    return res.status(400).json({ ok: false, error: "bot and message are required" });
  }

  if (!BOT_NAMES.includes(bot)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown bot "${bot}". Available: ${BOT_NAMES.join(", ")}`,
    });
  }

  try {
    const response = await enqueue(bot, () => sendPrompt(bot, message));
    res.json({ ok: true, bot, response });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
