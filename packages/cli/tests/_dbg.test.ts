import { describe, it, vi } from "vitest";
import { Command } from "commander";
import { registerTimelineVersionsCommands } from "../src/commands/timeline-versions.js";
import { writeFileSync } from "node:fs";

const document = JSON.stringify({ tracks: [{ id: "t1" }], clips: [], markers: [] });
const row = {
  id: "ver-1", timeline_id: "seq-1", version: 2, name: null, save_type: "manual",
  fps: 24, width: 1280, height: 720, duration_ms: 4000,
  created_at: "2026-08-01T09:00:00.000Z", document
};
const seq = {
  id: "seq-1", user_id: "1", name: "n", fps: 30, width: 1920, height: 1080,
  duration_ms: 8000, updated_at: "2026-08-01T10:00:00.000Z", document
};

describe("dbg", () => {
  it("show", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(seq),
      listVersions: vi.fn().mockResolvedValue([row]),
      findVersion: vi.fn().mockResolvedValue(row),
      snapshot: vi.fn().mockResolvedValue(row),
      restore: vi.fn().mockResolvedValue(seq),
      deleteVersion: vi.fn()
    };
    const program = new Command();
    program.exitOverride();
    const timeline = program.command("timeline");
    registerTimelineVersionsCommands(timeline, {
      store: async () => store,
      validate: vi.fn().mockResolvedValue({ ok: true, errors: [], warnings: [] })
    });
    let err = "";
    const origErr = console.error;
    const origExit = process.exit;
    console.error = (...a: unknown[]) => { err += a.map(String).join(" ") + "\n"; };
    process.exit = ((c?: number) => { throw new Error(`__EXIT__${c}`); }) as typeof process.exit;
    try {
      await program.parseAsync(["node", "cli", "timeline", "versions", "show", "seq-1", "2"]);
    } catch (e) {
      err += "THROWN: " + String(e) + "\n" + ((e as Error).stack ?? "");
    } finally {
      console.error = origErr;
      process.exit = origExit;
    }
    writeFileSync("/tmp/dbg-out.txt", err);
  });
});
