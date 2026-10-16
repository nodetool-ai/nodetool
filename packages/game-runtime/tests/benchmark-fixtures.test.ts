import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gameSnapshot, gameSnapshot3D, type GameSnapshot, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { hashGameSnapshot3D, openGameSession, validateAnyGame } from "../src/index.js";

async function snapshotHash(snapshot: GameSnapshot | GameSnapshot3D): Promise<string> {
  return "dimension" in snapshot ? hashGameSnapshot3D(snapshot) : createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

describe("benchmark fixture workloads", () => {
  it("runs all approved workloads serially for 120 ticks and replays from tick 60", async () => {
    for (const name of ["bench-2d-500", "bench-3d-1000", "bench-3d-64-scripted"]) {
      const validation = validateAnyGame(JSON.parse(await readFile(new URL(`../bench/${name}.json`, import.meta.url), "utf8")));
      if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
      const opened = await openGameSession(validation.document, { seed: 1 });
      if (!opened.ok) { throw new Error(opened.diagnostics.map((issue) => issue.message).join(", ")); }
      const session = opened.opened.session;
      const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
      try {
        for (let tick = 0; tick < 60; tick += 1) { session.step(input); }
        // Exercise serialized storage and keep both public sessions live without retaining 60 large snapshots.
        const checkpoint = session.snapshot();
        const stored: unknown = JSON.parse(JSON.stringify(checkpoint));
        const saved = "dimension" in checkpoint ? gameSnapshot3D.parse(stored) : gameSnapshot.parse(stored);
        expect(saved.tick).toBe(60);
        const restored = await openGameSession(validation.document, { seed: 1, snapshot: saved });
        if (!restored.ok) { throw new Error(restored.diagnostics.map((issue) => issue.message).join(", ")); }
        try {
          for (let tick = 60; tick < 120; tick += 1) {
            const live = session.step(input);
            const replay = restored.opened.session.step(input);
            const snapshot = session.snapshot();
            const replaySnapshot = restored.opened.session.snapshot();
            expect(replay.events).toEqual(live.events);
            expect(replaySnapshot).toEqual(snapshot);
            expect(await snapshotHash(replaySnapshot)).toBe(await snapshotHash(snapshot));
          }
          expect(session.snapshot().tick).toBe(120);
          expect(restored.opened.session.snapshot().tick).toBe(120);
        } finally { restored.opened.session.dispose(); }
      } finally { session.dispose(); }
    }
  }, 30_000);

  it.each(["bench-2d-500", "bench-3d-1000", "bench-3d-64-scripted"])("validates %s and retains its intended workload", async (name) => {
    const validation = validateAnyGame(JSON.parse(await readFile(new URL(`../bench/${name}.json`, import.meta.url), "utf8")));
    expect(validation.valid).toBe(true);
    if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
    const document = validation.document;
    const entities = document.scenes.flatMap((scene) => scene.entities);
    const scripts = entities.flatMap((entity) => entity.behaviors).filter((behavior) => behavior.kind === "script");
    if (document.schemaVersion === 3) {
      expect(entities).toHaveLength(name === "bench-3d-1000" ? 1000 : 64);
      expect(scripts).toHaveLength(name === "bench-3d-1000" ? 0 : 30);
      const spatial = document.scenes.flatMap((scene) => scene.entities);
      expect(spatial.filter((entity) => entity.body3d?.type === "dynamic")).toHaveLength(name === "bench-3d-1000" ? 100 : 61);
      expect(spatial.filter((entity) => entity.model)).toHaveLength(10);
    } else {
      expect(entities).toHaveLength(500);
      expect(scripts).toHaveLength(32);
      expect(document.scenes.flatMap((scene) => scene.entities).some((entity) => entity.tilemap)).toBe(true);
    }
  });
});
