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
      expect(snapshot.hud.find((label) => label.id === "win")?.text).toBe("SECTOR CLEAR");
      expect(snapshot.hud.find((label) => label.id === "ammo")?.text).toBe("08 / 18");
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
      expect(session.snapshot().hud.find((label) => label.id === "ammo")?.text).toBe("14 / 18");
      session.step(gameInputFrame3D.parse({ pressed: [], justPressed: ["r"] }));
      expect(session.snapshot().hud.find((label) => label.id === "weapon")?.text).toBe("RELOADING");
      for (let tick = 0; tick < 73; tick++) { session.step(idle); }
      expect(session.snapshot().hud.find((label) => label.id === "ammo")?.text).toBe("18 / 18");
    } finally {
      session.dispose();
    }
  }, 30_000);
});
