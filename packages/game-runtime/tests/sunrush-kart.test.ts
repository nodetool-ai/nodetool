import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/open-session.js";

const sample = new URL("../samples/sunrush-kart/", import.meta.url);
const idle = gameInputFrame3D.parse({ pressed: [] });
const input = (axes = {}, justPressed: string[] = [], pressed: string[] = []) => gameInputFrame3D.parse({ axes, pressed, justPressed });
async function document() {
  return gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", sample), "utf8")));
}
function racerState(snapshot: GameSnapshot3D) {
  const value = snapshot.scriptState[JSON.stringify([snapshot.sceneId, "racer-0", 0])];
  if (!value || typeof value !== "object" || Array.isArray(value)) { throw new Error("Missing racer script state"); }
  return value;
}

describe("Sunrush Kart racing", () => {
  it("races three ordered laps with actual steering, uses each item, and restarts all racers", async () => {
    const game = await document();
    const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", sample), "utf8")));
    const session = await createGameSession3D(game, 1);
    const laps: number[] = [], items = new Set<string>(), wins: number[] = [];
    let checkpoint: GameSnapshot3D | undefined;
    let replayEnd: GameSnapshot3D | undefined;
    try {
      for (let tick = 0; tick < route.length; tick += 1) {
        const result = session.step(route[tick]);
        for (const event of result.events) {
          if (event.kind !== "trigger") { continue; }
          if (event.event === "lap" && typeof event.payload?.lap === "number") { laps.push(event.payload.lap); }
          if (event.event === "item" && typeof event.payload?.item === "string") { items.add(event.payload.item); }
          if (event.event === "win") { wins.push(result.tick); }
        }
        if (tick === 600) { checkpoint = session.snapshot(); }
        if (tick === 720) { replayEnd = session.snapshot(); }
      }
      expect(laps).toEqual([1, 2, 3]);
      expect(items).toEqual(new Set(["boost", "pulse", "shield"]));
      expect(wins).toHaveLength(1);
      expect(session.inspect({ entityId: "racer-0" }).entities[0].props?.race).toMatchObject({ phase: "finished", lap: 3, speed: 0, position: 1 });
      expect(racerState(session.snapshot()).results).toHaveLength(6);
      if (!checkpoint || !replayEnd) { throw new Error("Route missed replay checkpoint"); }
      const replay = await createGameSession3D(game, 1, checkpoint);
      try {
        for (const frame of route.slice(601, 721)) { replay.step(frame); }
        expect(replay.snapshot()).toEqual(replayEnd);
      } finally { replay.dispose(); }
      session.step(input({}, ["start"]));
      for (let tick = 0; tick < 12; tick += 1) { session.step(idle); }
      const reset = session.snapshot();
      for (let index = 0; index < 6; index += 1) {
        const racer = reset.scriptState[JSON.stringify([reset.sceneId, `racer-${index}`, 0])];
        expect(racer).toMatchObject({ phase: "countdown", lap: 0, finished: false, speed: 0, item: "" });
      }
    } finally { session.dispose(); }
  }, 120_000);

  it("holds on the grid, freezes the race when paused, and reverses without awarding a lap", async () => {
    const session = await createGameSession3D(await document(), 1);
    try {
      const initial = session.inspect({ entityId: "racer-0" }).entities[0].transform.position;
      for (let tick = 0; tick < 30; tick += 1) { session.step(input({ throttle: 1, steer: 1 })); }
      const grid = session.inspect({ entityId: "racer-0" }).entities[0].transform.position;
      expect(grid.x).toBeCloseTo(initial.x, 4);
      expect(grid.y).toBeCloseTo(initial.y, 4);
      expect(grid.z).toBeCloseTo(initial.z, 4);
      session.step(input({}, ["start"]));
      for (let tick = 0; tick < 180; tick += 1) { session.step(idle); }
      session.step(input({}, ["pause"]));
      const paused = racerState(session.snapshot());
      for (let tick = 0; tick < 30; tick += 1) { session.step(input({ throttle: 1, steer: 1 })); }
      expect(racerState(session.snapshot())).toEqual(paused);
      session.step(input({}, ["pause"]));
      for (let tick = 0; tick < 60; tick += 1) { session.step(input({ throttle: -1 })); }
      const reversed = racerState(session.snapshot());
      expect(reversed.progress).toBeLessThan(-0.008);
      expect(reversed.lap).toBe(0);
      expect(reversed.gate).toBe(1);
      session.step(input({}, ["recover"]));
      const recovered = racerState(session.snapshot());
      expect(recovered.speed).toBe(0);
      expect(recovered.lap).toBe(0);
      expect(recovered.boost).toBe(0);
    } finally { session.dispose(); }
  }, 30_000);

  it("rejects an out-of-order finish crossing and lets a shield absorb a pulse", async () => {
    const game = await document();
    const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", sample), "utf8")));
    const session = await createGameSession3D(game, 1);
    let checkpoint: GameSnapshot3D | undefined, crossing = 0;
    try {
      for (let tick = 0; tick < route.length; tick += 1) {
        session.step(route[tick]);
        const progress = session.inspect({ entityId: "racer-0" }).entities[0].props?.progress;
        if (typeof progress === "number" && progress > 0.97 && progress < 0.99) { checkpoint = session.snapshot(); crossing = tick; break; }
      }
    } finally { session.dispose(); }
    if (!checkpoint) { throw new Error("Route did not approach the finish line"); }
    const state = racerState(checkpoint);
    state.gate = 1;
    state.shield = 120;
    state.stun = 0;
    checkpoint.pendingEvents.push({ kind: "trigger", event: "pulse-hit", entityId: "racer-1", target: { entityId: "racer-0" } });
    const replay = await createGameSession3D(game, 1, checkpoint);
    try {
      replay.step(route[crossing + 1]);
      expect(racerState(replay.snapshot()).stun).toBe(0);
      for (const frame of route.slice(crossing + 2, crossing + 150)) { replay.step(frame); }
      const end = racerState(replay.snapshot());
      expect(end.progress).toBeGreaterThan(1);
      expect(end.lap).toBe(0);
      expect(end.finished).toBe(false);
    } finally { replay.dispose(); }
  }, 60_000);

  it("finishes behind an earlier rival without emitting a win", async () => {
    const game = await document();
    const route = gameInputFrame3D.array().parse(JSON.parse(await readFile(new URL("completion.inputs.json", sample), "utf8")));
    const session = await createGameSession3D(game, 1);
    const split = route.length - 60;
    let checkpoint: GameSnapshot3D;
    try {
      for (const frame of route.slice(0, split)) { session.step(frame); }
      checkpoint = session.snapshot();
    } finally { session.dispose(); }
    const rival = checkpoint.entities.find(entity => entity.id === "racer-1");
    const rivalState = checkpoint.scriptState[JSON.stringify([checkpoint.sceneId, "racer-1", 0])];
    if (!rival?.props || !rivalState || typeof rivalState !== "object" || Array.isArray(rivalState)) {
      throw new Error("Missing rival at the finish checkpoint");
    }
    Object.assign(rivalState, { finished: true, lap: 3, finishTime: 1, progress: 3.01, speed: 0 });
    Object.assign(rival.props, { finished: true, finishTime: 1, progress: 3.01 });
    const replay = await createGameSession3D(game, 1, checkpoint);
    const events: string[] = [];
    try {
      for (const frame of route.slice(split)) {
        for (const event of replay.step(frame).events) {
          if (event.kind === "trigger") { events.push(event.event); }
        }
      }
      expect(events).toContain("finish");
      expect(events).not.toContain("win");
      expect(replay.inspect({ entityId: "racer-0" }).entities[0].props?.race).toMatchObject({ phase: "finished", position: 2 });
      expect(racerState(replay.snapshot()).results).toEqual(expect.arrayContaining(["1. REEF   1.00s"]));
    } finally { replay.dispose(); }
  }, 120_000);

});
