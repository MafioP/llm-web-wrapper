// src/queue.js — serializes concurrent requests per bot
// Each bot gets its own queue so requests don't stomp on each other.

const queues = new Map(); // botName → Promise (tail of the chain)

export function enqueue(botName, sessionIndex, fn) {
  const key = `${botName}:${sessionIndex}`;
  const prev = queues.get(key) ?? Promise.resolve();

  const next = prev.then(() => fn()); // ← call fn() explicitly, ignore prev value

  queues.set(key, next.catch(() => { }));
  return next;
}
