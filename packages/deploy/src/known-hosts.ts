/**
 * Host key verification against OpenSSH `known_hosts` files.
 *
 * A deploy sends the SSH password (when one is configured) and a `docker run`
 * line carrying `SECRETS_MASTER_KEY` and `SERVER_AUTH_TOKEN`. Without a host
 * key check, anyone who can intercept the connection receives both, so an
 * unknown key fails the connection instead of being accepted.
 */

import { createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** `~/.ssh/known_hosts`, the file `ssh` itself writes. */
export function defaultKnownHostsPath(): string {
  return path.join(os.homedir(), ".ssh", "known_hosts");
}

/** The name `ssh` records a host under: `host`, or `[host]:port` off port 22. */
function hostEntryName(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}

/** Whether one known_hosts host field (comma list or `|1|salt|hash`) names the host. */
function hostFieldMatches(field: string, name: string): boolean {
  if (field.startsWith("|1|")) {
    const [, , salt, hash] = field.split("|");
    if (!salt || !hash) return false;
    const digest = createHmac("sha1", Buffer.from(salt, "base64"))
      .update(name)
      .digest("base64");
    return digest === hash;
  }
  return field
    .split(",")
    .some((pattern) => pattern.toLowerCase() === name.toLowerCase());
}

/**
 * Whether `key` (the server's public key blob, as ssh2 hands it to
 * `hostVerifier`) is recorded for `host` in the known_hosts text. Wildcard
 * patterns, negations and `@cert-authority` lines are not supported, and a
 * `@revoked` line for the key refuses it.
 */
export function isKnownHostKey(
  knownHosts: string,
  host: string,
  port: number,
  key: Buffer
): boolean {
  const name = hostEntryName(host, port);
  const keyBase64 = key.toString("base64");
  let known = false;
  for (const raw of knownHosts.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(/\s+/);
    const marker = fields[0]?.startsWith("@") ? fields.shift() : undefined;
    const [hosts, , blob] = fields;
    if (!hosts || !blob || !hostFieldMatches(hosts, name)) continue;
    if (blob !== keyBase64) continue;
    if (marker === "@revoked") return false;
    if (marker === undefined) known = true;
  }
  return known;
}

/** Read the known_hosts file, or "" when it does not exist. */
export function readKnownHosts(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}
