// src/queue.js — serializes concurrent requests per bot
// Each bot gets its own queue so requests don't stomp on each other.

const queues = new Map(); // botName → Promise (tail of the chain)

export function enqueue(botName, fn) {
  const prev = queues.get(botName) ?? Promise.resolve();

  const next = prev.then(fn).catch((err) => {
    // Don't let one failed request break the queue chain
    throw err;
  });

  // Store the "settled" tail so the queue doesn't grow forever
  queues.set(
    botName,
    next.catch(() => {})
  );

  return next;
}
