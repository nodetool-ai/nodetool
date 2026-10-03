import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/open-session.js";

async function fixture() {
  const root = new URL("../samples/aether/", import.meta.url);
  const document = gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", root), "utf8")));
  const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", root), "utf8")));
  return { document, route };
}

describe("AETHER observatory", () => {
  it("crosses the ferry and restores the same winning route from a riding snapshot", async () => {
    const { document, route } = await fixture();
    const session = await createGameSession3D(document, 1);
    try {
      for (const input of route.slice(0, 606)) { session.step(input); }
      const checkpoint = session.snapshot();
      expect(checkpoint.entities.find(entity => entity.id === "player")?.controller?.supportId).toBe("ferry");
      const restored = await createGameSession3D(document, 1, checkpoint);
      try {
        const wins: number[] = [];
        for (const input of route.slice(606)) {
          const step = session.step(input);
          expect(restored.step(input).events).toEqual(step.events);
          if (step.events.some(event => event.kind === "win")) { wins.push(step.tick); }
        }
        expect(wins).toEqual([2368]);
        expect(restored.snapshot()).toEqual(session.snapshot());
        expect(session.snapshot()).toMatchObject({ won: true, score: 5 });
        expect(session.snapshot().hud.find(label => label.id === "returns")?.text).toBe("0 RETURNS");
        expect(session.snapshot().hud.find(label => label.id === "win")?.text).toBe("THE SKY REMEMBERS");
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  }, 90_000);

  it("returns a fallen explorer to the activated checkpoint without restoring collected prisms", async () => {
    const { document, route } = await fixture();
    const session = await createGameSession3D(document, 1);
    try {
      for (const input of route.slice(0, 270)) { session.step(input); }
      let returned = false;
      for (let tick = 0; tick < 180; tick++) {
        const result = session.step(gameInputFrame3D.parse({ pressed: [], axes: { moveX: 1 } }));
        if (result.events.some(event => event.kind === "trigger" && event.event === "return")) { returned = true; break; }
      }
      expect(returned).toBe(true);
      const snapshot = session.snapshot();
      expect(snapshot.score).toBe(1);
      expect(snapshot.won).toBe(false);
      expect(snapshot.entities.find(entity => entity.id === "prism-3")?.active).toBe(false);
      const player = snapshot.entities.find(entity => entity.id === "player")!;
      expect(player.transform.position.x).toBeCloseTo(-1, 1);
      expect(player.transform.position.z).toBeCloseTo(-18, 1);
      session.step(gameInputFrame3D.parse({ pressed: [], justPressed: ["respawn"] }));
      expect(session.snapshot().hud.find(label => label.id === "returns")?.text).toBe("2 RETURNS");
    } finally { session.dispose(); }
  }, 30_000);

  it("returns the player when a laser pulses on", async () => {
    const { document } = await fixture();
    document.scenes[0].entities.find(entity => entity.id === "player")!.transform3d.position = { x: 0, y: 2.82, z: -25 };
    const session = await createGameSession3D(document, 1);
    const events: string[] = [];
    try {
      for (let tick = 0; tick < 80; tick++) {
        for (const event of session.step(gameInputFrame3D.parse({ pressed: [] })).events) {
          if (event.kind === "trigger") { events.push(event.event); }
        }
      }
      expect(events).toContain("laser-hit");
      expect(events).toContain("return");
      expect(session.snapshot().entities.find(entity => entity.id === "player")!.transform.position.z).toBeCloseTo(5, 1);
    } finally { session.dispose(); }
  }, 30_000);

  it("collapses an occupied amber step and rebuilds it for another attempt", async () => {
    const { document } = await fixture();
    document.scenes[0].entities.find(entity => entity.id === "player")!.transform3d.position = { x: 3, y: 6.32, z: -74 };
    const session = await createGameSession3D(document, 1);
    const idle = gameInputFrame3D.parse({ pressed: [] });
    try {
      for (let tick = 0; tick < 60; tick++) { session.step(idle); }
      expect(session.snapshot().entities.find(entity => entity.id === "island-10")!.transform.position.y).toBe(-25);
      for (let tick = 60; tick < 270; tick++) { session.step(idle); }
      expect(session.snapshot().entities.find(entity => entity.id === "island-10")!.transform.position.y).toBeCloseTo(5.3);
      expect(session.snapshot().hud.find(label => label.id === "returns")?.text).toBe("1 RETURNS");
    } finally { session.dispose(); }
  }, 30_000);
});
