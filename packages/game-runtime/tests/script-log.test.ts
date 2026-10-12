import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity3D, gameInputFrame3D, type GameDocument, type GameDocument3D, type GameInputFrame } from "@nodetool-ai/protocol";

import { openGameSession } from "../src/open-session.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { GAME_SCRIPT_LOG_LIMIT, GAME_SCRIPT_LOG_MESSAGE_LIMIT } from "../src/script-log.js";
import { createScriptedGameSession } from "../src/session.js";
import { blockout } from "./fixtures-game3d.js";

const idle: GameInputFrame = { pressed: [], justPressed: [] };

/** Moves right each tick. With `logs`, it also writes log lines that must not change the simulation. */
function mover(logs: boolean): string {
  return `(input) => ({ state: (input.state ?? 0) + 1, commands: [
    { kind: "setVelocity", x: 1 + input.random(), y: 0 }${logs ? `,
    { kind: "log", message: "tick " + input.tick },
    { kind: "log", level: "warning", message: "x " + input.entity.x.toFixed(2) }` : ""}] })`;
}

function game2D(source: string, maxCommands = 8): GameDocument {
  const base = createTopDownRoomGame("f".repeat(32));
  return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities,
    { id: "logger", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands, maxTickMs: 50 }] }
  ] })) });
}

function game3D(source: string): GameDocument3D {
  const document = blockout();
  document.scenes[0].entities.push(gameEntity3D.parse({ id: "logger", transform3d: { position: { x: 4, y: 1, z: 0 } },
    behaviors: [{ kind: "script", maxTickMs: 50, maxCommands: 8, source }] }));
  return document;
}

async function open3D(document: GameDocument3D, snapshot?: Parameters<typeof openGameSession>[1]["snapshot"]) {
  const result = await openGameSession(document, { seed: 1, snapshot });
  if (!result.ok) { throw new Error(JSON.stringify(result.diagnostics)); }
  if (result.opened.dimension !== "3d") { throw new Error("Expected a 3D session"); }
  return result.opened.session;
}

