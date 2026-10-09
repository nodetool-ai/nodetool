import { expect, it } from "vitest";
import { GAME_TOOL_LOOP_CASES } from "../src/evals/surfaces/game.js";

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
