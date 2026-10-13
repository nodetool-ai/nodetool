import { expect, it } from "vitest";
import { GAME_ENVIRONMENT_PRESET_IDS_3D, gameEntity3D, getGameEnvironmentPreset3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createGameSession3D } from "../src/index.js";

function apply(document: GameDocument3D, preset: string, scene_id?: string): GameDocument3D {
  const op = anyGameDocumentOp.parse({ op: "apply_environment_preset", preset, ...(scene_id === undefined ? {} : { scene_id }) });
  const result = applyAnyGameOps(document, [op]);
  if (result.schemaVersion !== 3) { throw new Error("Preset cannot change game dimension"); }
  return result;
}

it.each(GAME_ENVIRONMENT_PRESET_IDS_3D)("applies %s atomically without changing unrelated scene data", (preset) => {
  const document = createNative3DGame("presets");
  const before = structuredClone(document);
  const result = apply(document, preset);
  expect(document).toEqual(before);
  const scene = result.scenes[0];
  expect(scene.entities.slice(0, document.scenes[0].entities.length)).toEqual(document.scenes[0].entities);
  const sun = scene.entities.at(-1);
  expect(sun?.tags).toContain("environment-preset-sun");
  expect(sun?.light3d).toEqual({ ...getGameEnvironmentPreset3D(preset).sun.light, castShadow: false });
  const expectedEnvironment = getGameEnvironmentPreset3D(preset).environment;
  if (expectedEnvironment.sky?.kind === "procedural") { expectedEnvironment.sky.sunEntityId = sun?.id; }
  expect(scene.environment).toEqual(expectedEnvironment);
  expect(result.assets).toEqual(document.assets);
  expect(result.prefabs).toEqual(document.prefabs);
  expect(apply(result, preset)).toEqual(result);
});

it("switches all presets without accumulating lights and preserves marker tags and props", () => {
  let document = createNative3DGame("switch-presets");
  document = apply(document, "sunny-day");
  const sun = document.scenes[0].entities.at(-1);
  if (!sun) { throw new Error("Preset sun missing"); }
  sun.tags?.push("artist-tag");
  sun.props = { artist: "original" };
  const count = document.scenes[0].entities.length;
  for (const preset of GAME_ENVIRONMENT_PRESET_IDS_3D) {
    document = apply(document, preset);
    expect(document.scenes[0].entities).toHaveLength(count);
    expect(document.scenes[0].entities.at(-1)).toMatchObject({ tags: ["environment-preset-sun", "artist-tag"], props: { artist: "original" } });
  }
});

it("preserves occupied IDs and ineligible marked or linked lights", () => {
  const document = createNative3DGame("occupied-sun");
  const scene = document.scenes[0];
  scene.entities.push(gameEntity3D.parse({ id: "environment-sun", transform3d: {}, tags: ["environment-preset-sun"],
    light3d: { kind: "directional", color: "#ffffff", intensity: 1 }, body3d: { type: "static" } }));
  scene.environment.sky = { kind: "procedural", sunEntityId: "environment-sun", turbidity: 2, rayleigh: 2, groundColor: "#000000", intensity: 1 };
  const occupied = structuredClone(scene.entities.at(-1));
  const result = apply(document, "night");
  expect(result.scenes[0].entities.find((entity) => entity.id === "environment-sun")).toEqual(occupied);
  expect(result.scenes[0].entities.at(-1)?.id).toBe("environment-sun-1");
  expect(apply(result, "neon-interior").scenes[0].entities).toHaveLength(result.scenes[0].entities.length);
});

it("reuses an eligible linked sun and targets only the selected scene", () => {
  const document = createNative3DGame("selected-scene");
  const extra = structuredClone(document.scenes[0]);
  extra.id = "other";
  extra.environment.sky = { kind: "procedural", sunEntityId: "sun", turbidity: 2, rayleigh: 2, groundColor: "#000000", intensity: 1 };
  document.scenes.push(extra);
  const result = apply(document, "overcast", "other");
  expect(result.scenes[0]).toEqual(document.scenes[0]);
  expect(result.scenes[1].entities).toHaveLength(extra.entities.length);
  expect(result.scenes[1].entities.find((entity) => entity.id === "sun")?.tags).toContain("environment-preset-sun");
});

it("preserves a preset sun edited into a physics entity and allocates a new pure sun", () => {
  const document = apply(createNative3DGame("edited-preset-sun"), "sunny-day");
  const edited = document.scenes[0].entities.at(-1);
  if (!edited) { throw new Error("Preset sun missing"); }
  edited.body3d = gameEntity3D.parse({ ...edited, body3d: { type: "static" } }).body3d;
  const before = structuredClone(edited);
  const result = apply(document, "night");
  expect(result.scenes[0].entities.find((entity) => entity.id === edited.id)).toEqual(before);
  expect(result.scenes[0].entities.at(-1)?.id).toBe("environment-sun-1");
  expect(apply(result, "neon-interior").scenes[0].entities).toHaveLength(result.scenes[0].entities.length);
});

