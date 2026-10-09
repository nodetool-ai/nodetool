import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameInputFrame3D, parseGameDocument } from "@nodetool-ai/protocol";
import { createGameSession3D, createScriptedGameSession, createTopDownRoomGame, validateGame } from "../src/index.js";
import { planScriptProps } from "../src/script-props.js";
import { blockout } from "./fixtures-game3d.js";

type Behavior = { kind: "script"; source: string; maxCommands: number; maxTickMs: number };
const script = (source: string): Behavior => ({ kind: "script", source, maxCommands: 8, maxTickMs: 40 });
const input = { pressed: [] };
const input3D = gameInputFrame3D.parse({ pressed: [] });

function document2D(metadata: Record<string, { tags?: string[]; props?: Record<string, unknown>; behaviors?: Behavior[] }>, schemaVersion: 2 | 4 = 4) {
  const base = createTopDownRoomGame("metadata-input");
  return gameDocument.parse({
    ...base, schemaVersion, engineVersion: schemaVersion === 4 ? "3" : "1",
    scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => metadata[entity.id]
      ? { ...entity, ...metadata[entity.id], behaviors: metadata[entity.id].behaviors ?? entity.behaviors }
      : entity) }))
  });
}

function document3D(child: Record<string, unknown>) {
  const base = blockout();
  return gameDocument3D.parse({ ...base, scenes: [{ ...base.scenes[0], entities: [
    ...base.scenes[0].entities,
    { id: "child", transform3d: {}, ...child }
  ] }] });
}

function states(snapshot: { scriptState: Record<string, unknown> }): unknown[] {
  return Object.values(snapshot.scriptState);
}

describe("script input carries each entity's props once", () => {
  const blob = "x".repeat(40_000);

  it("fits 2D props that the self and world views both expose within 64 KiB", async () => {
    const document = document2D({ player: { props: { size: 1, blob }, behaviors: [
      script("({entity,world}) => ({state:{self:entity.props.blob.length,listed:world.find(item=>item.id===entity.id).props.blob.length},commands:[]})"),
      script("(input) => ({ state: { self: input.entity.props.size, world: input.world }, commands: [] })")
    ] } });
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step(input);
      const [fallback, persistent] = states(session.snapshot()) as [unknown, { self: number; world: { id: string; props: { blob: string } }[] }];
      expect(fallback).toEqual({ self: 40_000, listed: 40_000 });
      expect(persistent.self).toBe(1);
      expect(persistent.world.find((item) => item.id === "player")?.props.blob).toHaveLength(40_000);
    } finally { session.dispose(); }
  });

  it("fits 3D props that the self and world views both expose within 64 KiB", async () => {
    const document = document3D({ props: { blob }, behaviors: [{ kind: "script", maxTickMs: 40,
      source: "({entity,world}) => ({state:{self:entity.props.blob.length,listed:world.find(item=>item.id===entity.id).props.blob.length},commands:[]})" }] });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input3D);
      expect(states(session.snapshot())).toContainEqual({ self: 40_000, listed: 40_000 });
    } finally { session.dispose(); }
  });

  it("still rejects a logical input above 64 KiB", async () => {
    const document = document2D({
      player: { props: { blob }, behaviors: [script("() => ({state:null,commands:[]})")] },
      gem: { props: { blob } }
    });
    const session = await createScriptedGameSession(document, 1);
    try { expect(() => session.step(input)).toThrow(/Game script input exceeds 64 KiB/); }
    finally { session.dispose(); }
  });
});

describe("script property commands are validated before mutation", () => {
  it("names the entity and tick when a 2D setProp would exceed the props bound", async () => {
    const document = document2D({ player: { props: { a: "a".repeat(20_000) }, behaviors: [
      script("() => ({state:null,commands:[{kind:'setVelocity',x:5,y:0},{kind:'setProp',key:'b',value:'b'.repeat(50000)}]})")
    ] } });
    const session = await createScriptedGameSession(document, 1);
    try { expect(() => session.step(input)).toThrow(/props for player at tick 0 are invalid: Entity properties exceed 64 KiB/); }
    finally { session.dispose(); }
  });

  it("names the entity and tick when a 3D setProp would exceed the props bound", async () => {
    const document = document3D({ props: { a: "a".repeat(20_000) }, behaviors: [{ kind: "script", maxTickMs: 40,
      source: "({tick}) => ({state:null,commands:tick===1?[{kind:'setProp',key:'b',value:'b'.repeat(50000)}]:[]})" }] });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input3D);
      expect(() => session.step(input3D)).toThrow(/props for child at tick 1 are invalid: Entity properties exceed 64 KiB/);
    } finally { session.dispose(); }
  });

  it("plans every entity before returning and leaves current props untouched", () => {
    const current = { hero: { keep: 1 }, other: { big: "a".repeat(40_000) } };
    const snapshot = structuredClone(current);
    const results = [
      { entityId: "hero", commands: [{ kind: "setProp", key: "added", value: { nested: null } }, { kind: "removeProp", key: "keep" }] },
      { entityId: "other", commands: [{ kind: "setVelocity" }, { kind: "setProp", key: "more", value: "b".repeat(30_000) }] }
    ];
    expect(() => planScriptProps(results, (id) => current[id as keyof typeof current], 9, true))
      .toThrow("Game script props for other at tick 9 are invalid: Entity properties exceed 64 KiB");
    expect(current).toEqual(snapshot);
    expect(planScriptProps(results.slice(0, 1), (id) => current[id as keyof typeof current], 9, true))
      .toEqual(new Map([["hero", { added: { nested: null } }]]));
    expect(current).toEqual(snapshot);
  });

  it("rejects non-JSON values and reserved keys with the entity and tick", () => {
    expect(() => planScriptProps([{ entityId: "hero", commands: [{ kind: "setProp", key: "bad", value: Number.NaN }] }], () => undefined, 3, true))
      .toThrow(/setProp "bad" for hero at tick 3 is invalid/);
    expect(() => planScriptProps([{ entityId: "hero", commands: [{ kind: "setProp", key: "__proto__", value: 1 }] }], () => undefined, 3, true))
      .toThrow(/props for hero at tick 3 are invalid: Invalid entity property key/);
  });
});

