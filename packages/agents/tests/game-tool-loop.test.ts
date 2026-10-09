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
