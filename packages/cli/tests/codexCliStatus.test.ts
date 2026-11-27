import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { providerStates } from "../src/lean/providerStatus.js";

const directories: string[] = [];
function home(auth?: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-codex-status-"));
  directories.push(directory);
  if (auth !== undefined) {
    mkdirSync(join(directory, ".codex"));
    writeFileSync(join(directory, ".codex", "auth.json"), JSON.stringify(auth));
  }
  return directory;
}
function codex(env: NodeJS.ProcessEnv, storedKeys: ReadonlySet<string> = new Set()) {
  return providerStates({ env, storedKeys, installedPacks: new Set() }).find(provider => provider.id === "codex");
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("codex provider status", () => {
  it("is usable with the Codex CLI's ChatGPT login", () => {
    expect(codex({ HOME: home({ tokens: { access_token: "a", refresh_token: "r" } }), PATH: "" }))
      .toMatchObject({ usable: true, source: "codex CLI" });
  });
  it("reads the login from CODEX_HOME", () => {
    const codexHome = home();
    writeFileSync(join(codexHome, "auth.json"), JSON.stringify({ tokens: { access_token: "a" } }));
    expect(codex({ HOME: home(), CODEX_HOME: codexHome, PATH: "" })).toMatchObject({ usable: true, source: "codex CLI" });
  });
  it.each([
    ["no login file", undefined],
    ["an API-key login", { OPENAI_API_KEY: "sk-fixture", tokens: null }],
    ["an empty access token", { tokens: { access_token: "" } }]
  ])("is not usable with %s", (_name, auth) => {
    expect(codex({ HOME: home(auth), PATH: "" })).toMatchObject({ usable: false, source: null });
  });
  it("prefers CODEX_ACCESS_TOKEN over the Codex CLI login", () => {
    expect(codex({ HOME: home({ tokens: { access_token: "a" } }), PATH: "", CODEX_ACCESS_TOKEN: "t" }))
      .toMatchObject({ usable: true, source: "env" });
  });
});