describe("2D script log command", () => {
  it("returns log lines on the step result and keeps them out of the snapshot", async () => {
    const session = await createScriptedGameSession(game2D(mover(true)), 1);
    try {
      const first = session.step(idle);
      expect(first.scriptLogs).toEqual([
        { tick: 0, entityId: "logger", level: "log", message: "tick 0" },
        { tick: 0, entityId: "logger", level: "warning", message: "x -5.00" }
      ]);
      expect(first.scriptStats?.commands).toBe(1);
      expect(JSON.stringify(session.snapshot())).not.toContain("tick 0");
      expect(session.step(idle).scriptLogs?.[0]).toEqual({ tick: 1, entityId: "logger", level: "log", message: "tick 1" });
    } finally { session.dispose(); }
  });

  it("omits scriptLogs on a tick without log commands", async () => {
    const session = await createScriptedGameSession(game2D(mover(false)), 1);
    try {
      expect(session.step(idle)).not.toHaveProperty("scriptLogs");
    } finally { session.dispose(); }
  });

  it("leaves snapshots and events identical to the same script without logs, through a replay from tick 60", async () => {
    const logged = await createScriptedGameSession(game2D(mover(true)), 1);
    const silent = await createScriptedGameSession(game2D(mover(false)), 1);
    try {
      for (let tick = 0; tick < 60; tick += 1) {
        const [withLogs, withoutLogs] = [logged.step(idle), silent.step(idle)];
        expect(withLogs.events).toEqual(withoutLogs.events);
      }
      const atSixty = logged.snapshot();
      expect(atSixty).toEqual(silent.snapshot());
      const tail = Array.from({ length: 60 }, () => logged.step(idle));
      for (let tick = 60; tick < 120; tick += 1) { silent.step(idle); }
      expect(logged.snapshot()).toEqual(silent.snapshot());
      const resumed = await createScriptedGameSession(game2D(mover(true)), 1, atSixty);
      try {
        const replayed = Array.from({ length: 60 }, () => resumed.step(idle));
        expect(replayed.map((step) => step.events)).toEqual(tail.map((step) => step.events));
        expect(replayed.map((step) => step.scriptLogs)).toEqual(tail.map((step) => step.scriptLogs));
        expect(resumed.snapshot()).toEqual(logged.snapshot());
      } finally { resumed.dispose(); }
    } finally { logged.dispose(); silent.dispose(); }
  });

  it("does not count log commands against maxCommands", async () => {
    const source = `() => ({ state: null, commands: [{ kind: "setVelocity", x: 1, y: 0 }, { kind: "log", message: "a" }, { kind: "log", message: "b" }] })`;
    const session = await createScriptedGameSession(game2D(source, 1), 1);
    try {
      expect(session.step(idle).scriptLogs?.map((line) => line.message)).toEqual(["a", "b"]);
    } finally { session.dispose(); }
  });

  it("caps lines per tick with one overflow line and truncates long messages instead of failing", async () => {
    const source = `(input) => ({ state: null, commands: [
      { kind: "log", message: "y".repeat(${GAME_SCRIPT_LOG_MESSAGE_LIMIT + 50}) },
      ...Array.from({ length: ${GAME_SCRIPT_LOG_LIMIT + 9} }, (_, index) => ({ kind: "log", level: "error", message: "line " + index }))] })`;
    const session = await createScriptedGameSession(game2D(source), 1);
    try {
      const logs = session.step(idle).scriptLogs ?? [];
      expect(logs).toHaveLength(GAME_SCRIPT_LOG_LIMIT + 1);
      expect(logs[0].message).toBe(`${"y".repeat(GAME_SCRIPT_LOG_MESSAGE_LIMIT)}…`);
      expect(logs[GAME_SCRIPT_LOG_LIMIT - 1]).toMatchObject({ level: "error", message: `line ${GAME_SCRIPT_LOG_LIMIT - 2}` });
      expect(logs[GAME_SCRIPT_LOG_LIMIT]).toEqual({ tick: 0, entityId: "logger", level: "warning",
        message: `10 more script log lines dropped at tick 0 (limit ${GAME_SCRIPT_LOG_LIMIT} per tick)` });
      expect(session.step(idle).scriptLogs).toHaveLength(GAME_SCRIPT_LOG_LIMIT + 1);
    } finally { session.dispose(); }
  });

  it("collects log lines returned by lifecycle hooks", async () => {
    const source = `({ onStart(input) { return { commands: [{ kind: "log", message: "started" }] }; },
      onUpdate(input) { return { commands: [{ kind: "log", message: "update " + input.tick }] }; } })`;
    const session = await createScriptedGameSession(game2D(source), 1);
    try {
      expect(session.step(idle).scriptLogs?.map((line) => line.message)).toEqual(["started", "update 0"]);
    } finally { session.dispose(); }
  });

  it("fails the script call on a malformed log command", async () => {
    const session = await createScriptedGameSession(game2D(`() => ({ state: null, commands: [{ kind: "log", message: 5 }] })`), 1);
    try {
      expect(() => session.step(idle)).toThrow(/Invalid log command at index 0/);
    } finally { session.dispose(); }
  });
});

describe("3D script log command", () => {
  const input = gameInputFrame3D.parse({ pressed: [] });
  const source = (logs: boolean) => `(input) => ({ state: (input.state ?? 0) + input.random(), commands: ${logs
    ? `[{ kind: "log", level: "error", message: "tick " + input.tick }]` : "[]"} })`;

  it("returns log lines on the step result and replays from tick 60 with the same snapshots as a silent script", async () => {
    const logged = await open3D(game3D(source(true)));
    const silent = await open3D(game3D(source(false)));
    try {
      expect(logged.step(input).scriptLogs).toEqual([{ tick: 0, entityId: "logger", level: "error", message: "tick 0" }]);
      expect(silent.step(input)).not.toHaveProperty("scriptLogs");
      for (let tick = 1; tick < 60; tick += 1) { logged.step(input); silent.step(input); }
      const atSixty = logged.snapshot();
      // The content digest covers the script source, which differs by the log command.
      expect({ ...atSixty, contentDigest: "" }).toEqual({ ...silent.snapshot(), contentDigest: "" });
      expect(JSON.stringify(atSixty)).not.toContain("tick 59");
      const tail = Array.from({ length: 60 }, () => logged.step(input));
      const resumed = await open3D(game3D(source(true)), atSixty);
      try {
        const replayed = Array.from({ length: 60 }, () => resumed.step(input));
        expect(replayed.map((step) => step.events)).toEqual(tail.map((step) => step.events));
        expect(replayed.map((step) => step.scriptLogs)).toEqual(tail.map((step) => step.scriptLogs));
        expect(resumed.snapshot()).toEqual(logged.snapshot());
      } finally { resumed.dispose(); }
    } finally { logged.dispose(); silent.dispose(); }
  });
});
