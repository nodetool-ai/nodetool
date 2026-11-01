import { describe, expect, it } from "vitest";
import { storyboardShot, storyboardDocument } from "../src/api-schemas/storyboards.js";
import { currentRenderInputs, stampRenderInputs, isVersionStale } from "../src/render-record.js";
import type { BoardRenderContext } from "../src/render-record.js";
import type { Shot } from "../src/creative.js";

const shot: Shot = { type: "shot", id: "s", index: 0, action: "A lighthouse", status: "planned" };
const board: BoardRenderContext = { aspect_ratio: "16:9", image_model: "flux", video_model: "kling-v3", style_entity_id: null, style: "", look_preset_ids: ["look.arri-alexa"] };

describe("storyboard look boundary", () => {
  it("preserves shot look ids and rejects four ids", () => {
    expect(storyboardShot.parse({ ...shot, look_preset_ids: ["look.bleach-bypass"] }).look_preset_ids).toEqual(["look.bleach-bypass"]);
    expect(storyboardShot.safeParse({ ...shot, look_preset_ids: ["a", "b", "c", "d"] }).success).toBe(false);
    const doc = { screenplay: null, shots: [shot], brief: "", style: "", aspectRatio: "16:9", directorModel: null, imageModel: null, videoModel: null, look_preset_ids: board.look_preset_ids };
    expect(storyboardDocument.parse(doc).look_preset_ids).toEqual(board.look_preset_ids);
    expect(storyboardDocument.safeParse({ ...doc, look_preset_ids: ["a", "b", "c", "d"] }).success).toBe(false);
  });
  it("makes an inherited look change stale and keeps an overridden shot current", () => {
    for (const kind of ["keyframe", "clip"] as const) {
      const version = { type: kind === "keyframe" ? "image" as const : "video" as const, uri: "asset://render", render_inputs: stampRenderInputs(currentRenderInputs(shot, board, kind)) };
      expect(isVersionStale(version, shot, { ...board, look_preset_ids: ["look.bleach-bypass"] })).toBe(true);
      const override = { ...shot, look_preset_ids: ["look.arri-alexa"] };
      expect(isVersionStale(version, override, { ...board, look_preset_ids: ["look.bleach-bypass"] })).toBe(false);
      expect(isVersionStale(version, { ...shot, look_preset_ids: [] }, board)).toBe(false);
    }
  });
});
