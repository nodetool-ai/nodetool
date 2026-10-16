import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, type GameSession3DOptions } from "../src/open-session.js";
import { decodePreparedGameCollider3D } from "../src/prepared-collider3d.js";

const sample = new URL("../samples/signal-forge/", import.meta.url);
const options: GameSession3DOptions = {
  resolveCollider: async (binding) => decodePreparedGameCollider3D(
    await readFile(new URL(`assets/${binding.assetId}.json`, sample)), binding)
};
async function fixture() {
  return gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", sample), "utf8")));
}
async function recordedRoute() {
  return gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", sample), "utf8")));
}

const surfaces = [
  { name: "left turbine housing", start: { x: -3.8, y: 0.9, z: -1.5 }, axes: { moveZ: -1 }, ticks: 60, axis: "z", surface: -3.175, direction: -1 },
  { name: "foundry service pillar", start: { x: 2.4, y: 0.9, z: -27 }, axes: { moveX: 1 }, ticks: 45, axis: "x", surface: 4.175, direction: 1 },
  { name: "induction coil tank", start: { x: 0, y: 0.9, z: -41 }, axes: { moveX: 1 }, ticks: 60, axis: "x", surface: 2.665, direction: 1 },
  { name: "final reactor pillar", start: { x: 0, y: 0.9, z: -59 }, axes: { moveX: 1 }, ticks: 45, axis: "x", surface: 1.675, direction: 1 }
] as const;

describe("Signal Forge authored collision surfaces", () => {
  it.each(surfaces)("blocks the courier at the visible $name", async (surface) => {
    const document = await fixture();
    const courier = document.scenes[0].entities.find((entity) => entity.id === "courier");
    if (!courier) { throw new Error("Signal Forge courier is missing"); }
    courier.transform3d.position = { ...surface.start };
    const session = await createGameSession3D(document, 1, undefined, options);
    try {
      const input = gameInputFrame3D.parse({ pressed: [], axes: surface.axes });
      for (let tick = 0; tick < surface.ticks; tick++) { session.step(input); }
      const position = session.snapshot().entities.find((entity) => entity.id === "courier")?.transform.position;
      if (!position) { throw new Error("Courier disappeared during collision test"); }
      expect((position[surface.axis] - surface.start[surface.axis]) * surface.direction).toBeGreaterThan(0.1);
      expect((position[surface.axis] - surface.surface) * surface.direction).toBeLessThanOrEqual(0);
    } finally { session.dispose(); }
  });

  it("keeps the complete objective route and exactly restores ticks 60 and 609", async () => {
    const document = await fixture();
    const route = await recordedRoute();
    const session = await createGameSession3D(document, 1, undefined, options);
    const milestones: string[] = [];
    const expected = ["relay-online", "checkpoint-forge", "coolant-online", "checkpoint-reactor", "reactor-online", "win"];
    const record = (events: ReturnType<typeof session.step>["events"]) => {
      for (const event of events) {
        const name = event.kind === "win" ? "win" : event.kind === "trigger" ? event.event : undefined;
        if (name && expected.includes(name)) { milestones.push(name); }
      }
    };
    try {
      for (const input of route.slice(0, 60)) { record(session.step(input).events); }
      const early = await createGameSession3D(document, 1, session.snapshot(), options);
      try {
        for (const input of route.slice(60, 120)) {
          const step = session.step(input);
          record(step.events);
          expect(early.step(input).events).toEqual(step.events);
          expect(early.snapshot()).toEqual(session.snapshot());
        }
      } finally { early.dispose(); }
      for (const input of route.slice(120, 609)) { record(session.step(input).events); }
      const restored = await createGameSession3D(document, 1, session.snapshot(), options);
      try {
        for (const input of route.slice(609)) {
          const step = session.step(input);
          record(step.events);
          expect(restored.step(input).events).toEqual(step.events);
        }
        expect(restored.snapshot()).toEqual(session.snapshot());
      } finally { restored.dispose(); }
      expect(milestones).toEqual(expected);
      expect(session.snapshot()).toMatchObject({ tick: 1219, won: true, score: 1 });
    } finally { session.dispose(); }
  }, 90_000);

  it("recovers manually and after a real fall without losing the foundry checkpoint", async () => {
    const document = await fixture();
    const route = await recordedRoute();
    const session = await createGameSession3D(document, 1, undefined, options);
    try {
      for (const input of route.slice(0, 600)) { session.step(input); }
      const manual = session.step(gameInputFrame3D.parse({ pressed: [], justPressed: ["respawn"] }));
      expect(manual.events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "recovered" }));
      const checkpoint = session.snapshot().entities.find((entity) => entity.id === "courier")?.transform.position;
      expect(checkpoint).toMatchObject({ x: 0, z: -19 });
      for (let tick = 0; tick < 30; tick++) { session.step(gameInputFrame3D.parse({ pressed: [], axes: { moveX: 1 } })); }
      let fell = false;
      let recovered = false;
      for (let tick = 0; tick < 240; tick++) {
        const result = session.step(gameInputFrame3D.parse({ pressed: [], axes: { moveZ: tick < 80 ? 1 : 0 } }));
        const position = session.snapshot().entities.find((entity) => entity.id === "courier")?.transform.position;
        if (position && position.y < -5) { fell = true; }
        if (result.events.some((event) => event.kind === "trigger" && event.event === "recovered")) { recovered = true; break; }
      }
      expect(fell).toBe(true);
      expect(recovered).toBe(true);
      expect(session.snapshot().entities.find((entity) => entity.id === "courier")?.transform.position).toMatchObject({ x: 0, z: -19 });
      expect(session.snapshot().scriptState[JSON.stringify(["forge", "courier", 1])]).toMatchObject({ cp: 2, stage: 1, won: false });
    } finally { session.dispose(); }
  }, 30_000);
});
