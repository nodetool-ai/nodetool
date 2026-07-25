#!/usr/bin/env node
/**
 * Prepare a usable `.env` for local development.
 *
 * Creates `.env` from `.env.example` when missing, then ensures
 * `SECRETS_MASTER_KEY` is set. Without that key the server resolves the master
 * key through the system keychain, which has no backend on a headless Linux
 * box (Docker, CI, a dev container) — keytar fails to load and startup aborts.
 *
 * Idempotent: an existing key is never overwritten, so secrets already
 * encrypted under it stay readable.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");

const created = !existsSync(envPath);
if (created) {
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
  } else {
    appendFileSync(envPath, "");
  }
  console.log("created .env" + (existsSync(examplePath) ? " from .env.example" : ""));
}

// Only an uncommented assignment counts — .env.example ships the key commented out.
const hasKey = readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .some((line) => /^\s*(export\s+)?SECRETS_MASTER_KEY\s*=\s*\S/.test(line));

if (hasKey || process.env.SECRETS_MASTER_KEY) {
  process.exit(0);
}

const key = randomBytes(32).toString("base64");
appendFileSync(
  envPath,
  `\n# Generated for local development so the server does not need a system keychain.\n` +
    `# Keep it: secrets stored locally are encrypted with this key.\n` +
    `SECRETS_MASTER_KEY=${key}\n`
);
console.log("generated SECRETS_MASTER_KEY in .env");
