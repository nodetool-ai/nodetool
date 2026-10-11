import { describe, expect, it } from "vitest";
import { gameBehavior } from "../src/game.js";
import { resolveGameScriptParams } from "../src/game-script-params.js";
import { gameBehavior3D } from "../src/game3d.js";

const source = "(input) => ({ state: input.state, commands: [] })";
const params = {
  speed: { type: "number", default: 2, minimum: 0, maximum: 10 },
  armed: { type: "boolean", default: false },
  tint: { type: "color", default: "#ff8800" },
  mode: { type: "enum", options: ["chase", "flee"] },
  target: { type: "entity" },
  sound: { type: "asset", kind: "audio", default: "hit" },
  offset: { type: "vector", dimensions: 3, default: { x: 0, y: 1, z: 0 } }
} as const;

describe.each([["2D", gameBehavior], ["3D", gameBehavior3D]] as const)("%s script parameters", (_dimension, schema) => {
  it("keeps legacy script behaviors without params unchanged", () => {
    const parsed = schema.parse({ kind: "script", source });
    expect(parsed).not.toHaveProperty("params");
    expect(parsed).not.toHaveProperty("values");
  });

  it("round-trips declarations and stored values", () => {
    const behavior = { kind: "script", source, params, values: { speed: 7, mode: "flee", target: "player", offset: { x: 1, y: 2, z: 3 } } };
    const parsed = schema.parse(JSON.parse(JSON.stringify(behavior)));
    expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(parsed).toMatchObject({ params, values: behavior.values });
  });

  it("rejects values outside their declarations", () => {
    for (const [values, path] of [
      [{ speed: 11 }, ["values", "speed"]],
      [{ speed: "fast" }, ["values", "speed"]],
      [{ mode: "hide" }, ["values", "mode"]],
      [{ tint: "orange" }, ["values", "tint"]],
      [{ offset: { x: 1, y: 2 } }, ["values", "offset"]],
      [{ armed: 1 }, ["values", "armed"]],
      [{ undeclared: 1 }, ["values", "undeclared"]]
    ] as const) {
      const result = schema.safeParse({ kind: "script", source, params, values });
      expect(result.success, JSON.stringify(values)).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(path);
    }
  });

  it("rejects invalid declarations", () => {
    for (const declared of [
      { speed: { type: "number", default: 20, maximum: 10 } },
      { speed: { type: "number", default: 0, minimum: 5, maximum: 1 } },
      { mode: { type: "enum", options: ["a", "a"] } },
      { mode: { type: "enum", options: ["a"], default: "b" } },
      { offset: { type: "vector", dimensions: 2, default: { x: 0, y: 0, z: 0 } } },
      { "not-an-identifier": { type: "boolean", default: true } },
      { constructor: { type: "boolean", default: true } },
      Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`p${index}`, { type: "boolean", default: true }]))
    ]) {
      expect(schema.safeParse({ kind: "script", source, params: declared }).success, JSON.stringify(declared)).toBe(false);
    }
  });

  it("never lets a __proto__ parameter reach the parsed object's prototype", () => {
    const parsed = schema.parse(JSON.parse(`{"kind":"script","source":"${source}","params":{"__proto__":{"type":"boolean","default":true}}}`));
    expect(parsed.kind === "script" && parsed.params).toEqual({});
    expect(Object.getPrototypeOf(parsed.kind === "script" ? parsed.params : null)).toBe(Object.prototype);
  });

  it("rejects values without declarations", () => {
    expect(schema.safeParse({ kind: "script", source, values: { speed: 1 } }).success).toBe(false);
  });
});

describe("script parameter resolution", () => {
  it("resolves stored values, then defaults, then null references", () => {
    const behavior = gameBehavior.parse({ kind: "script", source, params, values: { speed: 7 } });
    if (behavior.kind !== "script" || !behavior.params) { throw new Error("Fixture must be a script with params"); }
    expect(resolveGameScriptParams(behavior.params, behavior.values)).toEqual({
      speed: 7, armed: false, tint: "#ff8800", mode: "chase", target: null, sound: "hit", offset: { x: 0, y: 1, z: 0 }
    });
  });
});