describe("world.get and tag queries carry entity metadata", () => {
  it("returns the same 2D metadata to persistent and fresh-context scripts", async () => {
    const document = document2D({
      player: { tags: ["hero"], props: { hp: 3 }, behaviors: [
        script(`({world:listed}) => ({state:{got:world.get('gem'),pickups:world.query({tag:'pickup'}),heroes:world.query({tag:'hero'}),
          missing:world.query({tag:'none'}),listed:listed.find(item=>item.id==='gem')},commands:[]})`),
        script("(input) => ({ state: input.world, commands: [] })")
      ] },
      gem: { tags: ["pickup"], props: { value: { nested: null } } }
    });
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step(input);
      const [fallback, persistent] = states(session.snapshot()) as [
        { got: Record<string, unknown>; pickups: string[]; heroes: string[]; missing: string[]; listed: Record<string, unknown> },
        Record<string, unknown>[]
      ];
      const metadata = { tags: ["pickup"], props: { value: { nested: null } }, rotation: 0, active: true };
      expect(fallback.got).toMatchObject({ id: "gem", ...metadata });
      expect(fallback.listed).toMatchObject(metadata);
      expect(persistent.find((item) => item.id === "gem")).toEqual(fallback.listed);
      expect(fallback.pickups).toEqual(["gem"]);
      expect(fallback.heroes).toEqual(["player"]);
      expect(fallback.missing).toEqual([]);
    } finally { session.dispose(); }
  });

  it("returns 3D metadata from world.get and matches tags", async () => {
    const document = document3D({ tags: ["observer"], props: { nested: { nullable: null } }, behaviors: [{ kind: "script", maxTickMs: 40,
      source: "({entity,world:listed}) => ({state:{got:world.get(entity.id),hits:world.query({tag:'observer'}),listed:listed.find(item=>item.id===entity.id)},commands:[]})" }] });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input3D);
      const [state] = states(session.snapshot()) as [{ got: Record<string, unknown>; hits: string[]; listed: Record<string, unknown> }];
      expect(state.got).toMatchObject({ id: "child", tags: ["observer"], props: { nested: { nullable: null } }, active: true });
      expect(state.got).toEqual(state.listed);
      expect(state.hits).toEqual(["child"]);
    } finally { session.dispose(); }
  });
});

describe("schema version 4 reserves 2D entity metadata", () => {
  it("accepts schema 4 only with engine 3 and keeps legacy versions on engine 1", () => {
    const legacy = createTopDownRoomGame("legacy");
    expect(parseGameDocument(legacy).ok).toBe(true);
    expect(parseGameDocument({ ...legacy, schemaVersion: 2 }).ok).toBe(true);
    expect(parseGameDocument({ ...legacy, schemaVersion: 4, engineVersion: "3" }).ok).toBe(true);
    expect(parseGameDocument({ ...legacy, schemaVersion: 4 })).toMatchObject({ ok: false, diagnostics: [{ code: "unsupported_engine_version" }] });
    expect(parseGameDocument({ ...legacy, schemaVersion: 2, engineVersion: "3" })).toMatchObject({ ok: false, diagnostics: [{ code: "unsupported_engine_version" }] });
    expect(validateGame({ ...legacy, schemaVersion: 2, engineVersion: "3" }).errors).toContain("engineVersion: schema version 2 requires engine version 1");
    expect(validateGame(document2D({ player: { tags: ["hero"], props: { hp: 1 } } }, 2)).errors)
      .toEqual(expect.arrayContaining([expect.stringMatching(/tags: requires schema version 4/), expect.stringMatching(/props: requires schema version 4/)]));
  });

  it("keeps legacy script input free of metadata and rejects property commands", async () => {
    const document = document2D({ player: { behaviors: [
      script("({tick,entity,world}) => ({state:{keys:Object.keys(entity),world:Object.keys(world[0])},commands:tick===1?[{kind:'setProp',key:'hp',value:1}]:[]})")
    ] } }, 2);
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step(input);
      expect(states(session.snapshot())).toEqual([{ keys: ["id", "source", "x", "y", "velocityX", "velocityY", "touching"], world: ["id", "source", "x", "y"] }]);
      expect(session.snapshot().engineVersion).toBe("1");
      expect(() => session.step(input)).toThrow(/setProp "hp" for player at tick 1 requires schema version 4/);
    } finally { session.dispose(); }
  });

  it("writes engine 3 snapshots for schema 4 and refuses props in a legacy save", async () => {
    const modern = await createScriptedGameSession(document2D({ player: { props: { hp: 1 } } }), 1);
    const saved = JSON.parse(JSON.stringify(modern.snapshot()));
    modern.dispose();
    expect(saved.engineVersion).toBe("3");
    const legacy = document2D({}, 2);
    await expect(createScriptedGameSession(legacy, 1, saved)).rejects.toThrow(/engine version/);
    const legacySession = await createScriptedGameSession(legacy, 1);
    const legacySave = JSON.parse(JSON.stringify(legacySession.snapshot()));
    legacySession.dispose();
    legacySave.entities.find((entity: { id: string }) => entity.id === "player").props = { hp: 1 };
    await expect(createScriptedGameSession(legacy, 1, legacySave)).rejects.toThrow("Save entity player props require schema version 4");
  });
});
