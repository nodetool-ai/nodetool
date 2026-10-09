import { describe, expect, it } from "vitest";
import { gameEntity } from "../src/game.js";
import { gameEntity3D } from "../src/game3d.js";

const cases = [
  { dimension: "2D", schema: gameEntity, entity: { id: "actor", transform2d: { x: 0, y: 0 } } },
  { dimension: "3D", schema: gameEntity3D, entity: { id: "actor", transform3d: {} } }
];

describe.each(cases)("$dimension entity tags and properties", ({ schema, entity }) => {
  it("preserves tags and nested JSON properties through the stored JSON schema", () => {
    const input = { ...entity, tags: ["enemy", "guard"], props: { health: 25, details: { alert: false, route: ["north", null] } } };
    const parsed = schema.parse(JSON.parse(JSON.stringify(input)));
    expect(parsed).toMatchObject({ tags: ["enemy", "guard"], props: { health: 25, details: { alert: false, route: ["north", null] } } });
    expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("keeps legacy omission distinct from explicitly empty metadata", () => {
    const legacy = schema.parse(entity);
    expect(legacy).not.toHaveProperty("tags");
    expect(legacy).not.toHaveProperty("props");
    const empty = schema.parse({ ...entity, tags: [], props: {} });
    expect(empty).toHaveProperty("tags", []);
    expect(empty).toHaveProperty("props", {});
  });
  it("accepts exact metadata boundaries and rejects values beyond them", () => {
    const tags = Array.from({ length: 64 }, (_, index) => `${index}`.padEnd(128, "x"));
    const props = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`key${index}`, null]));
    expect(schema.safeParse({ ...entity, tags, props }).success).toBe(true);
    for (const invalidTags of [[...tags, "overflow"], ["duplicate", "duplicate"], [""], ["x".repeat(129)]]) {
      expect(schema.safeParse({ ...entity, tags: invalidTags }).success).toBe(false);
    }
    expect(schema.safeParse({ ...entity, props: { ...props, overflow: null } }).success).toBe(false);
    expect(schema.safeParse({ ...entity, props: { ["x".repeat(128)]: 1 } }).success).toBe(true);
    expect(schema.safeParse({ ...entity, props: { ["x".repeat(129)]: 1 } }).success).toBe(false);
    expect(schema.safeParse({ ...entity, props: { "": 1 } }).success).toBe(false);
    for (const value of [NaN, Infinity, undefined, () => 1]) {
      expect(schema.safeParse({ ...entity, props: { value } }).success).toBe(false);
    }
    let nested: unknown = null;
    for (let depth = 0; depth < 15; depth += 1) { nested = { nested }; }
    expect(schema.safeParse({ ...entity, props: { nested } }).success).toBe(true);
    expect(schema.safeParse({ ...entity, props: { nested: { nested } } }).success).toBe(false);
    // {"value":""} takes twelve UTF-8 bytes.
    expect(schema.safeParse({ ...entity, props: { value: "x".repeat(65536 - 12) } }).success).toBe(true);
    expect(schema.safeParse({ ...entity, props: { value: "x".repeat(65536 - 11) } }).success).toBe(false);
    expect(schema.safeParse({ ...entity, props: { value: "é".repeat((65536 - 12) / 2) } }).success).toBe(true);
    expect(schema.safeParse({ ...entity, props: { value: "é".repeat((65536 - 12) / 2) + "x" } }).success).toBe(false);
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects raw nested dangerous key %s before reconstruction", (key) => {
    const props = JSON.parse(`{"nested":{"${key}":null}}`);
    expect(schema.safeParse({ ...entity, props }).success).toBe(false);
    expect(schema.safeParse({ ...entity, props: { array: [props] } }).success).toBe(false);
    expect(schema.safeParse({ ...entity, props: { nullable: null } }).success).toBe(true);
  });

});

it("uses the actual command key for the property byte boundary", async () => {
  const {gameScriptCommand3D} = await import("../src/game3d/index.js");
  const value = "x".repeat(65528);
  expect(new TextEncoder().encode(JSON.stringify({a:value})).byteLength).toBe(65536);
  expect(gameScriptCommand3D.safeParse({kind:"setProp",key:"a",value}).success).toBe(true);
  expect(gameScriptCommand3D.safeParse({kind:"setProp",key:"a",value:value+"x"}).success).toBe(false);
});