it("preserves a linked sun that parents unrelated entities instead of rotating their world poses", () => {
  const document = createNative3DGame("parent-sun");
  const scene = document.scenes[0];
  scene.environment.sky = { kind: "procedural", sunEntityId: "sun", turbidity: 2, rayleigh: 2, groundColor: "#000000", intensity: 1 };
  scene.entities.push(gameEntity3D.parse({ id: "sun-child", parentId: "sun", transform3d: { position: { x: 1, y: 1, z: 0 } },
    primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: { color: "#ffffff" } } }));
  const before = structuredClone(scene.entities);
  const result = apply(document, "sunny-day");
  expect(result.scenes[0].entities.slice(0, before.length)).toEqual(before);
  expect(result.scenes[0].entities.at(-1)?.id).toBe("environment-sun");
});

it("uses preset shadows when available and preserves an unrelated shadow caster when occupied", () => {
  let document = createNative3DGame("shadow-priority");
  document.scenes[0].entities = document.scenes[0].entities.filter((entity) => entity.light3d === undefined);
  document = apply(document, "night");
  expect(document.scenes[0].entities.at(-1)?.light3d).toMatchObject({ castShadow: true });
  const presetLight = document.scenes[0].entities.at(-1)?.light3d;
  if (presetLight?.kind !== "directional") { throw new Error("Preset sun missing"); }
  presetLight.castShadow = false;
  document.scenes[0].entities.push(gameEntity3D.parse({ id: "artist-sun", transform3d: {},
    light3d: { kind: "directional", color: "#ff0000", intensity: 3, castShadow: true } }));
  const artistSun = structuredClone(document.scenes[0].entities.at(-1));
  for (const preset of ["night", "overcast", "sunny-day"] as const) {
    document = apply(document, preset);
    expect(document.scenes[0].entities.find((entity) => entity.id === "artist-sun")).toEqual(artistSun);
    expect(document.scenes[0].entities.find((entity) => entity.tags?.includes("environment-preset-sun"))?.light3d).toMatchObject({ castShadow: false });
    expect(apply(document, preset)).toEqual(document);
  }
});

it("preserves a fully tagged unmarked sky sun while reusing a fully tagged preset sun", () => {
  const document = createNative3DGame("tag-boundary");
  const scene = document.scenes[0];
  const linked = scene.entities.find((entity) => entity.id === "sun");
  if (!linked) { throw new Error("Directional sun missing"); }
  linked.tags = Array.from({ length: 64 }, (_, index) => `artist-${index}`);
  scene.environment.sky = { kind: "procedural", sunEntityId: linked.id, turbidity: 2, rayleigh: 2, groundColor: "#000000", intensity: 1 };
  const before = structuredClone(linked);
  const result = apply(document, "sunny-day");
  expect(result.scenes[0].entities.find((entity) => entity.id === linked.id)).toEqual(before);
  const presetSun = result.scenes[0].entities.at(-1);
  if (!presetSun) { throw new Error("Preset sun missing"); }
  expect(presetSun.id).toBe("environment-sun");
  expect(presetSun.light3d).toMatchObject({ castShadow: false });
  presetSun.tags = ["environment-preset-sun", ...Array.from({ length: 63 }, (_, index) => `preset-${index}`)];
  expect(apply(result, "night").scenes[0].entities).toHaveLength(result.scenes[0].entities.length);
  expect(apply(result, "night").scenes[0].entities.at(-1)?.tags).toEqual(presetSun.tags);
});

it("rejects unknown names, missing scenes, and entity overflow without mutating the input", () => {
  const document = createNative3DGame("invalid-preset");
  expect(() => apply(document, "constructor")).toThrow();
  expect(() => apply(document, "night", "missing")).toThrow(/does not exist/);
  const camera = document.scenes[0].entities[0];
  document.scenes[0].entities = [camera, ...Array.from({ length: 4095 }, (_, index) => gameEntity3D.parse({ id: `entity-${index}`, transform3d: {} }))];
  const before = structuredClone(document);
  expect(() => apply(document, "night")).toThrow();
  expect(document).toEqual(before);
});

it("replays 120 ticks from tick 60 for preset-authored scenes with seed 1", async () => {
  const document = apply(createNative3DGame("preset-replay"), "sunny-day");
  const session = await createGameSession3D(document, 1);
  let resumed: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  try {
    for (let tick = 0; tick < 120; tick++) {
      const result = session.step({ pressed: [] });
      if (tick === 59) { resumed = await createGameSession3D(document, 1, session.snapshot()); }
      else if (resumed) {
        expect(resumed.step({ pressed: [] }).events).toEqual(result.events);
        expect(resumed.snapshot()).toEqual(session.snapshot());
      }
    }
  } finally { resumed?.dispose(); session.dispose(); }
});
