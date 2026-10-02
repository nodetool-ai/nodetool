import { describe, expect, it } from "vitest";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import { validateStoryboardSemantics } from "../src/storyboardValidation.js";

describe("finish-time storyboard semantics", () => {
  it("ignores disabled optional graphics but rejects disabled protected graphics", () => {
    const shot: Shot = { type: "shot", id: "s", index: 0, action: "", status: "planned", graphics: { mode: "none", elements: [{ id: "copy", kind: "text", asset_id: "unavailable", text: "Sale" }] } };
    const context = { assetIds: new Set<string>(), entityIds: new Set<string>() };
    expect(validateStoryboardSemantics([shot], null, context)).toEqual([]);
    shot.production = { protected_inputs: [{ id: "copy", kind: "exact_text", value: "Sale" }] };
    expect(validateStoryboardSemantics([shot], null, context)).toContain("s: graphics mode none disables required protected content.");
  });
  it("reports missing protected, asset and entity references without mutating drafts", () => {
    const shots: Shot[] = [{ type: "shot", id: "s", index: 0, action: "", status: "planned", graphics: { elements: [
      { id: "product", kind: "asset", asset_id: "foreign", entity_id: "missing", protected_input_id: "unknown" },
      { id: "product", kind: "text", text: "exact" }
    ] } }];
    const before = structuredClone(shots);
    const errors = validateStoryboardSemantics(shots, null, { assetIds: new Set(), entityIds: new Set() });
    expect(errors).toHaveLength(4);
    expect(shots).toEqual(before);
  });
  it("validates references against the current board, not stale screenplay shots", () => {
    const play = { motion_design: { continuities: [{ id: "line", shot_ids: ["removed"], direction: "carry" }] } } as Screenplay;
    expect(validateStoryboardSemantics([], play, { assetIds: new Set(), entityIds: new Set() })).toEqual([
      "Continuity line: expected a non-empty id and existing shot references."
    ]);
  });
});
