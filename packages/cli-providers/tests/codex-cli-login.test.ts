import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODEX_OAUTH_CLIENT_ID, CODEX_OAUTH_TOKEN_URL } from "@nodetool-ai/protocol";
import {
  codexCliAuthPath,
  resolveCodexCliAccessToken
} from "../src/codex-cli-login.js";

const NOW = Date.parse("2026-11-27T12:00:00Z");

function jwt(expSeconds: number): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ exp: expSeconds })}.`;
}

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-codex-login-"));
  path = join(directory, "auth.json");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function writeAuth(accessToken: string): Promise<void> {
  await writeFile(path, JSON.stringify({
    OPENAI_API_KEY: null,
    tokens: { id_token: "id-old", access_token: accessToken, refresh_token: "refresh-old", account_id: "acct" },
    last_refresh: "2026-11-01T00:00:00Z"
  }));
}

describe("codexCliAuthPath", () => {
  it("uses CODEX_HOME, else ~/.codex", () => {
    expect(codexCliAuthPath({ CODEX_HOME: "/codex" })).toBe(join("/codex", "auth.json"));
    expect(codexCliAuthPath({ HOME: "/home/u" })).toBe(join("/home/u", ".codex", "auth.json"));
  });
});

describe("resolveCodexCliAccessToken", () => {
  it("returns null without a login file or for an API-key login", async () => {
    await expect(resolveCodexCliAccessToken({ path })).resolves.toBeNull();
    await writeFile(path, JSON.stringify({ OPENAI_API_KEY: "sk-fixture", tokens: null }));
    await expect(resolveCodexCliAccessToken({ path })).resolves.toBeNull();
  });

  it("returns a valid access token without refreshing it", async () => {
    const token = jwt(NOW / 1000 + 3600);
    await writeAuth(token);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(resolveCodexCliAccessToken({ path, fetchImpl, now: () => NOW })).resolves.toBe(token);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes an expired token once and writes the rotated tokens back", async () => {
    await writeAuth(jwt(NOW / 1000 - 10));
    const fresh = jwt(NOW / 1000 + 3600);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ access_token: fresh, refresh_token: "refresh-new", id_token: "id-new" }), { status: 200 })
    );

    const results = await Promise.all([
      resolveCodexCliAccessToken({ path, fetchImpl, now: () => NOW }),
      resolveCodexCliAccessToken({ path, fetchImpl, now: () => NOW })
    ]);

    expect(results).toEqual([fresh, fresh]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(CODEX_OAUTH_TOKEN_URL);
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh-old",
      client_id: CODEX_OAUTH_CLIENT_ID
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      OPENAI_API_KEY: null,
      tokens: { id_token: "id-new", access_token: fresh, refresh_token: "refresh-new", account_id: "acct" },
      last_refresh: new Date(NOW).toISOString()
    });
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("returns the stored token when the refresh is refused", async () => {
    const expired = jwt(NOW / 1000 - 10);
    await writeAuth(expired);
    const before = await readFile(path, "utf8");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 401 }));
    await expect(resolveCodexCliAccessToken({ path, fetchImpl, now: () => NOW })).resolves.toBe(expired);
    expect(await readFile(path, "utf8")).toBe(before);
  });
});
