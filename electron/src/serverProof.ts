import { app } from "electron";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import { serverState } from "./state";

/**
 * Header names of the /health proof. Must match `SERVER_PROOF_NONCE_HEADER`
 * and `SERVER_PROOF_HEADER` in packages/websocket/src/routes/health.ts.
 */
export const SERVER_PROOF_NONCE_HEADER = "x-nodetool-proof-nonce";
export const SERVER_PROOF_HEADER = "x-nodetool-proof";

const SECRET_FILE_NAME = "server-proof.key";
const SECRET_PATTERN = /^[0-9a-f]{64}$/;

let secret: string | null = null;
/** The port of the local server this app started, or one that proved itself. */
let trustedPort: number | null = null;

/**
 * A secret kept in the user data folder, readable by this OS user only. The
 * backend receives it as `NODETOOL_SERVER_PROOF_KEY`. It outlives a launch,
 * so a backend left running by an earlier session can still prove itself.
 */
export function getServerProofSecret(): string {
  if (secret) {
    return secret;
  }
  const file = path.join(app.getPath("userData"), SECRET_FILE_NAME);
  try {
    const stored = fs.readFileSync(file, "utf8").trim();
    if (SECRET_PATTERN.test(stored)) {
      if (process.platform !== "win32") {
        fs.chmodSync(file, 0o600);
      }
      secret = stored;
      return stored;
    }
  } catch {
    // Missing or unreadable: write a new one below.
  }
  const fresh = randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fresh, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") {
    fs.chmodSync(file, 0o600);
  }
  secret = fresh;
  return fresh;
}

/** Must match `serverProofFor` in packages/websocket/src/routes/health.ts. */
export function serverProofFor(key: string, port: number, nonce: string): string {
  return createHmac("sha256", key).update(`nodetool-health:${port}:${nonce}`).digest("hex");
}

/** Whether `proof` is the proof for `nonce` on `port`, compared in constant time. */
export function serverProofMatches(port: number, nonce: string, proof: string | null): boolean {
  if (!proof) {
    return false;
  }
  const expected = Buffer.from(serverProofFor(getServerProofSecret(), port, nonce), "utf8");
  const actual = Buffer.from(proof, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Asks the server on `port` for /health with a fresh nonce. `verified` is true
 * only when the server answered 200 with the proof for that nonce, which only
 * a backend started with this user's secret can give.
 */
export async function probeServerProof(
  port: number,
  timeoutMs: number = 2000,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; verified: boolean }> {
  const nonce = randomBytes(24).toString("hex");
  const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
    headers: { [SERVER_PROOF_NONCE_HEADER]: nonce },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    ok: response.ok,
    verified: response.ok && serverProofMatches(port, nonce, response.headers.get(SERVER_PROOF_HEADER)),
  };
}

export function setTrustedServerPort(port: number | null): void {
  trustedPort = port;
}

/**
 * The origin of the local server, only while it is the server this app
 * started or one that proved itself. Tokens and cloud transfers go nowhere else.
 */
export function trustedLocalOrigin(): string | null {
  const port = serverState.isStarted ? serverState.serverPort : undefined;
  return port && port === trustedPort ? `http://127.0.0.1:${port}` : null;
}
