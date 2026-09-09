/**
 * The save contract behind the Edit Shot dialog: what a draft turns into, and
 * what a cleared field does to the stored shot (PRD § 7.7.2, D9).
 */
import type { Shot } from "@nodetool-ai/protocol";

import {
  draftFromShot,
  hasShotFieldChanges,
  isDraftDirty,
  parseDuration,
  savedShot,
  shotPatchFromDraft,
  withDuration,
  withDurationSourceToggled
} from "../shotDraft";

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

describe("draftFromShot", () => {
  it("reads every § 7.7.2 field, and the scene's lighting", () => {
    const draft = draftFromShot(
      shot({
        dialogue: "We are closed.",
        notes: "Do not paint the sky",
        duration_seconds: 6,
        duration_source: "manual",
        camera: {
          framing: "close-up",
          angle: "low angle",
          movement: "dolly in",
          equipment: "dolly",
          lens: "85mm"
        }
      }),
      { type: "scene", id: "sc1", slugline: "INT. HALL", lighting: "hard key" }
    );

    expect(draft).toEqual({
      renderMode: "keyframe",
      slug: "Opening",
      sceneId: null,
      lighting: "hard key",
      action: "A lighthouse at dusk",
      dialogue: "We are closed.",
      durationSeconds: "6",
      durationSource: "manual",
      framing: "close-up",
      angle: "low angle",
      movement: "dolly in",
      equipment: "dolly",
      lens: "85mm",
      notes: "Do not paint the sky"
    });
  });

  it("reads an empty string for every field a shot has not got", () => {
    const draft = draftFromShot(shot(), null);
    expect(draft.dialogue).toBe("");
    expect(draft.notes).toBe("");
    expect(draft.durationSeconds).toBe("");
    expect(draft.equipment).toBe("");
  });
});

describe("isDraftDirty", () => {
  const original = draftFromShot(shot(), null);

  it("is clean against itself", () => {
    expect(isDraftDirty({ ...original }, original)).toBe(false);
  });

  it("notices a change in any one field", () => {
    expect(isDraftDirty({ ...original, notes: "x" }, original)).toBe(true);
    expect(isDraftDirty({ ...original, sceneId: "sc2" }, original)).toBe(true);
  });
});

describe("hasShotFieldChanges", () => {
  const original = draftFromShot(shot({ camera: { framing: "wide" } }), null);

  it("is false for a draft nobody touched, camera object and all", () => {
    expect(hasShotFieldChanges({ ...original }, original)).toBe(false);
  });

  it("ignores the header row, which saves through its own operations", () => {
    expect(
      hasShotFieldChanges({ ...original, sceneId: "sc2" }, original)
    ).toBe(false);
    expect(
      hasShotFieldChanges({ ...original, lighting: "hard key" }, original)
    ).toBe(false);
  });

  it("is true for any § 7.7.2 field", () => {
    expect(hasShotFieldChanges({ ...original, notes: "x" }, original)).toBe(
      true
    );
  });
});

describe("parseDuration", () => {
  it("takes a positive number and refuses anything else", () => {
    expect(parseDuration("6")).toBe(6);
    expect(parseDuration(" 6 ")).toBe(6);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("-2")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
  });
});

describe("withDuration on a linked board (PRD D9)", () => {
  const original = draftFromShot(shot(), null);

  it("pins the shot when a length is typed", () => {
    expect(withDuration(original, "6", true)).toMatchObject({
      durationSeconds: "6",
      durationSource: "manual"
    });
  });

  it("hands timing back to the takes when the length is cleared", () => {
    const pinned = withDuration(original, "6", true);
    expect(withDuration(pinned, "", true)).toMatchObject({
      durationSeconds: "",
      durationSource: "audio"
    });
  });

  it("leaves the source alone on an unlinked board", () => {
    expect(withDuration(original, "6", false).durationSource).toBeUndefined();
  });
});

describe("withDurationSourceToggled", () => {
  const original = draftFromShot(
    shot({ duration_seconds: 6, duration_source: "manual" }),
    null
  );

  it("unpins without losing the typed value, so it can be pinned again", () => {
    const unpinned = withDurationSourceToggled(original);
    expect(unpinned.durationSource).toBe("audio");
    expect(unpinned.durationSeconds).toBe("6");
    expect(withDurationSourceToggled(unpinned).durationSource).toBe("manual");
  });
});

describe("shotPatchFromDraft", () => {
  it("persists reference mode as a shot change", () => {
    const original = draftFromShot(shot(), null);
    const draft = { ...original, renderMode: "reference" as const };
    expect(hasShotFieldChanges(draft, original)).toBe(true);
    expect(shotPatchFromDraft(draft).render_mode).toBe("reference");
    expect(draftFromShot(shot({ render_mode: "reference" }), null).renderMode).toBe("reference");
  });

  it("maps every column onto its field", () => {
    const draft = {
      ...draftFromShot(shot(), null),
      action: "A lighthouse at dawn",
      dialogue: "We are open.",
      notes: "Keep the gulls",
      durationSeconds: "7",
      durationSource: "manual" as const,
      framing: "wide",
      angle: "eye level",
      movement: "pan left",
      equipment: "steadicam",
      lens: "35mm"
    };

    expect(shotPatchFromDraft(draft)).toEqual({
      render_mode: "keyframe",
      slug: "Opening",
      action: "A lighthouse at dawn",
      dialogue: "We are open.",
      notes: "Keep the gulls",
      duration_seconds: 7,
      duration_source: "manual",
      camera: {
        framing: "wide",
        angle: "eye level",
        movement: "pan left",
        equipment: "steadicam",
        lens: "35mm"
      }
    });
  });

  it("drops a cleared camera part rather than storing an empty string", () => {
    const draft = { ...draftFromShot(shot(), null), framing: "wide" };
    expect(shotPatchFromDraft(draft).camera).toEqual({
      framing: "wide",
      angle: undefined,
      movement: undefined,
      equipment: undefined,
      lens: undefined
    });
  });

  it("drops the camera entirely once nothing is left in it", () => {
    const draft = draftFromShot(
      shot({ camera: { framing: "wide" } }),
      null
    );
    expect(
      shotPatchFromDraft({ ...draft, framing: "" }).camera
    ).toBeUndefined();
  });

  it("refuses a length that is not a positive number", () => {
    const draft = { ...draftFromShot(shot(), null), durationSeconds: "-2" };
    expect(shotPatchFromDraft(draft).duration_seconds).toBeUndefined();
  });
});

describe("savedShot", () => {
  it("is what Regenerate renders — the saved values, not the props' copy", () => {
    const patch = shotPatchFromDraft({
      ...draftFromShot(shot(), null),
      action: "A lighthouse at dawn"
    });
    expect(savedShot(shot(), patch).action).toBe("A lighthouse at dawn");
  });
});
