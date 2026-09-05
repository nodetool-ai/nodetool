import { describe, expect, it } from "vitest";
import { isScene, isScreenplay, renderInputsMatch } from "../src/creative.js";
import type {
  ClipVersion,
  KeyframeVersion,
  RenderInputs,
  Scene,
  Screenplay,
  Shot
} from "../src/creative.js";

const scene: Scene = {
  type: "scene",
  id: "sc_1",
  slugline: "INT. SOPHIA'S FLAT — HALLWAY — EARLY MORNING",
  lighting: "cold window light, one practical"
};

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "sh_1",
  index: 0,
  action: "Sophia pulls the door shut behind her",
  status: "planned",
  ...overrides
});

const inputs = (overrides: Partial<RenderInputs> = {}): RenderInputs => ({
  kind: "keyframe",
  prompt_hash: "a".repeat(64),
  model: "fal-ai/flux/dev",
  aspect_ratio: "16:9",
  style_entity_id: "ent_style_1",
  recorded_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("Screenplay defaults", () => {
  it("accepts a document written before genre and scenes existed", () => {
    const legacy: Screenplay = {
      type: "screenplay",
      id: "sp_1",
      title: "Lighthouse Dawn",
      shots: [shot()]
    };
    expect(legacy.genre).toBeUndefined();
    expect(legacy.scenes).toBeUndefined();
    expect(isScreenplay(legacy)).toBe(true);
  });

  it("carries genre, scenes, and per-shot scene ids when present", () => {
    const board: Screenplay = {
      type: "screenplay",
      id: "sp_2",
      title: "Lighthouse Dawn",
      genre: "thriller",
      scenes: [scene],
      shots: [
        shot({
          scene_id: scene.id,
          camera: { framing: "wide", equipment: "steadicam" }
        })
      ]
    };
    expect(board.shots[0].scene_id).toBe("sc_1");
    expect(board.shots[0].camera?.equipment).toBe("steadicam");
  });
});

describe("isScene", () => {
  it("accepts a scene and rejects anything else", () => {
    expect(isScene(scene)).toBe(true);
    expect(isScene(shot())).toBe(false);
    expect(isScene(null)).toBe(false);
    expect(isScene("INT. HALLWAY")).toBe(false);
  });
});

describe("renderInputsMatch", () => {
  it("matches identical records", () => {
    expect(renderInputsMatch(inputs(), inputs())).toBe(true);
  });

  it("ignores recorded_at, which is a timestamp and not an input", () => {
    expect(
      renderInputsMatch(
        inputs(),
        inputs({ recorded_at: "2026-06-06T12:00:00.000Z" })
      )
    ).toBe(true);
  });

  const differences: Array<[string, Partial<RenderInputs>]> = [
    ["kind", { kind: "clip" }],
    ["prompt_hash", { prompt_hash: "b".repeat(64) }],
    ["model", { model: "fal-ai/flux/schnell" }],
    ["aspect_ratio", { aspect_ratio: "9:16" }],
    ["style_entity_id", { style_entity_id: null }],
    ["source_version_id", { source_version_id: "ver_2" }]
  ];

  it.each(differences)("does not match on a different %s", (_field, patch) => {
    expect(renderInputsMatch(inputs(), inputs(patch))).toBe(false);
  });
});

describe("render_inputs on a version ref", () => {
  it("rides on the ref, so a shot's versions carry what produced them", () => {
    const keyframe: KeyframeVersion = {
      type: "image",
      asset_id: "as_1",
      render_inputs: inputs()
    };
    const clip: ClipVersion = {
      type: "video",
      asset_id: "as_2",
      render_inputs: inputs({ kind: "clip", source_version_id: "as_1" })
    };
    const rendered = shot({
      keyframe,
      keyframe_versions: [keyframe],
      clip,
      clip_versions: [clip],
      status: "rendered"
    });

    expect(rendered.keyframe_versions?.[0].render_inputs).toEqual(inputs());
    expect(rendered.clip?.render_inputs?.source_version_id).toBe("as_1");
  });

  it("is absent on a version that predates the record", () => {
    const legacy: KeyframeVersion = { type: "image", asset_id: "as_0" };
    expect(legacy.render_inputs).toBeUndefined();
  });
});
