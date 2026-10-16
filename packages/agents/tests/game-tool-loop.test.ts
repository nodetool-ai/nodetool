import { expect, it } from "vitest";
import { GAME_ENVIRONMENT_PRESET_IDS_3D, gameDocument3D, getGameEnvironmentPreset3D } from "@nodetool-ai/protocol";
import { createGameSession3D, validateGame3D } from "@nodetool-ai/game-runtime";
import { GAME_3D_TOOL_LOOP_CASES, GAME_TOOL_LOOP_CASES, MATERIAL_EVAL_PNG_BASE64 } from "../src/evals/surfaces/game.js";

it("authors four verified textures and a named toon material through public edits and replays it", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item => item.id === "material-system-3d");
  if (!candidate) { throw new Error("Material eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  const edit = bridge.tools.find(tool => tool.name === "edit_native_game");
  if (!predicate || !edit) { throw new Error("Material eval must expose edits and final-state validation"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const { prepareGameImage3D } = await import("@nodetool-ai/game-renderer/preparation3d");
  const bytes = Buffer.from(MATERIAL_EVAL_PNG_BASE64, "base64");
  const prepared = await prepareGameImage3D(bytes, { assetId: "material-eval-image" });
  if (!prepared.ok) { throw new Error("PNG fixture must prepare successfully"); }
  const initial = gameDocument3D.parse(bridge.finalState());
  for (const slot of ["base", "normal", "orm", "emissive"]) { expect(initial.assets[slot]).toEqual(prepared.image.binding); }
  expect(await edit.execute({ ops: [
    ...["base", "normal", "orm", "emissive"].map(slot => ({ op: "bind_asset", slot, binding: prepared.image.binding })),
    { op: "set_material", material_id: "toon", material: { shading: "toon", toonSteps: 4, outline: { color: "#000000", width: 0.02 },
      baseColorTexture: { assetId: "base", tiling: { x: 2, y: 3 }, offset: { x: 0.25, y: -0.5 } },
      normalTexture: { assetId: "normal" }, ormTexture: { assetId: "orm" }, emissiveTexture: { assetId: "emissive" } } },
    { op: "update_entity", entity_id: "crate", set: { primitive: { materialId: "toon" } } }
  ] })).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
  const document = gameDocument3D.parse(bridge.finalState());
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
  } finally {
    resumed?.dispose();
    session.dispose();
  }
});

it("applies all four named lighting presets through public edits and checks the eval predicate", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find((item) => item.id === "environment-preset-3d");
  if (!candidate) { throw new Error("Environment preset eval must be registered"); }
  const bridge = candidate.createBridge();
  const edit = bridge.tools.find((tool) => tool.name === "edit_native_game");
  const predicate = candidate.expect.finalState?.[0];
  if (!edit || !predicate) { throw new Error("Environment preset eval must expose public edits and its predicate"); }
  const initial = structuredClone(bridge.finalState());
  const initialDocument = gameDocument3D.parse(initial);
  const originalSun = initialDocument.scenes[0].entities.find((entity) => entity.light3d?.kind === "directional");
  if (!originalSun) { throw new Error("Native default sun missing"); }
  expect(predicate.test(initial)).toBe(false);
  await expect(edit.execute({ ops: [{ op: "apply_environment_preset", preset: "constructor" }] })).rejects.toThrow();
  expect(bridge.finalState()).toEqual(initial);
  for (const preset of GAME_ENVIRONMENT_PRESET_IDS_3D) {
    expect(await edit.execute({ ops: [{ op: "apply_environment_preset", preset }] })).not.toHaveProperty("error");
    const document = gameDocument3D.parse(bridge.finalState());
    const scene = document.scenes[0];
    const expected = getGameEnvironmentPreset3D(preset).environment;
    const sun = scene.entities.find((entity) => entity.tags?.includes("environment-preset-sun"));
    if (!sun) { throw new Error("Preset operation must select a sun"); }
    expect(scene.entities).toHaveLength(initialDocument.scenes[0].entities.length);
    expect(sun.id).toBe(originalSun.id);
    if (expected.sky?.kind === "procedural") { expected.sky.sunEntityId = sun.id; }
    expect(scene.environment).toEqual(expected);
    expect(predicate.test(document)).toBe(preset === "sunny-day");
  }
  expect(await edit.execute({ ops: [{ op: "apply_environment_preset", preset: "sunny-day" }] })).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
  const missingShadows = gameDocument3D.parse(bridge.finalState());
  const alteredSun = missingShadows.scenes[0].entities.find((entity) => entity.id === originalSun.id);
  if (alteredSun?.light3d?.kind !== "directional") { throw new Error("Preset sun missing"); }
  alteredSun.light3d.castShadow = false;
  expect(validateGame3D(missingShadows).valid).toBe(true);
  expect(predicate.test(missingShadows)).toBe(false);
});

