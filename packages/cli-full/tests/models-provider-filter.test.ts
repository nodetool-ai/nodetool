import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const directories: string[] = [];
const entry = fileURLToPath(new URL("../dist/nodetool.js", import.meta.url));
const rows = [{ id: "fal-fixture", provider: "fal" }, { id: "openai-fixture", provider: "openai" }];

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function list(args: readonly string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "models-provider-filter-"));
  directories.push(directory);
  const providers = `export async function listAllModels() { return ${JSON.stringify(rows)}; }
    export async function closePythonProviders() {}
    export async function listConfiguredProviderInfo() { return []; }
    export async function listOllamaModels() { return []; }
    export async function listProviderModels() { return []; }`;
  const apiClient = `export function createApiClient() { return { models: { all: { query: async () => ${JSON.stringify(rows.map((row) => ({ ...row, remote: true })))} } } }; }`;
  const script = `import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (context.parentURL?.endsWith('/nodetool-main.js')) {
        if (specifier === './providers.js') return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(providers)}),shortCircuit:true};
        if (specifier === './api-client.js') return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(apiClient)}),shortCircuit:true};
      }
      return next(specifier,context);
    }});`;
  const hook = join(directory, "fixture.mjs");
  await writeFile(hook, script);
  const result = await exec(process.execPath, ["--import", hook, entry, "models", "list", ...args, "--json"], {
    env: { ...process.env, NODETOOL_API_URL: "", NODETOOL_DATA_DIR: directory, SECRETS_MASTER_KEY: "1".repeat(64), NODETOOL_LOG_LEVEL: "error" },
    timeout: 30_000
  });
  return result.stdout;
}

describe("full models provider filter", () => {
  it("filters the actual child CLI's cached list and preserves the unfiltered output", async () => {
    expect(JSON.parse(await list([]))).toEqual(rows);
    expect(JSON.parse(await list(["--provider", "fal"]))).toEqual([rows[0]]);
  });

  it("applies the same filter to remote server rows", async () => {
    expect(JSON.parse(await list(["--api-url", "https://fixture.invalid", "--provider", "fal"]))).toEqual([{ ...rows[0], remote: true }]);
  });

  it("rejects an invalid provider before querying models", async () => {
    await expect(list(["--provider", "invalid provider"])).rejects.toThrow("Provider must be an identifier");
  });
});
