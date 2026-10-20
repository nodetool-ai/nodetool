import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/open-session.js";

async function blacksite() {
  return gameDocument3D.parse(JSON.parse(await readFile(new URL("../samples/blacksite/game.json", import.meta.url), "utf8")));
}

const idle = gameInputFrame3D.parse({ pressed: [] });
const fire = gameInputFrame3D.parse({ pressed: ["fire"] });

describe("BLACKSITE mission", () => {
  it("completes the recorded firefight and emits victory only at extraction", async () => {
    const document = await blacksite();
    const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("../samples/blacksite/completion.inputs.json", import.meta.url), "utf8")));
    const session = await createGameSession3D(document, 1);
    const victories: number[] = [];
    try {
      for (const input of route) {
        const result = session.step(input);
        if (result.events.some((event) => event.kind === "trigger" && event.event === "victory")) {
          victories.push(result.tick);
        }
      }
      expect(victories).toEqual([560]);
      const snapshot = session.snapshot();
      const drones = snapshot.entities.filter((entity) => /^drone-\d$/.test(entity.id));
      expect(drones).toHaveLength(5);
      expect(drones.every((entity) => !entity.active)).toBe(true);
      expect(snapshot.ui?.["banner-title"]?.text).toBe("SECTOR CLEAR");
      expect(snapshot.ui?.["ammo-value"]?.text).toBe("08");
    } finally {
      session.dispose();
    }
  }, 30_000);

  it("telegraphs each drone shot with a charge at the firing drone", async () => {
    const session = await createGameSession3D(await blacksite(), 1);
    const advance = gameInputFrame3D.parse({ pressed: [], axes: { moveZ: -1 } });
    const cues: Record<string, number[]> = { charge: [], zap: [], hurt: [] };
    try {
      for (let tick = 0; tick < 240; tick++) {
        const result = session.step(tick >= 1 && tick <= 30 ? advance : idle);
        for (const event of result.events) {
          if (event.kind === "trigger" && event.event in cues) { cues[event.event].push(result.tick); }
        }
      }
      expect(cues.zap.length).toBeGreaterThan(0);
      expect(cues.zap.map((tick) => tick - 39)).toEqual(cues.charge.slice(0, cues.zap.length));
      expect(cues.hurt.length).toBeGreaterThan(0);
      expect(session.snapshot().ui?.["hp-value"]?.text).toBe(String(100 - 10 * cues.hurt.length));
    } finally {
      session.dispose();
    }
  }, 30_000);

  it("blocks rifle damage behind cover while consuming ammunition, then reloads", async () => {
    const document = await blacksite();
    const entities = document.scenes[0].entities;
    const player = entities.find((entity) => entity.id === "player");
    const drone = entities.find((entity) => entity.id === "drone-0");
    if (!player || !drone) { throw new Error("Mission actors are missing"); }
    player.transform3d.position = { x: -5, y: 0.81, z: 3 };
    drone.transform3d.position = { x: -5, y: 1.5, z: -3 };
    const session = await createGameSession3D(document, 1);
    try {
      session.step(idle);
      for (let tick = 0; tick < 28; tick++) { session.step(fire); }
      expect(session.inspect().entities.find((entity) => entity.id === "drone-0")?.active).toBe(true);
      expect(session.snapshot().ui?.["ammo-value"]?.text).toBe("14");
      session.step(gameInputFrame3D.parse({ pressed: [], justPressed: ["r"] }));
      expect(session.snapshot().ui?.weapon?.text).toBe("RELOADING");
      for (let tick = 0; tick < 73; tick++) { session.step(idle); }
      expect(session.snapshot().ui?.["ammo-value"]?.text).toBe("18");
    } finally {
      session.dispose();
    }
  }, 30_000);
});