it("scores native entity metadata authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="entity-tags-properties");
  if (!candidate) { throw new Error("Metadata eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Metadata eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{tags:["hero"],props:{health:10,nested:{nullable:null}}}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a 3D animation graph authored through the public edit surface", async () => {
  const candidate = GAME_3D_TOOL_LOOP_CASES.find(item=>item.id==="animation-graph-locomotion");
  if (!candidate) { throw new Error("Animation graph eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Animation graph eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const graph = { parameters: { speed: { kind: "float", default: 0 } }, layers: [{ id: "base", initialState: "move", states: {
    move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 2, clip: "walk" }, { value: 6, clip: "run" }] } } } }] };
  const rejected = await edit.execute({ops:[{op:"update_entity",entity_id:"player-visual",set:{animator3d:{graph:"locomotion"}}}]});
  expect(rejected).toMatchObject({ error: expect.stringContaining("Animation graph locomotion does not exist") });
  await edit.execute({ops:[{op:"set_animation_graph",graph_id:"locomotion",graph},{op:"update_entity",entity_id:"player-visual",set:{animator3d:{graph:"locomotion"}}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores an audio mixer authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="audio-mixer-buses");
  if (!candidate) { throw new Error("Mixer eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Mixer eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  await edit.execute({ops:[{op:"set_audio",mixer:{buses:{ambience:{parent:"sfx",volume:0.6}},assetBuses:{"sfx.collect":"ui"},
    snapshots:{victory:{buses:{music:{volume:0.2}}}},transitions:[{on:{kind:"win"},snapshot:"victory",fadeTicks:30}]}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a procedural sky authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="procedural-sky");
  if (!candidate) { throw new Error("Sky eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Sky eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const read = bridge.tools.find(tool=>tool.name==="get_native_game");
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!read || !edit) { throw new Error("Native game tools must exist"); }
  const { outline } = await read.execute({ view: "outline" }) as { outline: { scenes: { id: string; environment: Record<string, unknown> }[] } };
  const scene = outline.scenes[0];
  if (!scene) { throw new Error("Outline must list the scene"); }
  expect(await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { ...scene.environment, sky: { kind: "procedural", sunEntityId: "missing" } } } }] })).toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { sky: { kind: "procedural", sunEntityId: "sun", turbidity: 4 } } } }] });
  expect(predicate.test(bridge.finalState())).toBe(false);
  await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { ...scene.environment, sky: { kind: "procedural", sunEntityId: "sun", turbidity: 4 } } } }] });
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores script params set through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="script-parameters");
  if (!candidate) { throw new Error("Script params eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Script params eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const index = bridge.finalState().scenes[0].entities.find(entity=>entity.id==="player")?.behaviors.findIndex(behavior=>behavior.kind==="script");
  expect(await edit.execute({ops:[{op:"set_script_params",entity_id:"player",index,values:{target:"nowhere"}}]})).toMatchObject({error:expect.stringContaining("missing entity nowhere")});
  await edit.execute({ops:[{op:"set_script_params",entity_id:"player",index,values:{speed:6,target:"gem"}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a particles component authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="particle-emitter");
  if (!candidate) { throw new Error("Particle eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Particle eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const result = await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{particles:{emitters:[
    {id:"trail",rate:20,onDeath:[{emitter:"sparks",count:3}]},{id:"sparks",playOnStart:false,rate:0}
  ]}}}]});
  expect(result).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores render culling authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="render-culling");
  if (!candidate) { throw new Error("Render culling eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Render culling eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  expect(await edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{renderCulling:{layer:"props"}}}]})).toHaveProperty("error");
  const result = await edit.execute({ops:[
    {op:"set_performance",performance:{cullLayers:{props:{maxDistance:40}},budgets:{drawCalls:300}}},
    {op:"update_entity",entity_id:"crate",set:{renderCulling:{layer:"props"}}},
    {op:"update_entity",entity_id:"pickup",set:{renderCulling:{layer:"props"}}},
    {op:"update_entity",entity_id:"ramp",set:{renderCulling:{maxDistance:25}}}
  ]});
  expect(result).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores an input map authored through set_game input_bindings", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="input-bindings");
  if (!candidate) { throw new Error("Input binding eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Input binding eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  await edit.execute({ops:[{op:"set_game",input_bindings:{actions:{left:[{kind:"key",code:"KeyJ"},{kind:"gamepadButton",button:14}]},axes:{}}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a spatial audio source authored through update_entity", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="spatial-audio-source");
  if (!candidate) { throw new Error("Spatial audio eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Spatial audio eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const result = await edit.execute({ops:[{op:"update_entity",entity_id:"gem",set:{audioSource:{spatial:true,minDistance:2,maxDistance:20,distanceModel:"linear"}}}]});
  expect(result).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores particle render settings authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="particle-rendering");
  if (!candidate) { throw new Error("Particle rendering eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Particle rendering eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const result = await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{particles:{emitters:[
    {id:"embers",blend:"additive",unlit:true,layer:5,sprite:{assetId:"gem",columns:4,rows:2}}
  ]}}}]});
  expect(result).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a lifecycle timer script authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="lifecycle-timer-script");
  if (!candidate) { throw new Error("Lifecycle eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Lifecycle eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const behaviors = bridge.finalState().scenes[0].entities.find(entity=>entity.id==="player")?.behaviors ?? [];
  const source = "({ onStart() { every(60, \"beat\"); }, beat() { return { commands: [{ kind: \"emit\", event: \"heartbeat\" }] }; } })";
  await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{behaviors:[...behaviors,{kind:"script",source}]}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores 3D post-processing authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="post-processing");
  if (!candidate) { throw new Error("Post-processing eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Post-processing eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const read = bridge.tools.find(tool=>tool.name==="get_native_game");
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!read || !edit) { throw new Error("Native game tools must exist"); }
  const { outline } = await read.execute({ view: "outline" }) as { outline: { scenes: { id: string; environment: Record<string, unknown> }[] } };
  const scene = outline.scenes[0];
  if (!scene) { throw new Error("Outline must list the scene"); }
  const postProcessing = { toneMapping: "agx", exposure: 1.2, bloom: { intensity: 1.5 }, antialias: "smaa" };
  await expect(edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { ...scene.environment, postProcessing: { ...postProcessing, exposure: 99 } } } }] })).rejects.toThrow();
  expect(predicate.test(bridge.finalState())).toBe(false);
  await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { postProcessing } } }] });
  expect(predicate.test(bridge.finalState())).toBe(false);
  await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { ...scene.environment, postProcessing } } }] });
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores cascaded shadows authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="cascaded-shadows");
  if (!candidate) { throw new Error("Shadow eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Shadow eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const read = bridge.tools.find(tool=>tool.name==="get_native_game");
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!read || !edit) { throw new Error("Native game tools must exist"); }
  const { outline } = await read.execute({ view: "outline" }) as { outline: { scenes: { id: string; environment: { shadows: Record<string, unknown> } & Record<string, unknown> }[] } };
  const scene = outline.scenes[0];
  if (!scene) { throw new Error("Outline must list the scene"); }
  const cascaded = { ...scene.environment, shadows: { ...scene.environment.shadows, cascades: { count: 4, maxDistance: 150 } } };
  await expect(edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: { ...cascaded, shadows: { ...cascaded.shadows, cascades: { count: 5 } } } } }] })).rejects.toThrow(/Too big/);
  await edit.execute({ ops: [{ op: "update_scene", scene_id: scene.id, set: { environment: cascaded } }] });
  expect(predicate.test(bridge.finalState())).toBe(false);
  await edit.execute({ ops: [{ op: "update_entity", entity_id: "sun", set: { light3d: { shadowNormalBias: 0.03 } } }] });
  expect(predicate.test(bridge.finalState())).toBe(true);
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a typed event script authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="typed-event-script");
  if (!candidate) { throw new Error("Typed event eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Typed event eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const behaviors = (id: string) => bridge.finalState().scenes[0].entities.find(entity=>entity.id===id)?.behaviors ?? [];
  const sender = "({ onStart() { return { commands: [{ kind: \"emit\", event: \"bonus\", payload: { points: 5 }, target: { entityId: \"gem\" } }] }; } })";
  const receiver = "({ onEvent(input, event) { return { state: { points: event.payload.points } }; } })";
  await edit.execute({ops:[
    {op:"update_entity",entity_id:"player",set:{behaviors:[...behaviors("player"),{kind:"script",source:sender}]}},
    {op:"update_entity",entity_id:"gem",set:{behaviors:[...behaviors("gem"),{kind:"script",source:receiver}]}}
  ]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("accepts equivalent typed event scripts and rejects incorrect ones", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="typed-event-script");
  const predicate = candidate?.expect.finalState?.[0];
  if (!candidate || !predicate) { throw new Error("Typed event eval case must inspect final state"); }
  const score = async (sender: string, receiver: string): Promise<boolean> => {
    const bridge = candidate.createBridge();
    const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
    if (!edit) { throw new Error("Native edit tool must exist"); }
    const behaviors = (id: string) => bridge.finalState().scenes[0].entities.find(entity=>entity.id===id)?.behaviors ?? [];
    await edit.execute({ops:[
      {op:"update_entity",entity_id:"player",set:{behaviors:[...behaviors("player"),{kind:"script",source:sender}]}},
      {op:"update_entity",entity_id:"gem",set:{behaviors:[...behaviors("gem"),{kind:"script",source:receiver}]}}
    ]});
    return predicate.test(bridge.finalState());
  };
  const receiver = "({ onEvent(input, event) { return { state: { points: event.payload.points } }; } })";
  // Quoted keys, another key order, a function-valued hook and destructuring are equivalent answers.
  expect(await score("({ \"onStart\": function (input) { const command = { \"target\": { \"entityId\": 'gem' }, payload: { 'points': 5 }, event: `bonus`, kind: \"emit\" }; return { commands: [command] }; } })",
    "({ onEvent: (input, { payload: { points } }) => ({ state: points }) })")).toBe(true);
  expect(await score("({ onStart() { return { commands: [{ kind: 'emit', event: 'bonus', payload: { points: 5 }, target: { entityId: 'gem', tag: 'loot' } }] }; } })", receiver)).toBe(false);
  expect(await score("({ onStart() { return { commands: [{ kind: 'emit', event: 'bonus', payload: { points: 4 }, target: { entityId: 'gem' } }] }; } })", receiver)).toBe(false);
  expect(await score("({ onUpdate() { return { commands: [{ kind: 'emit', event: 'bonus', payload: { points: 5 }, target: { entityId: 'gem' } }] }; } })", receiver)).toBe(false);
  expect(await score("({ onStart() { return { commands: [{ kind: 'emit', event: 'bonus', payload: { points: 5 }, target: { entityId: 'gem' } }] }; } })",
    "({ onUpdate(input) { return { state: input.events.length }; } })")).toBe(false);
});

it("scores a collision layer matrix authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="collision-layer-matrix");
  if (!candidate) { throw new Error("Collision layer eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Collision layer eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  expect(await edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{collider3d:{layer:"debris"}}}]})).toHaveProperty("error");
  const layered = [
    {op:"set_game",collision_layers:["world","player","debris"]},
    {op:"update_entity",entity_id:"player",set:{collider3d:{layer:"player"}}},
    {op:"update_entity",entity_id:"crate",set:{collider3d:{layer:"debris"}}}
  ];
  expect(await edit.execute({ops:layered})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await edit.execute({ops:[{op:"set_game",collision_matrix:[["debris","player"]]}]})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores physics materials authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="physics-materials");
  if (!candidate) { throw new Error("Physics material eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Physics material eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  expect(await edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{collider3d:{physicsMaterial:"rubber"}}}]})).toHaveProperty("error");
  const materials = {op:"set_game",physics_materials:{ice:{friction:0.02,frictionCombine:"min"},rubber:{restitution:0.85}}};
  expect(await edit.execute({ops:[materials,
    {op:"update_entity",entity_id:"floor",set:{collider3d:{physicsMaterial:"ice"}}},
    {op:"update_entity",entity_id:"crate",set:{collider3d:{physicsMaterial:"rubber"}}}]})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await edit.execute({ops:[{op:"set_game",physics_materials:{...materials.physics_materials,rubber:{restitution:0.85,restitutionCombine:"max"}}}]})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a 3D HUD tree with a health bar and an action button authored through the public edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="hud-widget-tree-3d");
  if (!candidate) { throw new Error("3D HUD eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("3D HUD eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const read = bridge.tools.find(tool=>tool.name==="get_native_game");
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!read || !edit) { throw new Error("Native game tools must exist"); }
  const { document } = await read.execute({ view: "full" }) as { document: { scenes: { entities: { id: string; behaviors: unknown[] }[] }[] } };
  const behaviors = document.scenes[0].entities.find(entity=>entity.id==="player")?.behaviors ?? [];
  const nodes = [
    { kind: "bar", id: "health", offset: { x: 16, y: 16 }, width: 180, height: 14, source: { kind: "health", entityId: "player" } },
    { kind: "button", id: "jumpButton", anchor: { x: 0.5, y: 1 }, width: 112, height: 40, action: "jump", text: "Jump" }
  ];
  const rejected = await edit.execute({ops:[{op:"set_ui",ui:{nodes}}]});
  expect(JSON.stringify(rejected)).toContain("HUD bar health reads health of player, which has no health behavior in this scene");
  await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{behaviors:[...behaviors,{kind:"health",maximum:5}]}},{op:"set_ui",ui:{nodes}}]});
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("scores a player save script authored through the public edit surface and rejects incorrect ones", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="player-saves-script");
  const predicate = candidate?.expect.finalState?.[0];
  if (!candidate || !predicate) { throw new Error("Player saves eval case must inspect final state"); }
  expect(predicate.test(candidate.createBridge().finalState())).toBe(false);
  const score = async (source: string): Promise<boolean> => {
    const bridge = candidate.createBridge();
    const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
    if (!edit) { throw new Error("Native edit tool must exist"); }
    const behaviors = bridge.finalState().scenes[0].entities.find(entity=>entity.id==="player")?.behaviors ?? [];
    expect(await edit.execute({ops:[{op:"update_entity",entity_id:"player",set:{behaviors:[...behaviors,{kind:"script",source}]}}]})).not.toHaveProperty("error");
    return predicate.test(bridge.finalState());
  };
  const onUpdate = "onUpdate(input) { return { state: input.loaded ? input.loaded[0].data : input.state }; }";
  expect(await score(`({ onStart() { return { commands: [{ kind: "load", slot: "main" }, { kind: "save", slot: "audio", scope: "settings", data: { volume: 0.8 } }] }; }, ${onUpdate} })`)).toBe(true);
  // An explicit progress scope, another key order and computed access to loaded are equivalent answers.
  expect(await score(`({ "onStart": function () { const save = { data: { "volume": 0.8 }, scope: 'settings', slot: \`audio\`, kind: "save" }; return { commands: [{ scope: "progress", slot: "main", kind: "load" }, save] }; },
    onUpdate: (input) => ({ state: input["loaded"] }) })`)).toBe(true);
  expect(await score(`({ onStart() { return { commands: [{ kind: "load", slot: "main" }, { kind: "save", slot: "audio", data: { volume: 0.8 } }] }; }, ${onUpdate} })`)).toBe(false);
  expect(await score(`({ onStart() { return { commands: [{ kind: "load", slot: "main", scope: "settings" }, { kind: "save", slot: "audio", scope: "settings", data: { volume: 0.8 } }] }; }, ${onUpdate} })`)).toBe(false);
  expect(await score(`({ onStart() { return { commands: [{ kind: "load", slot: "main" }, { kind: "save", slot: "audio", scope: "settings", data: { volume: 0.8 } }] }; }, onUpdate(input) { return { state: input.state }; } })`)).toBe(false);
});

it("scores 3D particle draw styles authored through the public 3D edit surface", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item=>item.id==="particle-rendering-3d");
  if (!candidate) { throw new Error("3D particle rendering eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("3D particle rendering eval must inspect final state"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const edit = bridge.tools.find(tool=>tool.name==="edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  await expect(edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{particles:{emitters:[
    {id:"sparks",render:{kind:"stretched",length:2},softness:-1}
  ]}}}]})).rejects.toThrow("softness");
  const sparks = {id:"sparks",blend:"additive",render:{kind:"stretched",length:2},softness:0.5};
  expect(await edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{particles:{emitters:[sparks,
    {id:"debris",render:{kind:"mesh",shape:"box"}}]}}}]})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await edit.execute({ops:[{op:"update_entity",entity_id:"crate",set:{particles:{emitters:[sparks,
    {id:"debris",render:{kind:"mesh",shape:"box",align:"velocity"}}]}}}]})).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it.each(["streaming-music", "streaming-music-3d"])("scores %s authored through update_scene", async (id) => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item => item.id === id);
  if (!candidate) { throw new Error("Streaming music eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  if (!predicate) { throw new Error("Streaming music eval must inspect final state"); }
  const edit = bridge.tools.find(tool => tool.name === "edit_native_game");
  if (!edit) { throw new Error("Native edit tool must exist"); }
  const sceneId = bridge.finalState().entrySceneId;
  const music = { assetId: "music.theme", volume: 0.6, fadeInTicks: 30, fadeOutTicks: 45 };
  expect(predicate.test(bridge.finalState())).toBe(false);
  await expect(edit.execute({ ops: [{ op: "update_scene", scene_id: sceneId, set: { music: {
    ...music, streaming: { loopStartSeconds: 90, loopEndSeconds: 12 }
  } } }] })).rejects.toThrow();
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await edit.execute({ ops: [{ op: "update_scene", scene_id: sceneId, set: { music } }] })).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await edit.execute({ ops: [{ op: "update_scene", scene_id: sceneId, set: { music: {
    ...music, streaming: { loopStartSeconds: 12, loopEndSeconds: 90 }
  } } }] })).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});


