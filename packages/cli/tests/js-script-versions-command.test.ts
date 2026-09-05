/**
 * Action-level tests for `nodetool jsscript versions`
 * (src/commands/js-script-versions.ts).
 *
 * The database and the validator are injected, so these exercise the real
 * command wiring — argument parsing, JSON shapes, exit codes, and the order a
 * restore writes in — without a SQLite file.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Command } from "commander";
import {
  registerJsScriptVersionsCommands,
  toVersionListItem,
  parseVersionNumber,
  versionTableRows,
  documentCounts,
  type JsScriptRow,
  type JsScriptVersionRow,
  type JsScriptVersionStore
} from "../src/commands/js-script-versions.js";

const document = JSON.stringify({
  schemaVersion: 1,
  description: "Adds one.",
  code: 'await output("total", inputs.n + 1);',
  inputs: [{ name: "n", type: "int" }],
  outputs: [{ name: "total", type: "int" }],
  packages: [],
  secrets: [],
  timeoutSeconds: 30,
  tests: [{ name: "adds one", inputs: { n: 1 }, expect: { total: 2 } }]
});

const scriptRow = (): JsScriptRow => ({
  id: "js-1",
  user_id: "1",
  name: "Adder",
  updated_at: "2026-08-01T10:00:00.000Z",
  document
});

const versionRow = (
  overrides: Partial<JsScriptVersionRow> = {}
): JsScriptVersionRow => ({
  id: "ver-1",
  js_script_id: "js-1",
  version: 2,
  name: "before the rewrite",
  save_type: "manual",
  created_at: "2026-08-01T09:00:00.000Z",
  document,
  ...overrides
});

const load = vi.fn();
const listVersions = vi.fn();
const findVersion = vi.fn();
const snapshot = vi.fn();
const restore = vi.fn();
const deleteVersion = vi.fn();
const confirmDelete = vi.fn();
const validate = vi.fn();

const store: JsScriptVersionStore = {
  load,
  listVersions,
  findVersion,
  snapshot,
  restore,
  deleteVersion
};

async function captureOutput(
  fn: () => Promise<void> | void
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;
  console.log = (...args: unknown[]) => {
    stdout += args.map(String).join(" ") + "\n";
  };
  console.error = (...args: unknown[]) => {
    stderr += args.map(String).join(" ") + "\n";
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__EXIT__${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT__")) throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }
  return { stdout, stderr, exitCode };
}

function run(...argv: string[]) {
  const program = new Command();
  program.exitOverride();
  const jsscript = program.command("jsscript");
  registerJsScriptVersionsCommands(jsscript, {
    store: async () => store,
    validate,
    confirmDelete
  });
  return captureOutput(() =>
    program.parseAsync(["node", "cli", "jsscript", "versions", ...argv])
  );
}

beforeEach(() => {
  load.mockReset().mockResolvedValue(scriptRow());
  listVersions.mockReset().mockResolvedValue([versionRow()]);
  findVersion.mockReset().mockResolvedValue(versionRow());
  snapshot
    .mockReset()
    .mockResolvedValue(
      versionRow({ id: "ver-3", version: 3, save_type: "restore" })
    );
  restore.mockReset().mockResolvedValue(scriptRow());
  deleteVersion.mockReset().mockResolvedValue(undefined);
  confirmDelete.mockReset().mockResolvedValue(true);
  validate
    .mockReset()
    .mockResolvedValue({ ok: true, errors: [], warnings: [] });
});

describe("jsscript versions list", () => {
  it("lists a script's versions as JSON list items", async () => {
    const { stdout, exitCode } = await run("list", "js-1", "--json");
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(stdout.trim()) as {
      jsScriptId: string;
      versions: Array<Record<string, unknown>>;
    };
    expect(parsed.jsScriptId).toBe("js-1");
    expect(parsed.versions[0]).toMatchObject({
      version: 2,
      saveType: "manual",
      name: "before the rewrite"
    });
  });

  it("passes --save-type and --limit through to the store", async () => {
    await run("list", "js-1", "--save-type", "autosave", "--limit", "5", "--json");
    expect(listVersions).toHaveBeenCalledWith("js-1", {
      limit: 5,
      saveType: "autosave"
    });
  });

  it("exits non-zero for an unknown script id", async () => {
    load.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("list", "nope");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("JS script not found: nope");
    expect(listVersions).not.toHaveBeenCalled();
  });
});

describe("jsscript versions show", () => {
  it("prints the metadata and the stored document under --json", async () => {
    const { stdout } = await run("show", "js-1", "2", "--json");
    const parsed = JSON.parse(stdout.trim()) as {
      version: number;
      document: { outputs: unknown[] };
    };
    expect(parsed.version).toBe(2);
    expect(parsed.document.outputs).toHaveLength(1);
  });

  it("prints port and test counts in human mode", async () => {
    const { stdout } = await run("show", "js-1", "2");
    expect(stdout).toContain("1 input(s), 1 output(s), 1 test(s)");
  });

  it("rejects a version that is not a positive integer", async () => {
    const { exitCode, stderr } = await run("show", "js-1", "latest");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("version must be a positive integer");
  });
});

describe("jsscript versions create", () => {
  it("snapshots the current document as a manual save", async () => {
    const { stdout } = await run("create", "js-1", "--name", "checkpoint", "--json");
    expect(snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "js-1" }),
      { saveType: "manual", name: "checkpoint" }
    );
    expect(JSON.parse(stdout.trim())).toMatchObject({ version: 3 });
  });
});

describe("jsscript versions restore", () => {
  it("snapshots the pre-restore state before writing the version back", async () => {
    const { exitCode, stdout } = await run("restore", "js-1", "2");
    expect(exitCode).toBe(0);
    expect(snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "js-1" }),
      { saveType: "restore", name: "Before restore to v2" }
    );
    expect(snapshot.mock.invocationCallOrder[0]!).toBeLessThan(
      restore.mock.invocationCallOrder[0]!
    );
    expect(stdout).toContain("Restored v2 onto js-1");
    expect(stdout).toContain("pre-restore state saved as v3");
    expect(stdout).toContain("0 error(s), 0 warning(s)");
  });

  it("exits non-zero when the restored document no longer validates", async () => {
    validate.mockResolvedValueOnce({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "js_script_legacy_contract",
          message: "The body returns its outputs"
        }
      ],
      warnings: []
    });
    const { exitCode, stdout } = await run("restore", "js-1", "2");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("1 error(s), 0 warning(s)");
  });

  it("fails when the script changed since it was loaded", async () => {
    restore.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "js-1", "2");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Script was modified since last read");
  });

  it("exits non-zero for an unknown version without snapshotting", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "js-1", "7");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("JS script version not found: js-1 v7");
    expect(snapshot).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe("jsscript versions delete", () => {
  it("deletes a confirmed version", async () => {
    const { stdout } = await run("delete", "js-1", "2", "--yes", "--json");
    expect(confirmDelete).toHaveBeenCalledWith(
      "Delete v2 of JS script js-1?",
      true
    );
    expect(deleteVersion).toHaveBeenCalledWith("js-1", 2);
    expect(JSON.parse(stdout.trim())).toEqual({
      jsScriptId: "js-1",
      version: 2,
      deleted: true
    });
  });

  it("aborts with exit 1 when the confirmation is declined", async () => {
    confirmDelete.mockResolvedValueOnce(false);
    const { exitCode, stdout } = await run("delete", "js-1", "2", "--json");
    expect(exitCode).toBe(1);
    expect(deleteVersion).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.trim())).toMatchObject({
      deleted: false,
      aborted: true
    });
  });
});

describe("jsscript versions helpers", () => {
  it("maps a row to the router's camelCase list item", () => {
    expect(toVersionListItem(versionRow())).toEqual({
      id: "ver-1",
      version: 2,
      name: "before the rewrite",
      saveType: "manual",
      createdAt: "2026-08-01T09:00:00.000Z"
    });
  });

  it("renders one table row per version", () => {
    expect(versionTableRows([toVersionListItem(versionRow())])).toEqual([
      {
        version: 2,
        saveType: "manual",
        name: "before the rewrite",
        createdAt: "2026-08-01T09:00:00.000Z"
      }
    ]);
  });

  it("counts ports and tests, defaulting a document that has none", () => {
    expect(documentCounts(JSON.parse(document))).toEqual({
      inputs: 1,
      outputs: 1,
      tests: 1
    });
    expect(documentCounts(undefined)).toEqual({
      inputs: 0,
      outputs: 0,
      tests: 0
    });
  });

  it("rejects a version number that is not a positive integer", () => {
    expect(parseVersionNumber(" 3 ")).toBe(3);
    expect(() => parseVersionNumber("0")).toThrow(/positive integer/);
    expect(() => parseVersionNumber("x")).toThrow(/positive integer/);
  });
});
