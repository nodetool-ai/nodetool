import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-jsscript-cli-"));
  directories.push(directory);
  return directory;
}

function run(directory: string, ...args: string[]) {
  return spawnSync(process.execPath, [
    "--import", import.meta.resolve("tsx"), resolve(import.meta.dirname, "../src/nodetool.ts"),
    "jsscript", ...args
  ], {
    cwd: directory,
    env: {
      ...process.env,
      XDG_DATA_HOME: directory,
      NODETOOL_HOST: "cli",
      NODETOOL_ENV: "development",
      NODETOOL_LOG_LEVEL: "error",
      SECRETS_MASTER_KEY: "a".repeat(64)
    },
    encoding: "utf8",
    timeout: 30_000
  });
}

const script = {
  schemaVersion: 1,
  code: 'await output("total", inputs.n + 1);',
  inputs: [{ name: "n", type: "int" }],
  outputs: [{ name: "total", type: "int" }],
  tests: [{ name: "adds one", inputs: { n: 1 }, expect: { total: 999 } }]
};

function save(directory: string, document: unknown): string {
  const file = join(directory, "script.json");
  writeFileSync(file, JSON.stringify(document));
  return file;
}

describe("JS script CLI contracts", () => {
  it.each([
    { tool: "test", code: script.code, failure: { ok: false, failed: 1 } },
    {
      tool: "run",
      code: 'await output("total", inputs.n + 1); throw new Error("Deliberate local failure");',
      failure: { ok: false, run: { ok: false, error: "Deliberate local failure" } }
    }
  ])("fails debug when $tool reports an operation failure", ({ tool, code, failure }) => {
    const directory = workspace();
    const file = save(directory, { ...script, code });
    const out = join(directory, "bundle");
    const debug = run(directory, "debug", file, "--interact",
      JSON.stringify([{ tool, input: { inputs: { n: 1 } } }]), "--out", out, "--json");
    expect(debug.status, debug.stderr).toBe(1);
    const report = JSON.parse(debug.stdout);
    expect(report.validation.ok).toBe(true);
    expect(report.interactions[0]).toMatchObject({ ok: false, result: failure });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.headline).not.toContain("Script is sound");
    expect(JSON.parse(readFileSync(join(out, "report.json"), "utf8"))).toEqual(report);
    if (tool === "test") {
      const direct = run(directory, "test", file, "--json");
      expect(direct.status, direct.stderr).toBe(1);
      expect(JSON.parse(direct.stdout)).toMatchObject(failure);
    }
  }, 60_000);

  it.each(["run", "test"])("rejects the return-output contract before %s", (command) => {
    const directory = workspace();
    const file = save(directory, { ...script, code: "return { total: inputs.n + 1 };" });
    const result = run(directory, command, file, "--json");
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain("js_script_legacy_contract");
  });

  it("rejects a misspelled assertion field instead of passing it", () => {
    const directory = workspace();
    const file = save(directory, {
      ...script,
      tests: [{ name: "wrong total", inputs: { n: 1 }, expected: { total: 999 } }]
    });
    for (const command of ["validate", "test"]) {
      const result = run(directory, command, file, "--json");
      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).toContain("Unrecognized test field(s): expected");
      expect(result.stdout).toContain("Use expect");
    }
  });

  it("prints a schema and an example whose saved cases pass", () => {
    const directory = workspace();
    const schema = run(directory, "schema");
    expect(schema.status, schema.stderr).toBe(0);
    const caseSchema = JSON.parse(schema.stdout).properties.tests.items;
    expect(caseSchema.additionalProperties).toBe(false);
    expect(caseSchema.properties).toHaveProperty("expect");
    expect(caseSchema.properties).toHaveProperty("expectedStreamed");
    const example = run(directory, "example");
    expect(example.status, example.stderr).toBe(0);
    const file = save(directory, JSON.parse(example.stdout));
    const validation = run(directory, "validate", file, "--warnings-as-errors", "--json");
    expect(validation.status, validation.stderr + validation.stdout).toBe(0);
    const tested = run(directory, "test", file, "--json");
    expect(tested.status, tested.stderr + tested.stdout).toBe(0);
    expect(JSON.parse(tested.stdout)).toMatchObject({ ok: true, passed: 1, failed: 0 });
  }, 60_000);
});
