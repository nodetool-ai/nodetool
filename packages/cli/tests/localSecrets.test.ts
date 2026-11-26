import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { encrypt } from "@nodetool-ai/security-core";
import { createProgram } from "../src/lean/program.js";
import { legacySecretStorePaths, localSecretStorePath } from "../src/lean/localSecrets.js";

const masterKey = "0123456789abcdef0123456789abcdef";

interface Fixture {
  readonly root: string;
  readonly legacyDirectory: string;
  readonly legacyPath: string;
  readonly sharedPath: string;
  readonly env: NodeJS.ProcessEnv;
}

let fixture: Fixture;
beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "nodetool-cli-secrets-"));
  const legacyDirectory = join(root, "nodetool-data");
  fixture = {
    root, legacyDirectory,
    legacyPath: join(legacyDirectory, "nodetool.db"),
    sharedPath: join(root, "xdg", "nodetool", "nodetool.sqlite3"),
    // XDG_DATA_HOME places the shared store the way an unconfigured install does.
    env: { NODETOOL_DATA_DIR: legacyDirectory, XDG_DATA_HOME: join(root, "xdg"), APPDATA: join(root, "xdg"), SECRETS_MASTER_KEY: masterKey, PATH: "" }
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(fixture.root, { recursive: true, force: true });
});

async function seed(path: string, rows: Record<string, string>, key = masterKey, userId = "1"): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const repository = createSqliteRepository(path);
  try {
    for (const [name, value] of Object.entries(rows)) {
      await repository.put("secrets", userId, { key: name, description: "", encrypted_value: encrypt(key, userId, value) });
    }
  } finally { repository.close(); }
}

async function keys(path: string, userId = "1"): Promise<string[]> {
  const repository = createSqliteRepository(path);
  try { return (await repository.list("secrets", userId)).map(row => String(row.key)).sort(); } finally { repository.close(); }
}

async function providers(env: NodeJS.ProcessEnv): Promise<Array<{ id: string; usable: boolean; source: string | null }>> {
  const stdout: string[] = [];
  await createProgram({ env, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "providers", "list", "--all"]);
  return JSON.parse(stdout.join(""));
}

describe("local secret store", () => {
  it("is the database runs read, not the data directory the CLI used before", () => {
    expect(localSecretStorePath(fixture.env)).toBe(fixture.sharedPath);
    expect(localSecretStorePath({ ...fixture.env, DB_PATH: join(fixture.root, "custom.sqlite3") })).toBe(join(fixture.root, "custom.sqlite3"));
    expect(legacySecretStorePaths(fixture.env)).toEqual([fixture.legacyPath]);
  });

  it("copies legacy secrets into the shared store once and reports them as stored", async () => {
    await seed(fixture.legacyPath, { FAL_API_KEY: "fal-secret" });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const fal = (await providers(fixture.env)).find(state => state.id === "fal_ai");

    expect(fal).toMatchObject({ usable: true, source: "stored" });
    expect(await keys(fixture.sharedPath)).toEqual(["FAL_API_KEY"]);
    expect(await keys(fixture.legacyPath)).toEqual(["FAL_API_KEY"]);
    expect(String(stderr.mock.calls[0]?.[0])).toContain(`Copied 1 secret(s) (FAL_API_KEY) from ${fixture.legacyPath}`);
    expect(existsSync(`${fixture.legacyPath}.secrets-migrated.json`)).toBe(true);
  });

  it("hands the migrated secret to the resolver that `nodetool node run` uses", async () => {
    await seed(fixture.legacyPath, { FAL_API_KEY: "fal-secret" });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await providers(fixture.env);

    vi.stubEnv("SECRETS_MASTER_KEY", masterKey);
    const { initMigratedDb, getSecret, clearAllSecretCache, closeDb } = await import("@nodetool-ai/models");
    await initMigratedDb(fixture.sharedPath);
    try {
      clearAllSecretCache();
      expect(await getSecret("FAL_API_KEY", "1")).toBe("fal-secret");
    } finally { await closeDb(); }
  });

  it("keeps a value the shared store already has and does not copy a deleted secret back", async () => {
    await seed(fixture.legacyPath, { FAL_API_KEY: "old-fal", OPENAI_API_KEY: "old-openai" });
    await seed(fixture.sharedPath, { OPENAI_API_KEY: "current-openai" });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await providers(fixture.env);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Copied 1 secret(s) (FAL_API_KEY)");

    const shared = createSqliteRepository(fixture.sharedPath);
    try {
      const rows = await shared.list("secrets", "1");
      const openai = rows.find(row => row.key === "OPENAI_API_KEY");
      const { decrypt } = await import("@nodetool-ai/security-core");
      expect(decrypt(masterKey, "1", String(openai?.encrypted_value))).toBe("current-openai");
      const fal = rows.find(row => row.key === "FAL_API_KEY");
      await shared.delete("secrets", "1", String(fal?.id));
    } finally { shared.close(); }

    await providers(fixture.env);
    expect(await keys(fixture.sharedPath)).toEqual(["OPENAI_API_KEY"]);
  });

  it("reports a stored key that SECRETS_MASTER_KEY cannot decrypt as unusable", async () => {
    await seed(fixture.sharedPath, { FAL_API_KEY: "fal-secret" }, "another-master-key-another-master-key");

    const fal = (await providers(fixture.env)).find(state => state.id === "fal_ai");

    expect(fal).toMatchObject({ usable: false, source: null });
  });

  it("counts stored names without a master key, because a run may read it from the keychain", async () => {
    await seed(fixture.sharedPath, { FAL_API_KEY: "fal-secret" });
    const { SECRETS_MASTER_KEY: _omitted, ...env } = fixture.env;

    const fal = (await providers(env)).find(state => state.id === "fal_ai");

    expect(fal).toMatchObject({ usable: true, source: "stored" });
  });

  it("writes `secrets set` to the shared store", async () => {
    vi.spyOn(process, "stdin", "get").mockReturnValue(Object.assign(Readable.from(["fal-secret\n"]), { isTTY: false }) as unknown as typeof process.stdin);
    const stdout: string[] = [];

    await createProgram({ env: fixture.env, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "secrets", "set", "FAL_API_KEY"]);

    expect(await keys(fixture.sharedPath)).toEqual(["FAL_API_KEY"]);
    expect(existsSync(fixture.legacyPath)).toBe(false);
    expect(stdout.join("")).not.toContain("fal-secret");
  });

  it("does not create the shared store to answer a read", async () => {
    const stdout: string[] = [];
    await createProgram({ env: fixture.env, stdout: text => stdout.push(text) }).parseAsync(["node", "nodetool", "secrets", "list"]);
    expect(JSON.parse(stdout.join(""))).toEqual([]);
    expect(existsSync(fixture.sharedPath)).toBe(false);
  });
});
