#!/usr/bin/env node

/**
 * Block until the backend health endpoint responds (or time out).
 * Used by `npm run dev` so Vite does not spam proxy errors while tsx bootstraps.
 */

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 7777);
const url = `http://${host}:${port}/health`;
const maxWaitMs = 120_000;
const pollMs = 400;

function isBenignFetchError(err) {
  const code = err?.cause?.code ?? err?.code;
  return code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ETIMEDOUT";
}

async function ready() {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch (err) {
    if (!isBenignFetchError(err)) {
      throw err;
    }
    return false;
  }
}

const started = Date.now();
while (Date.now() - started < maxWaitMs) {
  if (await ready()) {
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

console.warn(
  `Backend not ready at ${url} after ${Math.round(maxWaitMs / 1000)}s — starting Vite anyway`
);
