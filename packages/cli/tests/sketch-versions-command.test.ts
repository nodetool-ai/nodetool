/**
 * Action-level tests for `nodetool sketch versions`
 * (src/commands/sketch-versions.ts).
 *
 * The database is injected, so these exercise the real command wiring —
 * argument parsing, JSON shapes, exit codes, and the order a restore writes in
 * — without a SQLite file.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Command } from "commander";
import {
  registerSketchVersionsCommands,
  toVersionListItem,
  parseVersionNumber,
  versionTableRows,
  documentCounts,
  type ImageDocumentRow,
  type SketchVersionRow,
  type SketchVersionStore
} from "../src/commands/sketch-versions.js";

const document = JSON.stringify({
  sketch: {
    version: 3,
    canvas: { width: 1280, height: 720, backgroundColor: "#101010" },
    layers: [{ id: "l1" }, { id: "l2" }],
    activeLayerId: "l1"
  },
  layerBindings: [{ layerId: "l1" }]
});

const imageDocument = (): ImageDocumentRow => ({
  id: "doc-1",
  user_id: "1",
  name: "My sketch",
  width: 1024,
  height: 1024,
  background_color: "#ffffff",
  updated_at: "2026-08-01T10:00:00.000Z",
  document
});

const versionRow = (
  overrides: Partial<SketchVersionRow> = {}
): SketchVersionRow => ({
  id: "ver-1",
  image_document_id: "doc-1",
  version: 2,
  name: "before the repaint",
  save_type: "manual",
  width: 1280,
  height: 720,
  background_color: "#101010",
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

const store: SketchVersionStore = {
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

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  const sketch = program.command("sketch");
  registerSketchVersionsCommands(sketch, {
    store: async () => store,
    validate,
    confirmDelete
  });
  return program;
}

function run(...argv: string[]) {
  const program = buildProgram();
  return captureOutput(() =>
    program.parseAsync(["node", "cli", "sketch", "versions", ...argv])
  );
}

beforeEach(() => {
  load.mockReset().mockResolvedValue(imageDocument());
  listVersions.mockReset().mockResolvedValue([versionRow()]);
  findVersion.mockReset().mockResolvedValue(versionRow());
  snapshot
    .mockReset()
    .mockResolvedValue(
      versionRow({ id: "ver-3", version: 3, save_type: "restore" })
    );
  restore.mockReset().mockResolvedValue({
    ...imageDocument(),
    width: 1280,
    height: 720,
    background_color: "#101010"
  });
  deleteVersion.mockReset().mockResolvedValue(undefined);
  confirmDelete.mockReset().mockResolvedValue(true);
  validate.mockReset().mockResolvedValue({ ok: true, errors: [], warnings: [] });
});

describe("sketch versions list", () => {
  it("lists a sketch's versions as JSON list items", async () => {
    const { stdout, exitCode } = await run("list", "doc-1", "--json");
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(stdout.trim()) as {
      imageDocumentId: string;
      versions: Array<Record<string, unknown>>;
    };
    expect(parsed.imageDocumentId).toBe("doc-1");
    expect(parsed.versions).toHaveLength(1);
    expect(parsed.versions[0]).toMatchObject({
      version: 2,
      saveType: "manual",
      name: "before the repaint",
      width: 1280,
      height: 720,
      backgroundColor: "#101010",
      createdAt: "2026-08-01T09:00:00.000Z"
    });
  });

  it("passes --save-type and --limit through to the store", async () => {
    await run(
      "list",
      "doc-1",
      "--save-type",
      "autosave",
      "--limit",
      "5",
      "--json"
    );
    expect(listVersions).toHaveBeenCalledWith("doc-1", {
      limit: 5,
      saveType: "autosave"
    });
  });

  it("prints a table with version, save type and resolution in human mode", async () => {
    const { stdout } = await run("list", "doc-1");
    expect(stdout).toContain("saveType");
    expect(stdout).toContain("manual");
    expect(stdout).toContain("1280x720");
  });

  it("exits non-zero for an unknown document id", async () => {
    load.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("list", "nope");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Image document not found: nope");
    expect(listVersions).not.toHaveBeenCalled();
  });
});

describe("sketch versions show", () => {
  it("prints the metadata and the stored document under --json", async () => {
    const { stdout } = await run("show", "doc-1", "2", "--json");
    const parsed = JSON.parse(stdout.trim()) as {
      version: number;
      document: { sketch: { layers: unknown[] } };
    };
    expect(parsed.version).toBe(2);
    expect(parsed.document.sketch.layers).toHaveLength(2);
  });

  it("prints layer and binding counts in human mode", async () => {
    const { stdout } = await run("show", "doc-1", "2");
    expect(stdout).toContain("2 layer(s), 1 binding(s)");
  });

  it("exits non-zero for an unknown version", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("show", "doc-1", "9");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Sketch version not found: doc-1 v9");
  });

  it("rejects a version that is not a positive integer", async () => {
    const { exitCode, stderr } = await run("show", "doc-1", "latest");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("version must be a positive integer");
  });
});

describe("sketch versions create", () => {
  it("snapshots the current document as a manual save", async () => {
    snapshot.mockResolvedValueOnce(
      versionRow({ id: "ver-4", version: 4, name: "checkpoint" })
    );
    const { stdout } = await run(
      "create",
      "doc-1",
      "--name",
      "checkpoint",
      "--json"
    );
    expect(snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-1" }),
      { saveType: "manual", name: "checkpoint" }
    );
    const parsed = JSON.parse(stdout.trim()) as {
      version: number;
      name: string;
    };
    expect(parsed).toMatchObject({ version: 4, name: "checkpoint" });
  });

  it("defaults the name to null and reports the new version", async () => {
    const { stdout } = await run("create", "doc-1");
    expect(snapshot).toHaveBeenCalledWith(expect.anything(), {
      saveType: "manual",
      name: null
    });
    expect(stdout).toContain("Snapshot saved as v3");
  });
});

describe("sketch versions restore", () => {
  it("snapshots the pre-restore state before writing the version back", async () => {
    const { exitCode, stdout } = await run("restore", "doc-1", "2");
    expect(exitCode).toBe(0);

    expect(snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-1" }),
      { saveType: "restore", name: "Before restore to v2" }
    );
    expect(snapshot.mock.invocationCallOrder[0]!).toBeLessThan(
      restore.mock.invocationCallOrder[0]!
    );
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        updated_at: "2026-08-01T10:00:00.000Z"
      }),
      expect.objectContaining({
        version: 2,
        width: 1280,
        height: 720,
        background_color: "#101010"
      })
    );
    expect(stdout).toContain("Restored v2 onto doc-1");
    expect(stdout).toContain("pre-restore state saved as v3");
    expect(stdout).toContain("0 error(s), 0 warning(s)");
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({}), {
      width: 1280,
      height: 720,
      backgroundColor: "#101010"
    });
  });

  it("reports the restore, the snapshot and the validation under --json", async () => {
    const { stdout, exitCode } = await run("restore", "doc-1", "2", "--json");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as {
      imageDocumentId: string;
      restored: { version: number };
      snapshot: Record<string, unknown>;
      document: Record<string, unknown>;
      validation: { ok: boolean };
    };
    expect(parsed.imageDocumentId).toBe("doc-1");
    expect(parsed.restored.version).toBe(2);
    expect(parsed.snapshot).toMatchObject({ version: 3, saveType: "restore" });
    expect(parsed.document).toMatchObject({
      width: 1280,
      height: 720,
      backgroundColor: "#101010"
    });
    expect(parsed.validation).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("exits non-zero when the restored document no longer validates", async () => {
    validate.mockResolvedValueOnce({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "document_invalid",
          message: "Document is a string — expected an object."
        }
      ],
      warnings: []
    });
    findVersion.mockResolvedValueOnce(versionRow({ document: "{not json" }));
    const { exitCode, stdout } = await run("restore", "doc-1", "2");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("1 error(s), 0 warning(s)");
    // parseVersionDocument hands the unparseable text through as-is, so the
    // validator sees the raw string rather than a silent undefined.
    expect(validate).toHaveBeenCalledWith("{not json", expect.anything());
  });

  it("fails when the document changed since it was loaded", async () => {
    restore.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "doc-1", "2");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Document was modified since last read");
  });

  it("exits non-zero for an unknown version without snapshotting", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "doc-1", "7");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Sketch version not found: doc-1 v7");
    expect(snapshot).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe("sketch versions delete", () => {
  it("deletes a confirmed version", async () => {
    const { stdout } = await run("delete", "doc-1", "2", "--yes", "--json");
    expect(confirmDelete).toHaveBeenCalledWith(
      "Delete v2 of sketch doc-1?",
      true
    );
    expect(deleteVersion).toHaveBeenCalledWith("doc-1", 2);
    expect(JSON.parse(stdout.trim())).toEqual({
      imageDocumentId: "doc-1",
      version: 2,
      deleted: true
    });
  });

  it("aborts with exit 1 when the confirmation is declined", async () => {
    confirmDelete.mockResolvedValueOnce(false);
    const { exitCode, stdout } = await run("delete", "doc-1", "2", "--json");
    expect(exitCode).toBe(1);
    expect(deleteVersion).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.trim())).toMatchObject({
      deleted: false,
      aborted: true
    });
  });

  it("exits non-zero for an unknown version", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("delete", "doc-1", "9", "--yes");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Sketch version not found: doc-1 v9");
    expect(deleteVersion).not.toHaveBeenCalled();
  });

  it("puts the failure on stdout too under --json", async () => {
    load.mockResolvedValueOnce(null);
    const { stdout } = await run("delete", "gone", "1", "--yes", "--json");
    expect(JSON.parse(stdout.trim())).toEqual({
      error: "Image document not found: gone"
    });
  });
});

describe("sketch versions helpers", () => {
  it("maps a row to the router's camelCase list item", () => {
    expect(toVersionListItem(versionRow())).toEqual({
      id: "ver-1",
      version: 2,
      name: "before the repaint",
      saveType: "manual",
      width: 1280,
      height: 720,
      backgroundColor: "#101010",
      createdAt: "2026-08-01T09:00:00.000Z"
    });
  });

  it("renders one table row per version with a combined resolution", () => {
    const [row] = versionTableRows([toVersionListItem(versionRow())]);
    expect(row).toMatchObject({
      version: 2,
      resolution: "1280x720",
      background: "#101010",
      name: "before the repaint"
    });
  });

  it("counts layers and bindings of an unreadable document as zero", () => {
    expect(documentCounts("not json")).toEqual({ layers: 0, bindings: 0 });
  });

  it("rejects non-positive and non-integer versions", () => {
    expect(parseVersionNumber(" 3 ")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "v2", ""]) {
      expect(() => parseVersionNumber(bad)).toThrow(/positive integer/);
    }
  });
});
