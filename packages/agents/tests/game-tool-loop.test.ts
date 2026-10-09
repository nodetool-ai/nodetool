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
