import { expect, it } from "vitest";
import { GAME_3D_TOOL_LOOP_CASES, GAME_TOOL_LOOP_CASES } from "../src/evals/surfaces/game.js";

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
