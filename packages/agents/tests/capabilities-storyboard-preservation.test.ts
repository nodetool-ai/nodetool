import { beforeEach, describe, expect, it, vi } from "vitest";
import { Storyboard, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { directStoryboard, editStoryboard } from "../src/capabilities/storyboards.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
const directed = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/runtime", async (actual) => ({ ...await actual<object>(), generateStructured: directed }));
const graphics = { mode: "graphics_first", elements: [{ id: "price", kind: "text", text: " €29 " }] };
const production = { media_strategy: "still_motion_graphics", protected_inputs: [{ id: "price", kind: "exact_text", value: " €29 ", allowed_transformations: [] }] };
async function board() {
  return Storyboard.create<Storyboard>({ user_id: "u1", project_id: "default", name: "Ad", document: JSON.stringify({ brief: "Keep source truth.", style: "Clean", genre: "Ad", aspectRatio: "9:16", entityIds: [], screenplay: { motion_design: { direction: "Retain rhythm" } }, directorModel: { provider: "mock", id: "model" }, shots: [{ type: "shot", id: "shot-0", index: 0, action: "Old", status: "rendered", graphics, production, keyframe: { type: "image", asset_id: "original-image" }, clip: { type: "video", asset_id: "original-video" } }] }) });
}
const run = () => createCapabilityRun({ context: { userId: "u1", getProvider: async () => ({}) } as unknown as ProcessingContext, gate: UNGATED });
describe("storyboard preservation", () => {
  beforeEach(() => { initTestDb(); directed.mockReset(); });
  it("clears persisted graphics with null instead of retaining an empty patch", async () => {
    const row = await board();
    await editStoryboard.impl(run(), { storyboard_id: row.id, ops: [{ op: "update_shot", target: "shot-0", graphics: null }] });
    expect((await Storyboard.findById(row.id))!.toDocument().shots[0].graphics).toBeUndefined();
  });
  it("re-direct preserves fields outside Director ownership when shot identity survives", async () => {
    const row = await board();
    directed.mockResolvedValue({ title: "Ad", shots: [{ id: "shot-0", slug: "Hook", action: "New", graphics: { mode: "none" }, production: { media_strategy: "generated_video" } }] });
    const result = await directStoryboard.impl(run(), { storyboard_id: row.id, redirect: true, shot_count: 1, provider: "mock", model: "model" });
    expect(result).not.toHaveProperty("error");
    const document = (await Storyboard.findById(row.id))!.toDocument();
    expect(document.shots[0].action).toBe("New");
    expect(document.shots[0].graphics).toEqual(graphics);
    expect(document.shots[0].production).toEqual(production);
    expect(document.shots[0].keyframe?.asset_id).toBe("original-image");
    expect(document.shots[0].clip?.asset_id).toBe("original-video");
    expect(document.screenplay?.motion_design).toEqual({ direction: "Retain rhythm" });
  });
});
