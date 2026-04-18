#!/usr/bin/env node
/**
 * Diagnose secret decryption across all rows, with zero deps.
 *
 * Uses: `sqlite3` CLI (preinstalled on macOS) and `security` CLI (macOS keychain).
 *
 * Usage:
 *   node scripts/diagnose-secret.mjs              # check every row
 *   node scripts/diagnose-secret.mjs KIE_API_KEY  # filter by key
 *
 * Env overrides:
 *   NODETOOL_DB_PATH    path to sqlite DB (default ~/.local/share/nodetool/nodetool.sqlite3)
 *   SECRETS_MASTER_KEY  override master key (skip keychain)
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  pbkdf2Sync,
  createDecipheriv,
  createHmac,
  timingSafeEqual
} from "node:crypto";

const [, , keyFilter] = process.argv;

const dbPath =
  process.env.NODETOOL_DB_PATH ??
  join(homedir(), ".local/share/nodetool/nodetool.sqlite3");

// ---- [1] DB ----
console.log(`[1] DB path: ${dbPath}`);
if (!existsSync(dbPath)) {
  console.error("    ✗ DB file does not exist");
  process.exit(1);
}
console.log("    ✓ exists");

function sql(query) {
  return execFileSync(
    "sqlite3",
    ["-readonly", "-separator", "\t", dbPath, query],
    { encoding: "utf-8" }
  ).trim();
}

// ---- [2] Master key ----
console.log(`\n[2] Resolving master key`);
let masterKey = process.env.SECRETS_MASTER_KEY;
let source = "env SECRETS_MASTER_KEY";
if (!masterKey) {
  try {
    masterKey = execFileSync(
      "security",
      [
        "find-generic-password",
        "-s",
        "nodetool",
        "-a",
        "secrets_master_key",
        "-w"
      ],
      { encoding: "utf-8" }
    ).trim();
    source = "macOS keychain";
  } catch (err) {
    console.error(`    ✗ keychain read failed: ${err.message}`);
    console.error(
      `    (item service='nodetool' account='secrets_master_key' not found or access denied)`
    );
    process.exit(1);
  }
}
console.log(`    source: ${source}`);
console.log(`    length: ${masterKey.length} chars`);
console.log(`    fingerprint: ${masterKey.slice(0, 6)}…${masterKey.slice(-4)}`);

// ---- [3] Fetch rows ----
console.log(`\n[3] Scanning nodetool_secrets`);
const where = keyFilter
  ? `WHERE key='${keyFilter.replace(/'/g, "''")}'`
  : "";
const raw = sql(
  `SELECT user_id, key, encrypted_value, created_at FROM nodetool_secrets ${where} ORDER BY user_id, key;`
);
if (!raw) {
  console.log(
    keyFilter
      ? `    (no rows for key='${keyFilter}')`
      : `    (table is empty)`
  );
  process.exit(0);
}
const rows = raw.split("\n").map((line) => {
  const [user_id, key, encrypted_value, created_at] = line.split("\t");
  return { user_id, key, encrypted_value, created_at };
});
console.log(`    rows: ${rows.length}`);

// ---- [4] Decrypt each ----
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function tryAesGcm(userId, ct) {
  const key = pbkdf2Sync(
    masterKey,
    Buffer.from(userId, "utf-8"),
    100_000,
    32,
    "sha256"
  );
  const packed = Buffer.from(ct, "base64");
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH)
    throw new Error("data too short");
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const body = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(authTag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf-8");
}

function tryFernet(userId, ct) {
  const derived = pbkdf2Sync(
    Buffer.from(masterKey, "utf-8"),
    Buffer.from(userId, "utf-8"),
    100_000,
    32,
    "sha256"
  );
  const hmacKey = derived.subarray(0, 16);
  const aesKey = derived.subarray(16, 32);
  const b64 = ct.replace(/-/g, "+").replace(/_/g, "/");
  const token = Buffer.from(
    b64 + "=".repeat((4 - (b64.length % 4)) % 4),
    "base64"
  );
  if (token.length < 1 + 8 + 16 + 32) throw new Error("token too short");
  if (token[0] !== 0x80)
    throw new Error(`bad version byte: 0x${token[0].toString(16)}`);
  const tokenBody = token.subarray(0, token.length - 32);
  const tokenHmac = token.subarray(token.length - 32);
  const expected = createHmac("sha256", hmacKey).update(tokenBody).digest();
  if (!timingSafeEqual(expected, tokenHmac)) throw new Error("HMAC mismatch");
  const iv = tokenBody.subarray(9, 25);
  const payload = tokenBody.subarray(25);
  const d = createDecipheriv("aes-128-cbc", aesKey, iv);
  return Buffer.concat([d.update(payload), d.final()]).toString("utf-8");
}

console.log(`\n[4] Decryption results`);
const header = `    ${"user_id".padEnd(10)} ${"key".padEnd(28)} ${"cipher".padEnd(8)} result`;
console.log(header);
console.log("    " + "-".repeat(header.length - 4));

let okCount = 0;
let failCount = 0;
const failures = [];

for (const { user_id, key, encrypted_value } of rows) {
  let result = "";
  let cipher = "";
  try {
    const v = tryAesGcm(user_id, encrypted_value);
    result = `✓ len=${v.length}`;
    cipher = "AES-GCM";
    okCount++;
  } catch (err1) {
    try {
      const v = tryFernet(user_id, encrypted_value);
      result = `✓ len=${v.length}`;
      cipher = "Fernet";
      okCount++;
    } catch (err2) {
      result = `✗ ${err2.message}`;
      cipher = "none";
      failCount++;
      failures.push({ user_id, key, aes: err1.message, fernet: err2.message });
    }
  }
  console.log(
    `    ${user_id.padEnd(10)} ${key.padEnd(28)} ${cipher.padEnd(8)} ${result}`
  );
}

console.log(`\n[5] Summary: ${okCount} ok, ${failCount} failed`);
if (failCount > 0) {
  console.log(
    `\n→ Failing rows have a ciphertext that the current master key cannot decrypt.\n` +
      `  Likely causes: keychain reset/reinstall, different macOS user, or Python-written\n` +
      `  Fernet token whose master key differs from the TS keychain entry.\n` +
      `  Workaround: re-enter affected secrets in Settings → Secrets.`
  );
  for (const f of failures) {
    console.log(
      `    - ${f.user_id}/${f.key}  aes=${f.aes}  fernet=${f.fernet}`
    );
  }
  process.exit(1);
}
