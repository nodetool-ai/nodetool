import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";
import { encrypt } from "@nodetool-ai/security-core";
import { parseEnvFile } from "@nodetool-ai/config";
import { createProgram, runCli } from "../src/lean/program.js";
import { extractEnvFileFlag, loadCliEnvironment } from "../src/lean/envFiles.js";
import { ENV_CATALOGUE, envTemplate } from "../src/lean/envCatalogue.js";
import { localSecretStorePath } from "../src/lean/localSecrets.js";
import type { EnvCheckReport } from "../src/lean/envCommands.js";

const masterKey = "0123456789abcdef0123456789abcdef";

let root: string;
let home: string;
let project: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nodetool-cli-env-"));
  home = join(root, "home");
  project = join(root, "project");
  await mkdir(join(home, ".nodetool"), { recursive: true });
  await mkdir(project, { recursive: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

/** An environment with no ambient variables: the store under the fixture, no PATH lookups. */
function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { HOME: home, XDG_DATA_HOME: join(root, "xdg"), APPDATA: join(root, "xdg"), PATH: "", ...extra };
}

async function envFile(path: string, content: string, mode = 0o600): Promise<void> {
  await writeFile(path, content, { mode });
  await chmod(path, mode);
}

describe("env file loading", () => {
  it("applies files in search order, and the real environment always wins", async () => {
    await envFile(join(project, ".env.local"), "A=local\n");
    await envFile(join(project, ".env"), "A=project\nB=project\n");
    await envFile(join(home, ".nodetool", ".env"), "B=nodetool-home\nC=nodetool-home\n");
    await envFile(join(home, ".env"), "C=home\nD=home\nREAL=from-file\n");
    const env = baseEnv({ REAL: "from-shell" });
    const result = loadCliEnvironment({ env, cwd: project });
    expect([env.A, env.B, env.C, env.D, env.REAL]).toEqual(["local", "project", "nodetool-home", "home", "from-shell"]);
    expect(result.sources).toEqual({ A: join(project, ".env.local"), B: join(project, ".env"), C: join(home, ".nodetool", ".env"), D: join(home, ".env") });
    expect(result.files.find(file => file.path === join(home, ".env"))?.shadowed).toEqual(["C", "REAL"]);
  });

  it("puts --env-file before NODETOOL_ENV_FILE and the default files", async () => {
    await envFile(join(root, "flag.env"), "A=flag\n");
    await envFile(join(root, "named.env"), "A=named\nB=named\n");
    await envFile(join(project, ".env"), "B=project\n");
    const env = baseEnv({ NODETOOL_ENV_FILE: join(root, "named.env") });
    const result = loadCliEnvironment({ env, cwd: project, envFile: "../flag.env" });
    expect([env.A, env.B]).toEqual(["flag", "named"]);
    expect(result.files.slice(0, 2).map(file => file.scope)).toEqual(["flag", "NODETOOL_ENV_FILE"]);
  });

  it("refuses a named file that does not exist and tolerates missing default files", () => {
    expect(() => loadCliEnvironment({ env: baseEnv(), cwd: project, envFile: "missing.env" })).toThrow(/missing\.env does not exist\. It was named by --env-file/);
    expect(() => loadCliEnvironment({ env: baseEnv({ NODETOOL_ENV_FILE: "gone.env" }), cwd: project })).toThrow(/named by NODETOOL_ENV_FILE/);
    expect(loadCliEnvironment({ env: baseEnv(), cwd: project }).files.every(file => !file.exists)).toBe(true);
  });

  it("skips empty placeholders so they do not hide a lower file", async () => {
    await envFile(join(project, ".env"), "OPENAI_API_KEY=\n");
    await envFile(join(home, ".env"), "OPENAI_API_KEY=sk-home\n");
    const env = baseEnv();
    loadCliEnvironment({ env, cwd: project });
    expect(env.OPENAI_API_KEY).toBe("sk-home");
  });

  it("lists the home directory once when it is the working directory", async () => {
    await envFile(join(home, ".env"), "A=1\n");
    const result = loadCliEnvironment({ env: baseEnv(), cwd: home });
    expect(result.files.filter(file => file.path === join(home, ".env"))).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")("warns about a world-readable file without printing its values", async () => {
    await envFile(join(project, ".env"), "OPENAI_API_KEY=sk-private\n", 0o644);
    const result = loadCliEnvironment({ env: baseEnv(), cwd: project });
    const warnings = result.files.flatMap(file => file.warnings);
    expect(warnings).toEqual([expect.stringContaining("readable by every user")]);
    expect(warnings.join("")).not.toContain("sk-private");
  });

  it("removes --env-file from argv before any --", () => {
    expect(extractEnvFileFlag(["node", "nodetool", "--env-file", "a.env", "info"])).toEqual({ argv: ["node", "nodetool", "info"], envFile: "a.env" });
    expect(extractEnvFileFlag(["node", "nodetool", "run", "x.json", "--env-file=b.env"])).toEqual({ argv: ["node", "nodetool", "run", "x.json"], envFile: "b.env" });
    expect(extractEnvFileFlag(["node", "nodetool", "chat", "--", "--env-file", "c"])).toEqual({ argv: ["node", "nodetool", "chat", "--", "--env-file", "c"] });
    expect(() => extractEnvFileFlag(["node", "nodetool", "--env-file"])).toThrow(/needs a path/);
  });
});

async function seedStore(env: NodeJS.ProcessEnv, rows: Record<string, string>, key = masterKey): Promise<void> {
  const path = localSecretStorePath(env);
  await mkdir(join(path, ".."), { recursive: true });
  const repository = createSqliteRepository(path);
  try {
    for (const [name, value] of Object.entries(rows)) { await repository.put("secrets", "1", { key: name, description: "", encrypted_value: encrypt(key, "1", value) }); }
  } finally { repository.close(); }
}

async function run(args: string[], env: NodeJS.ProcessEnv, envLoad = loadCliEnvironment({ env, cwd: project })): Promise<string> {
  const output: string[] = [];
  await createProgram({ env, envLoad, cwd: project, stdout: value => output.push(value) }).parseAsync(["node", "nodetool", ...args]);
  return output.join("");
}

describe("nodetool env check", () => {
  it("reports each variable's status and source, from the shell, a file or the store, without values", async () => {
    await envFile(join(home, ".env"), `SECRETS_MASTER_KEY=${masterKey}\nFAL_API_KEY=fal-private\n`);
    const env = baseEnv({ ANTHROPIC_API_KEY: "anthropic-private" });
    const envLoad = loadCliEnvironment({ env, cwd: project });
    await seedStore(env, { OPENAI_API_KEY: "openai-private" });
    await seedStore(env, { GEMINI_API_KEY: "gemini-private" }, "another-master-key-another-master-key");
    const text = await run(["env", "check", "--json"], env, envLoad);
    const report = JSON.parse(text) as EnvCheckReport;
    const variable = (name: string) => report.variables.find(entry => entry.name === name);
    expect(variable("SECRETS_MASTER_KEY")).toMatchObject({ status: "set", source: "file", file: join(home, ".env") });
    expect(variable("FAL_API_KEY")).toMatchObject({ status: "set", source: "file" });
    expect(variable("ANTHROPIC_API_KEY")).toMatchObject({ status: "set", source: "env" });
    expect(variable("OPENAI_API_KEY")).toMatchObject({ status: "set", source: "secret store" });
    expect(variable("GEMINI_API_KEY")).toMatchObject({ status: "unreadable", source: "secret store" });
    expect(variable("MISTRAL_API_KEY")).toMatchObject({ status: "unset", source: null });
    expect(report.variables).toHaveLength(ENV_CATALOGUE.length);
    expect(report.secret_store).toMatchObject({ master_key: "set", master_key_source: "file", stored: ["GEMINI_API_KEY", "OPENAI_API_KEY"] });
    expect(report.warnings).toEqual([expect.stringContaining("GEMINI_API_KEY")]);
    for (const secret of ["fal-private", "anthropic-private", "openai-private", "gemini-private", masterKey]) { expect(text).not.toContain(secret); }
  });

  it("tells a store with no master key apart from an empty store", async () => {
    const env = baseEnv();
    await seedStore(env, { OPENAI_API_KEY: "openai-private" });
    const report = JSON.parse(await run(["env", "check", "--json"], env)) as EnvCheckReport;
    expect(report.variables.find(entry => entry.name === "OPENAI_API_KEY")).toMatchObject({ status: "locked", source: "secret store" });
    expect(report.secret_store.master_key).toBe("missing");
    expect(report.warnings).toEqual([expect.stringContaining("SECRETS_MASTER_KEY is not set")]);
  });

  it("prints a readable summary that hides unset provider credentials unless asked", async () => {
    const env = baseEnv({ OPENAI_API_KEY: "sk-private" });
    const text = await run(["env", "check"], env);
    expect(text).toMatch(/OPENAI_API_KEY\s+set\s+env/);
    expect(text).not.toContain("MISTRAL_API_KEY");
    expect(text).toContain("`nodetool env check --all` lists them");
    expect(await run(["env", "check", "--all"], env)).toMatch(/MISTRAL_API_KEY\s+unset/);
    expect(text).not.toContain("sk-private");
  });
});

describe("nodetool env init, list and import", () => {
  it("writes a commented template with mode 600, every value empty, and refuses to overwrite", async () => {
    const text = await run(["env", "init"], baseEnv());
    const path = join(project, ".env.example");
    const content = await readFile(path, "utf8");
    expect(content).toBe(envTemplate());
    expect(parseEnvFile(content)).toEqual({});
    for (const name of ["SECRETS_MASTER_KEY", "OPENAI_API_KEY", "FAL_API_KEY", "NODETOOL_API_TOKEN", "NODETOOL_DATA_DIR"]) { expect(content).toContain(`# ${name}=`); }
    if (process.platform !== "win32") { expect((await stat(path)).mode & 0o777).toBe(0o600); }
    expect(text).toContain("Add .env and .env.local");
    await expect(run(["env", "init"], baseEnv())).rejects.toThrow(/already exists\. Pass --force/);
    await run(["env", "init", "--force"], baseEnv());
  });

  it("lists every variable with the commands that read it", async () => {
    const entries = JSON.parse(await run(["env", "list", "--json"], baseEnv())) as { name: string; used_by: string[] }[];
    expect(entries.map(entry => entry.name)).toEqual(expect.arrayContaining(["SECRETS_MASTER_KEY", "NODETOOL_DATA_DIR", "NODETOOL_API_TOKEN", "NODETOOL_ENV_FILE", "FAL_API_KEY"]));
    expect(entries.find(entry => entry.name === "FAL_API_KEY")?.used_by).toEqual(["provider fal_ai"]);
  });

  it("moves provider credentials into the store and can remove them from the file", async () => {
    const file = join(project, ".env");
    await envFile(file, `# keys\nOPENAI_API_KEY=sk-import\nSECRETS_MASTER_KEY=${masterKey}\nPORT=9000\nFAL_API_KEY=\n`);
    const env = baseEnv({ SECRETS_MASTER_KEY: masterKey });
    const result = JSON.parse(await run(["env", "import", "--remove", "--json"], env, { files: [], sources: {} })) as { imported: string[]; skipped: { name: string }[] };
    expect(result.imported).toEqual(["OPENAI_API_KEY"]);
    expect(result.skipped.map(entry => entry.name)).toEqual(["SECRETS_MASTER_KEY", "PORT", "FAL_API_KEY"]);
    expect(await readFile(file, "utf8")).toBe(`# keys\nSECRETS_MASTER_KEY=${masterKey}\nPORT=9000\nFAL_API_KEY=\n`);
    const report = JSON.parse(await run(["env", "check", "--json"], env, { files: [], sources: {} })) as EnvCheckReport;
    expect(report.variables.find(entry => entry.name === "OPENAI_API_KEY")).toMatchObject({ status: "set", source: "secret store" });
  });

  it("needs SECRETS_MASTER_KEY to import and says where to put it", async () => {
    await envFile(join(project, ".env"), "OPENAI_API_KEY=sk-import\n");
    await expect(run(["env", "import"], baseEnv(), { files: [], sources: {} })).rejects.toThrow(/~\/\.nodetool\/\.env/);
  });
});

describe("missing credential errors", () => {
  it.each([
    ["nowhere", {}, false, /OPENAI_API_KEY is not set: it is not in the environment, not in a loaded env file .* nodetool secrets set OPENAI_API_KEY/],
    ["stored without a master key", { OPENAI_API_KEY: "sk" }, false, /OPENAI_API_KEY is in the local secret store .* SECRETS_MASTER_KEY is not set/],
    ["stored under another key", { OPENAI_API_KEY: "sk" }, true, /does not decrypt with the current SECRETS_MASTER_KEY/]
  ])("names the variable and the fix when it is %s", async (_case, rows: Record<string, string>, otherKey: boolean, message: RegExp) => {
    const env = baseEnv(otherKey ? { SECRETS_MASTER_KEY: masterKey } : {});
    if (Object.keys(rows).length) { await seedStore(env, rows, otherKey ? "another-master-key-another-master-key" : masterKey); }
    await expect(run(["text", "hello"], env)).rejects.toThrow(message);
  });
});

describe("startup loading", () => {
  it("lets a command read a key that lives only in ~/.env, with no manual sourcing", async () => {
    await envFile(join(home, ".env"), "OPENAI_API_KEY=sk-from-home-file\n");
    const env = baseEnv();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => { writes.push(String(chunk)); return true; });
    await runCli(["node", "nodetool", "env", "check", "--json"], env, project);
    expect(env.OPENAI_API_KEY).toBe("sk-from-home-file");
    const report = JSON.parse(writes.join("")) as EnvCheckReport;
    expect(report.variables.find(entry => entry.name === "OPENAI_API_KEY")).toMatchObject({ status: "set", source: "file", file: join(home, ".env") });
    expect(writes.join("")).not.toContain("sk-from-home-file");
  });
});
