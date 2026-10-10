import { describe, expect, it } from "vitest";
import {
  ONE_TAKE_DEFAULT_SHOT_SECONDS,
  compileOneTake,
  oneTakeSteps,
  oneTakeWindow
} from "../src/one-take.js";
import type { Shot } from "../src/creative.js";
import {
  storyboardDocument,
  storyboardShot
} from "../src/api-schemas/storyboards.js";

const shot = (
  id: string,
  index: number,
  fields: Partial<Shot> = {}
): Shot => ({
  type: "shot",
  id,
  index,
  action: "",
  status: "planned",
  ...fields
});

const still = (assetId: string) => ({
  type: "image" as const,
  uri: `asset://${assetId}`,
  asset_id: assetId
});

/** Three shots of a 30-second take; the forest shot has no still. */
const SHOTS: Shot[] = [
  shot("cafe", 0, {
    slug: "Café",
    duration_seconds: 5,
    action: "Extreme close-up: the cup reaches her lips",
    motion: "The camera pushes over the rim into the glowing steam",
    end_state: "the camera inside the drifting steam",
    sound: "city murmur, a deep breath",
    keyframe: still("still-cafe")
  }),
  shot("forest", 1, {
    duration_seconds: 9,
    action: "Below, the steam opens onto a dense cloud forest at dawn.",
    motion: "The camera skims fast and low over the canopy",
    sound: "wind, wing beats, dripping leaves"
  }),
  shot("table", 2, {
    slug: "Packshot",
    duration_seconds: 16,
    action: "She sets the cup down beside the AURELI pouch",
    end_state: "exactly the last frame",
    keyframe: still("still-table")
  })
];

describe("compileOneTake", () => {
  it("compiles the board into REFS, STEPS and AUDIO after the creator's prompt", () => {
    const out = compileOneTake({
      shots: SHOTS,
      oneTake: { prompt: "BRAND: AURELI, slow-roasted coffee." }
    });

    const compiled = [
      "REFS: [Image 1] is the still of Café at 0-5s. [Image 2] is the still of Packshot at 14-30s.",
      [
        "STEP_01: 0-5s. Extreme close-up: the cup reaches her lips. The camera pushes over the rim into the glowing steam. End: the camera inside the drifting steam.",
        "STEP_02: 5-14s. Below, the steam opens onto a dense cloud forest at dawn. The camera skims fast and low over the canopy.",
        "STEP_03: 14-30s. She sets the cup down beside the AURELI pouch. End: exactly the last frame."
      ].join("\n"),
      "AUDIO: <city murmur, a deep breath> at 0-5s · <wind, wing beats, dripping leaves> at 5-14s"
    ].join("\n\n");
    expect(out.compiled).toBe(compiled);
    expect(out.prompt).toBe(`BRAND: AURELI, slow-roasted coffee.\n\n${compiled}`);
    expect(out.duration_seconds).toBe(30);
  });

  it("references only the shot stills, in shot order", () => {
    const out = compileOneTake({ shots: SHOTS });
    expect(out.references).toEqual([
      {
        shot_id: "cafe",
        asset_id: "still-cafe",
        label: "the still of Café at 0-5s"
      },
      {
        shot_id: "table",
        asset_id: "still-table",
        label: "the still of Packshot at 14-30s"
      }
    ]);
  });

  it("is only the compiled block when the creator wrote nothing", () => {
    const out = compileOneTake({ shots: SHOTS, oneTake: { prompt: "  " } });
    expect(out.prompt).toBe(out.compiled);
  });

  it("orders steps by shot index, not array position", () => {
    const steps = oneTakeSteps([SHOTS[2], SHOTS[0], SHOTS[1]]);
    expect(steps.map((step) => step.shot_id)).toEqual([
      "cafe",
      "forest",
      "table"
    ]);
  });

  it("names a still by shot number when the shot has no title", () => {
    const out = compileOneTake({
      shots: [shot("a", 0, { keyframe: still("s-a") })]
    });
    expect(out.references[0]?.label).toBe(
      `the still of shot 1 at 0-${ONE_TAKE_DEFAULT_SHOT_SECONDS}s`
    );
  });

  it("counts a shot without a duration as the default length", () => {
    const steps = oneTakeSteps([shot("a", 0), shot("b", 1, { duration_seconds: 0 })]);
    expect(steps.at(-1)?.end_seconds).toBe(2 * ONE_TAKE_DEFAULT_SHOT_SECONDS);
  });

  it("compiles nothing for an empty board", () => {
    const out = compileOneTake({ shots: [], oneTake: { prompt: "only mine" } });
    expect(out.compiled).toBe("");
    expect(out.prompt).toBe("only mine");
    expect(out.duration_seconds).toBe(0);
  });

  it("scales every window to a chosen duration", () => {
    const out = compileOneTake({
      shots: SHOTS,
      oneTake: { prompt: "", duration_seconds: 15 }
    });
    expect(out.shot_total_seconds).toBe(30);
    expect(out.duration_seconds).toBe(15);
    expect(out.steps.map((step) => [step.start_seconds, step.end_seconds])).toEqual([
      [0, 2.5],
      [2.5, 7],
      [7, 15]
    ]);
    expect(out.compiled).toContain("STEP_02: 2.5-7s.");
    expect(out.references[1]?.label).toBe("the still of Packshot at 7-15s");
  });

  it("keeps the shot windows without a chosen duration", () => {
    const out = compileOneTake({
      shots: SHOTS,
      oneTake: { prompt: "", duration_seconds: null }
    });
    expect(out.duration_seconds).toBe(30);
    expect(out.steps[1]).toEqual({ shot_id: "forest", start_seconds: 5, end_seconds: 14 });
  });

  it("prints windows without trailing decimals", () => {
    expect(oneTakeWindow(0, 5)).toBe("0-5s");
    expect(oneTakeWindow(2.5, 6.25)).toBe("2.5-6.3s");
  });
});

