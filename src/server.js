// src/server.js — Express app entry point
import "dotenv/config";
import express from "express";
import router from "./router.js";
import { destroyAllSessions } from "./sessionManager.js";

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(express.json());
app.use("/api", router);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown() {
  console.log("\nShutting down — closing all browser sessions…");
  await destroyAllSessions();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(PORT, () => {
  console.log(`🤖 llm-web-wrapper API running on http://localhost:${PORT}`);
  console.log(`   POST /api/prompt  { bot, message }`);
  console.log(`   GET  /api/bots`);
  console.log(`   GET  /api/sessions`);
});
