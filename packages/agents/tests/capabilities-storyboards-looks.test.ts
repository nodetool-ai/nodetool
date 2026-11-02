import { beforeEach, expect, it } from "vitest";
import { initTestDb, Storyboard } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

beforeEach(() => initTestDb());

it("edit_storyboard sets board looks and shot overrides, including empty inheritance", async () => {
  // These document-only capabilities use user scope and never invoke a provider.
  const context = { userId: "u1" } as unknown as ProcessingContext;
  const run = createCapabilityRun({ context, gate: UNGATED });
  const board = await Storyboard.create<Storyboard>({ user_id: "u1", name: "Looks" });
  await run.invoke("edit_storyboard", {
    storyboard_id: board.id,
    ops: [
      { op: "set_board", look_preset_ids: ["look.arri-alexa"] },
      { op: "add_shot", action: "A lighthouse", look_preset_ids: ["look.bleach-bypass"] }
    ]
  });
  const updated = await Storyboard.get<Storyboard>(board.id);
  expect(updated?.toDocument().look_preset_ids).toEqual(["look.arri-alexa"]);
  expect(updated?.toDocument().shots[0].look_preset_ids).toEqual(["look.bleach-bypass"]);
  await run.invoke("edit_storyboard", { storyboard_id: board.id, ops: [{ op: "update_shot", target: "0", look_preset_ids: [] }] });
  expect((await Storyboard.get<Storyboard>(board.id))?.toDocument().shots[0].look_preset_ids).toEqual([]);
});