describe("one-take schemas", () => {
  const baseDocument = {
    screenplay: null,
    shots: [],
    brief: "",
    style: "",
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };

  it("keeps a document's one_take prompt through a parse", () => {
    const parsed = storyboardDocument.parse({
      ...baseDocument,
      one_take: { prompt: "BRAND: AURELI." }
    });
    expect(parsed.one_take).toEqual({ prompt: "BRAND: AURELI." });
  });

  it("keeps the render settings through a parse", () => {
    const direction = {
      prompt: "x",
      duration_seconds: 15,
      aspect_ratio: "9:16",
      resolution: "720p",
      model: { id: "dreamina_seedance_45_pro", provider: "dreamina", name: "Seedance 2.5" }
    };
    const parsed = storyboardDocument.parse({ ...baseDocument, one_take: direction });
    expect(parsed.one_take).toEqual(direction);
  });

  it("rejects a non-positive duration", () => {
    expect(
      storyboardDocument.safeParse({
        ...baseDocument,
        one_take: { prompt: "", duration_seconds: 0 }
      }).success
    ).toBe(false);
  });

  it("still accepts a document without one_take", () => {
    const parsed = storyboardDocument.parse(baseDocument);
    expect(parsed.one_take).toBeUndefined();
  });

  it("reads a direction saved in the earlier sections shape as an empty prompt", () => {
    const parsed = storyboardDocument.parse({
      ...baseDocument,
      one_take: { sections: [], references: [] }
    });
    expect(parsed.one_take).toEqual({ prompt: "" });
  });

  it("types a shot's end_state and sound", () => {
    const parsed = storyboardShot.parse({
      type: "shot",
      id: "s",
      index: 0,
      action: "x",
      status: "planned",
      end_state: "the door closes",
      sound: "a click"
    });
    expect(parsed.end_state).toBe("the door closes");
    expect(parsed.sound).toBe("a click");
    expect(
      storyboardShot.safeParse({ ...parsed, sound: 3 }).success
    ).toBe(false);
  });
});
