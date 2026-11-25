import { describe, expect, it } from "vitest";
import { gameDocument, gameEntity3D, type GameDocument, type GameInputFrame } from "@nodetool-ai/protocol";

import { createTopDownRoomGame } from "../src/sample.js";
import { GAME_SCRIPT_LOG_DATA_LIMIT } from "../src/script-log.js";
import { createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { blockout } from "./fixtures-game3d.js";

const idle: GameInputFrame = { pressed: [], justPressed: [] };

function game2D(source: string): GameDocument {
  const base = createTopDownRoomGame("e".repeat(32));
  return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities, { id: "checker", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands: 4, maxTickMs: 20 }] }
  ] })) });
}

/** Counts to 3, promises the count stays under 3, and reports whether it saw a test run. */
const COUNTER = `(input) => {
  const count = (input.state ?? 0) + 1;
  return { state: count, commands: [
    { kind: "log", tag: "COUNT", message: "count " + count, data: { count, test: input.test === true } },
    { kind: "assert", ok: count < 3, message: "count stays under 3" }
  ] };
}`;

describe("script test mode", () => {
  it("fails a test run at the first broken assert and names the tick and message", async () => {
    const session = await createScriptedGameSession(game2D(COUNTER), 1, undefined, undefined, { test: true });
    try {
      expect(session.step(idle).scriptLogs).toEqual([{ tick: 0, entityId: "checker", level: "log", tag: "COUNT", message: "count 1", data: { count: 1, test: true } }]);
      session.step(idle);
      expect(() => session.step(idle)).toThrow(/checker at tick 2 failed: Assertion failed: count stays under 3/);
    } finally {
      session.dispose();
    }
  });

  it("drops asserts in play and leaves input.test absent", async () => {
    const session = await createScriptedGameSession(game2D(COUNTER), 1);
    try {
      for (let tick = 0; tick < 5; tick += 1) { session.step(idle); }
      const last = session.step(idle);
      expect(last.scriptLogs?.[0]).toMatchObject({ tick: 5, data: { count: 6, test: false } });
    } finally {
      session.dispose();
    }
  });

  it("does not count asserts against maxCommands", async () => {
    const asserts = Array.from({ length: 8 }, (_, index) => `{ kind: "assert", ok: true, message: "a${index}" }`).join(", ");
    const session = await createScriptedGameSession(game2D(`(input) => ({ state: null, commands: [${asserts}] })`), 1, undefined, undefined, { test: true });
    try {
      expect(() => session.step(idle)).not.toThrow();
    } finally {
      session.dispose();
    }
  });

  it("rejects a malformed assert and drops log data over the limit", async () => {
    const malformed = await createScriptedGameSession(game2D(`(input) => ({ state: null, commands: [{ kind: "assert", message: "no ok" }] })`), 1);
    try {
      expect(() => malformed.step(idle)).toThrow(/Invalid assert command at index 0/);
    } finally {
      malformed.dispose();
    }
    const big = await createScriptedGameSession(game2D(`(input) => ({ state: null, commands: [{ kind: "log", message: "big", data: "x".repeat(${GAME_SCRIPT_LOG_DATA_LIMIT}) }] })`), 1);
    try {
      const [line] = big.step(idle).scriptLogs ?? [];
      expect(line.data).toBeUndefined();
      expect(line.message).toMatch(/^big \(data dropped: over 4096 characters of JSON\)$/);
    } finally {
      big.dispose();
    }
  });

  it("gives 3D scripts the same flag and assert", async () => {
    const document = blockout();
    document.scenes[0].entities.push(gameEntity3D.parse({ id: "checker", transform3d: { position: { x: 4, y: 1, z: 0 } },
      behaviors: [{ kind: "script", maxTickMs: 20, maxCommands: 4, source: `(input) => ({ state: null, commands: [{ kind: "assert", ok: input.test !== true, message: "play only" }] })` }] }));
    const play = await createGameSession3D(document, 1);
    try { expect(() => play.step({ pressed: [], justPressed: [], axes: {} })).not.toThrow(); } finally { play.dispose(); }
    const test = await createGameSession3D(document, 1, undefined, { test: true });
    try { expect(() => test.step({ pressed: [], justPressed: [], axes: {} })).toThrow(/Assertion failed: play only/); } finally { test.dispose(); }
  });
});
