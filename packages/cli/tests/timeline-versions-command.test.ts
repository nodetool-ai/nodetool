/**
 * Action-level tests for `nodetool timeline versions`
 * (src/commands/timeline-versions.ts).
 *
 * The database and the validator core are injected, so these exercise the real
 * command wiring — argument parsing, JSON shapes, exit codes, and the order a
 * restore writes in — without a SQLite file or the execution package.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Command } from "commander";
import {
  registerTimelineVersionsCommands,
  toVersionListItem,
  parseVersionNumber,
  versionTableRows,
  documentCounts,
  type TimelineSequenceRow,
  type TimelineVersionRow,
  type TimelineVersionStore
} from "../src/commands/timeline-versions.js";

const document = JSON.stringify({
  tracks: [{ id: "t1" }],
  clips: [{ id: "c1" }, { id: "c2" }],
  markers: []
});

const sequence = (): TimelineSequenceRow => ({
  id: "seq-1",
  user_id: "1",
  name: "My timeline",
  fps: 30,
  width: 1920,
  height: 1080,
  duration_ms: 8000,
  updated_at: "2026-08-01T10:00:00.000Z",
  document
});

const versionRow = (
  overrides: Partial<TimelineVersionRow> = {}
): TimelineVersionRow => ({
  id: "ver-1",
  timeline_id: "seq-1",
  version: 2,
  name: "before the cut",
  save_type: "manual",
  fps: 24,
  width: 1280,
  height: 720,
  duration_ms: 4000,
  created_at: "2026-08-01T09:00:00.000Z",
  document,
  ...overrides
});

const clean = { ok: true, errors: [], warnings: [] };

const loadSequence = vi.fn();
const listVersions = vi.fn();
const findVersion = vi.fn();
const snapshot = vi.fn();
const restore = vi.fn();
const deleteVersion = vi.fn();
const validate = vi.fn();
const confirmDelete = vi.fn();

const store: TimelineVersionStore = {
  loadSequence,
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
  const timeline = program.command("timeline");
  registerTimelineVersionsCommands(timeline, {
    store: async () => store,
    validate,
    confirmDelete
  });
  return program;
}

function run(...argv: string[]) {
  const program = buildProgram();
  return captureOutput(() =>
    program.parseAsync(["node", "cli", "timeline", "versions", ...argv])
  );
}

beforeEach(() => {
  loadSequence.mockReset().mockResolvedValue(sequence());
  listVersions.mockReset().mockResolvedValue([versionRow()]);
  findVersion.mockReset().mockResolvedValue(versionRow());
  snapshot
    .mockReset()
    .mockResolvedValue(versionRow({ id: "ver-3", version: 3, save_type: "restore" }));
  restore.mockReset().mockResolvedValue({
    ...sequence(),
    fps: 24,
    width: 1280,
    height: 720,
    duration_ms: 4000
  });
  deleteVersion.mockReset().mockResolvedValue(undefined);
  validate.mockReset().mockResolvedValue(clean);
  confirmDelete.mockReset().mockResolvedValue(true);
});

describe("timeline versions list", () => {
  it("lists a timeline's versions as JSON list items", async () => {
    const { stdout, exitCode } = await run("list", "seq-1", "--json");
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(stdout.trim()) as {
      timelineId: string;
      versions: Array<Record<string, unknown>>;
    };
    expect(parsed.timelineId).toBe("seq-1");
    expect(parsed.versions).toHaveLength(1);
    expect(parsed.versions[0]).toMatchObject({
      version: 2,
      saveType: "manual",
      name: "before the cut",
      fps: 24,
      width: 1280,
      height: 720,
      durationMs: 4000,
      createdAt: "2026-08-01T09:00:00.000Z"
    });
  });

  it("passes --save-type and --limit through to the store", async () => {
    await run("list", "seq-1", "--save-type", "autosave", "--limit", "5", "--json");
    expect(listVersions).toHaveBeenCalledWith("seq-1", {
      limit: 5,
      saveType: "autosave"
    });
  });

  it("prints a table with version, save type and resolution in human mode", async () => {
    const { stdout } = await run("list", "seq-1");
    expect(stdout).toContain("saveType");
    expect(stdout).toContain("manual");
    expect(stdout).toContain("1280x720");
  });

  it("exits non-zero for an unknown timeline id", async () => {
    loadSequence.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("list", "nope");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Timeline sequence not found: nope");
    expect(listVersions).not.toHaveBeenCalled();
  });
});

describe("timeline versions show", () => {
  it("prints the metadata and the stored document under --json", async () => {
    const { stdout } = await run("show", "seq-1", "2", "--json");
    const parsed = JSON.parse(stdout.trim()) as {
      version: number;
      document: { clips: unknown[] };
    };
    expect(parsed.version).toBe(2);
    expect(parsed.document.clips).toHaveLength(2);
  });

  it("prints track/clip/marker counts in human mode", async () => {
    const { stdout } = await run("show", "seq-1", "2");
    expect(stdout).toContain("1 track(s), 2 clip(s), 0 marker(s)");
  });

  it("exits non-zero for an unknown version", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("show", "seq-1", "9");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Timeline version not found: seq-1 v9");
  });

  it("rejects a version that is not a positive integer", async () => {
    const { exitCode, stderr } = await run("show", "seq-1", "latest");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("version must be a positive integer");
  });
});

describe("timeline versions create", () => {
  it("snapshots the current sequence as a manual save", async () => {
    snapshot.mockResolvedValueOnce(
      versionRow({ id: "ver-4", version: 4, name: "checkpoint" })
    );
    const { stdout } = await run("create", "seq-1", "--name", "checkpoint", "--json");
    expect(snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seq-1" }),
      { saveType: "manual", name: "checkpoint" }
    );
    const parsed = JSON.parse(stdout.trim()) as { version: number; name: string };
    expect(parsed).toMatchObject({ version: 4, name: "checkpoint" });
  });

  it("defaults the name to null and reports the new version", async () => {
    const { stdout } = await run("create", "seq-1");
    expect(snapshot).toHaveBeenCalledWith(expect.anything(), {
      saveType: "manual",
      name: null
    });
    expect(stdout).toContain("Snapshot saved as v3");
  });
});

describe("timeline versions restore", () => {
  it("snapshots the pre-restore state before writing the version back", async () => {
    const { exitCode, stdout } = await run("restore", "seq-1", "2");
    expect(exitCode).toBe(0);

    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({ id: "seq-1" }), {
      saveType: "restore",
      name: "Before restore to v2"
    });
    expect(snapshot.mock.invocationCallOrder[0]!).toBeLessThan(
      restore.mock.invocationCallOrder[0]!
    );
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seq-1", updated_at: "2026-08-01T10:00:00.000Z" }),
      expect.objectContaining({ version: 2, fps: 24, width: 1280, height: 720 })
    );
    expect(stdout).toContain("Restored v2 onto seq-1");
    expect(stdout).toContain("pre-restore state saved as v3");
    expect(stdout).toContain("0 error(s), 0 warning(s)");
  });

  it("validates the restored document against the current schema", async () => {
    await run("restore", "seq-1", "2");
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ clips: expect.any(Array) }),
      { fps: 24, width: 1280, height: 720 }
    );
  });

  it("reports the restore, the snapshot and the verdict under --json", async () => {
    const { stdout, exitCode } = await run("restore", "seq-1", "2", "--json");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as {
      timelineId: string;
      restored: { version: number };
      snapshot: Record<string, unknown>;
      sequence: Record<string, unknown>;
      validation: unknown;
    };
    expect(parsed.timelineId).toBe("seq-1");
    expect(parsed.restored.version).toBe(2);
    expect(parsed.snapshot).toMatchObject({ version: 3, saveType: "restore" });
    expect(parsed.sequence).toMatchObject({ fps: 24, width: 1280, height: 720 });
    expect(parsed.validation).toEqual(clean);
  });

  it("exits non-zero when the restored document no longer validates", async () => {
    validate.mockResolvedValueOnce({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "clip_track_missing",
          message: "clip references a track the document does not have",
          clipId: "c1"
        }
      ],
      warnings: []
    });
    const { exitCode, stdout } = await run("restore", "seq-1", "2");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("clip_track_missing");
  });

  it("fails when the sequence changed since it was loaded", async () => {
    restore.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "seq-1", "2");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Timeline has been modified since last load");
  });

  it("exits non-zero for an unknown version without snapshotting", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("restore", "seq-1", "7");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Timeline version not found: seq-1 v7");
    expect(snapshot).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe("timeline versions delete", () => {
  it("deletes a confirmed version", async () => {
    const { stdout } = await run("delete", "seq-1", "2", "--yes", "--json");
    expect(confirmDelete).toHaveBeenCalledWith(
      "Delete v2 of timeline seq-1?",
      true
    );
    expect(deleteVersion).toHaveBeenCalledWith("seq-1", 2);
    expect(JSON.parse(stdout.trim())).toEqual({
      timelineId: "seq-1",
      version: 2,
      deleted: true
    });
  });

  it("aborts with exit 1 when the confirmation is declined", async () => {
    confirmDelete.mockResolvedValueOnce(false);
    const { exitCode, stdout } = await run("delete", "seq-1", "2", "--json");
    expect(exitCode).toBe(1);
    expect(deleteVersion).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.trim())).toMatchObject({
      deleted: false,
      aborted: true
    });
  });

  it("exits non-zero for an unknown version", async () => {
    findVersion.mockResolvedValueOnce(null);
    const { exitCode, stderr } = await run("delete", "seq-1", "9", "--yes");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Timeline version not found: seq-1 v9");
    expect(deleteVersion).not.toHaveBeenCalled();
  });

  it("puts the failure on stdout too under --json", async () => {
    loadSequence.mockResolvedValueOnce(null);
    const { stdout } = await run("delete", "gone", "1", "--yes", "--json");
    expect(JSON.parse(stdout.trim())).toEqual({
      error: "Timeline sequence not found: gone"
    });
  });
});

describe("timeline versions helpers", () => {
  it("maps a row to the router's camelCase list item", () => {
    expect(toVersionListItem(versionRow())).toEqual({
      id: "ver-1",
      timelineId: "seq-1",
      version: 2,
      name: "before the cut",
      saveType: "manual",
      fps: 24,
      width: 1280,
      height: 720,
      durationMs: 4000,
      createdAt: "2026-08-01T09:00:00.000Z"
    });
  });

  it("renders one table row per version with a combined resolution", () => {
    const [row] = versionTableRows([toVersionListItem(versionRow())]);
    expect(row).toMatchObject({ version: 2, resolution: "1280x720", name: "before the cut" });
  });

  it("counts tracks, clips and markers of an unreadable document as zero", () => {
    expect(documentCounts("not json")).toEqual({
      tracks: 0,
      clips: 0,
      markers: 0
    });
  });

  it("rejects non-positive and non-integer versions", () => {
    expect(parseVersionNumber(" 3 ")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "v2", ""]) {
      expect(() => parseVersionNumber(bad)).toThrow(/positive integer/);
    }
  });
});
