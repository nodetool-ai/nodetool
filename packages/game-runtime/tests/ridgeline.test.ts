import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, type GameAssetBinding3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/open-session.js";
import { decodePreparedGameCollider3D } from "../src/prepared-collider3d.js";

const sample = new URL("../samples/ridgeline/", import.meta.url);

async function ridgeline(): Promise<GameDocument3D> {
  return gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", sample), "utf8")));
}

async function resolveCollider(binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>) {
  return decodePreparedGameCollider3D(new Uint8Array(await readFile(new URL(`assets/${binding.assetId}.json`, sample))), binding);
}

const idle = gameInputFrame3D.parse({ pressed: [] });

describe("RIDGELINE flight", () => {
  it("flies the recorded route through all 13 gates in order and finishes on the low pass", async () => {
    const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", sample), "utf8")));
    const session = await createGameSession3D(await ridgeline(), 1, undefined, { resolveCollider });
    const gates: string[] = [];
    const cues: Record<string, number[]> = { victory: [], crash: [], touchdown: [], gear: [] };
    try {
      for (const input of route) {
        const result = session.step(input);
        for (const event of result.events) {
          if (event.kind !== "trigger") { continue; }
          if (event.event === "gate" && event.target?.entityId) { gates.push(event.target.entityId); }
          if (event.event in cues) { cues[event.event].push(result.tick); }
        }
      }
      expect(gates).toEqual(Array.from({ length: 13 }, (_, index) => `gate-${index + 1}`));
      expect(cues.victory).toEqual([7942]);
      expect(cues.crash).toEqual([]);
      expect(cues.gear).toHaveLength(1);
      const ui = session.snapshot().ui;
      expect(ui?.finish?.visible).toBe(true);
      expect(ui?.["finish-time"]?.text).toBe("2:11.77");
      expect(ui?.["gear-value"]?.text).toBe("UP");
    } finally {
      session.dispose();
    }
  }, 300_000);

  it("rests on its landing gear at the runway threshold", async () => {
    const session = await createGameSession3D(await ridgeline(), 1, undefined, { resolveCollider });
    try {
      for (let tick = 0; tick < 180; tick++) {
        const result = session.step(idle);
        expect(result.events.some((event) => event.kind === "trigger" && event.event === "crash")).toBe(false);
      }
      const jet = session.inspect({ entityId: "jet" }).entities.find((entity) => entity.id === "jet");
      if (!jet) { throw new Error("The jet is missing"); }
      // Wheels on the 46 m runway put the airframe origin about 1.8 m up.
      expect(jet.transform.position.y).toBeGreaterThan(47.4);
      expect(jet.transform.position.y).toBeLessThan(48.2);
      expect(Math.hypot(jet.velocity.x, jet.velocity.y, jet.velocity.z)).toBeLessThan(0.2);
      expect(session.snapshot().ui?.["gear-value"]?.text).toBe("DOWN");
    } finally {
      session.dispose();
    }
  }, 60_000);

  it("crashes into the sea and respawns at the last checkpoint", async () => {
    const document = await ridgeline();
    const jet = document.scenes[0].entities.find((entity) => entity.id === "jet");
    if (!jet?.transform3d) { throw new Error("The jet is missing"); }
    jet.transform3d.position = { x: 0, y: 24, z: 4900 };
    const session = await createGameSession3D(document, 1, undefined, { resolveCollider });
    const crashes: number[] = [];
    try {
      for (let tick = 0; tick < 60; tick++) {
        const result = session.step(idle);
        if (result.events.some((event) => event.kind === "trigger" && event.event === "crash")) { crashes.push(result.tick); }
      }
      expect(crashes).toHaveLength(1);
      const state = session.inspect({ entityId: "jet" }).entities.find((entity) => entity.id === "jet");
      expect(state?.transform.position.z).toBeCloseTo(820, 0);
      expect(state?.transform.position.y).toBeGreaterThan(46);
    } finally {
      session.dispose();
    }
  }, 60_000);
});