it.each(["script-hot-reload", "script-hot-reload-3d"].flatMap(id => (["set_script", "update_behavior"] as const).map(op => [id, op] as const)))("scores a source-only edit for %s through %s", async (id, op) => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item => item.id === id);
  if (!candidate) { throw new Error("Hot reload eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  const edit = bridge.tools.find(tool => tool.name === "edit_native_game");
  if (!predicate || !edit) { throw new Error("Hot reload eval must expose source editing and scoring"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const behavior = bridge.finalState().scenes[0].entities.find(entity => entity.id === "mover")?.behaviors[0];
  if (behavior?.kind !== "script") { throw new Error("Mover must have an existing script"); }
  const source = behavior.source.replace("x: 1", "x: 4");
  const patch = op === "set_script" ? { op, entity_id: "mover", index: 0, source }
    : { op, entity_id: "mover", index: 0, behavior: { source } };
  const result = await edit.execute({ ops: [patch] });
  expect(result).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
});

it("authors all three world-space force commands through public edits and replays their motion", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item => item.id === "forces-and-torques-3d");
  if (!candidate) { throw new Error("Force eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  const edit = bridge.tools.find(tool => tool.name === "edit_native_game");
  if (!predicate || !edit) { throw new Error("Force eval must expose public editing and scoring"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const source = "input => ({ state: input.state, commands: input.tick === 0 ? [{ kind: 'addForce', force: { x: 120, y: 0, z: 0 } }, { kind: 'addTorque', torque: { x: 0, y: 60, z: 0 } }, { kind: 'addForceAtPoint', force: { x: 0, y: 0, z: 120 }, point: { x: 20, y: 11, z: 20 } }] : [] })";
  const behaviors = bridge.finalState().scenes[0].entities.find(entity => entity.id === "crate")?.behaviors ?? [];
  const author = async (value: string) => edit.execute({ ops: [{ op: "update_entity", entity_id: "crate", set: {
    behaviors: [...behaviors, { kind: "script", source: value }]
  } }] });
  expect(await author(source.replace("y: 60", "y: 0"))).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(false);
  expect(await author(source)).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
  const document = gameDocument3D.parse(bridge.finalState());
  const session = await createGameSession3D(document, 1);
  let resumed: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  let initialAngular = { x: 0, y: 0, z: 0 };
  try {
    for (let tick = 0; tick < 120; tick++) {
      const input = { pressed: [] };
      const result = session.step(input);
      if (tick === 0) {
        const crate = session.snapshot().entities.find(entity => entity.id === "crate");
        if (!crate) { throw new Error("Force fixture crate must survive its first tick"); }
        initialAngular = crate.angularVelocity;
      }
      if (tick === 59) {
        resumed = await createGameSession3D(document, 1, session.snapshot());
      } else if (resumed) {
        expect(resumed.step(input).events).toEqual(result.events);
        expect(resumed.snapshot()).toEqual(session.snapshot());
      }
    }
    const crate = session.snapshot().entities.find(entity => entity.id === "crate");
    if (!crate) { throw new Error("Force fixture crate must survive"); }
    expect(crate.transform.position.x).toBeGreaterThan(20);
    expect(crate.transform.position.z).toBeGreaterThan(20);
    expect(crate.velocity.x).toBeCloseTo(0.25, 4);
    expect(crate.velocity.z).toBeCloseTo(0.25, 4);
    expect(Math.abs(initialAngular.x)).toBeGreaterThan(0);
    expect(Math.abs(initialAngular.y)).toBeGreaterThan(0);
    expect(crate.angularVelocity.x).toBeCloseTo(initialAngular.x, 4);
    expect(crate.angularVelocity.y).toBeCloseTo(initialAngular.y, 4);
    expect(crate.transform.rotation).not.toEqual([0, 0, 0, 1]);
  } finally {
    resumed?.dispose();
    session.dispose();
  }
});


it("authors height fog and a validated receiver decal through public game edits", async () => {
  const candidate = GAME_TOOL_LOOP_CASES.find(item => item.id === "height-fog-and-decals-3d");
  if (!candidate) { throw new Error("Height fog and decals eval case must exist"); }
  const bridge = candidate.createBridge();
  const predicate = candidate.expect.finalState?.[0];
  const edit = bridge.tools.find(tool => tool.name === "edit_native_game");
  if (!predicate || !edit) { throw new Error("R6 eval must expose public editing and scoring"); }
  expect(predicate.test(bridge.finalState())).toBe(false);
  const document = gameDocument3D.parse(bridge.finalState());
  const scene = document.scenes[0];
  expect(await edit.execute({ ops: [
    { op: "update_scene", scene_id: scene.id, set: { environment: { ...scene.environment,
      fog: { kind: "height", color: "#cad9e4", density: 0.08, baseHeight: 2, heightFalloff: 0.5, maxOpacity: 0.95 } } } },
    { op: "add_entity", scene_id: scene.id, entity: { id: "graffiti", transform3d: { position: { x: 0, y: 1, z: 0 } },
      decal3d: { assetId: "paint", receiverId: "crate", size: { x: 1, y: 1, z: 0.25 }, opacity: 0.8, renderOrder: 2 } } }
  ] })).not.toHaveProperty("error");
  expect(predicate.test(bridge.finalState())).toBe(true);
  const before = bridge.finalState();
  expect(await edit.execute({ ops: [{ op: "update_entity", entity_id: "graffiti", set: { decal3d: { receiverId: "missing" } } }] }))
    .toHaveProperty("error");
  expect(bridge.finalState()).toEqual(before);
  const authored = gameDocument3D.parse(bridge.finalState());
  const session = await createGameSession3D(authored, 1);
  let replay: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  try {
    for (let tick = 0; tick < 120; tick++) {
      const result = session.step({ pressed: [] });
      if (tick === 59) { replay = await createGameSession3D(authored, 1, session.snapshot()); }
      else if (replay) {
        expect(replay.step({ pressed: [] }).events).toEqual(result.events);
        expect(replay.snapshot()).toEqual(session.snapshot());
      }
    }
  } finally { replay?.dispose(); session.dispose(); }
});
