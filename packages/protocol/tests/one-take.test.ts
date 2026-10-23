import { describe, expect, it } from "vitest";
import {
  ONE_TAKE_DEFAULT_SHOT_SECONDS,
  ONE_TAKE_ENTITY_REFS_NOTE,
  compileOneTake,
  compileSceneClip,
  sceneClipRun,
  oneTakeSteps,
  oneTakeWindow
} from "../src/one-take.js";
import type { Entity, Shot } from "../src/creative.js";
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

  it("reports the stills source when the direction sets none", () => {
    expect(compileOneTake({ shots: SHOTS }).reference_source).toBe("stills");
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

const entity = (
  id: string,
  kind: Entity["kind"],
  name: string,
  assetId?: string
): Entity => ({
  type: "entity",
  id,
  kind,
  name,
  descriptor: "",
  reference_images: assetId ? [still(assetId)] : []
});

describe("compileOneTake with entity references", () => {
  const CAST: Entity[] = [
    entity("runner", "character", "Runner", "img-runner"),
    entity("street", "location", "Wet street", "img-street"),
    entity("sneaker", "prop", "Sneaker", "img-sneaker"),
    entity("bystander", "character", "Bystander", "img-bystander"),
    entity("ghost", "character", "Ghost")
  ];
  const BOARD: Shot[] = [
    shot("puddle", 0, {
      duration_seconds: 3,
      action: "A still puddle on the wet street.",
      entity_ids: ["street"],
      keyframe: still("still-puddle")
    }),
    shot("stride", 1, {
      duration_seconds: 3,
      action: "The runner jogs past.",
      entity_ids: ["runner", "sneaker", "street", "ghost"],
      keyframe: still("still-stride")
    })
  ];

  it("sends each used entity's image once, shot by shot", () => {
    const out = compileOneTake({
      shots: BOARD,
      entities: CAST,
      oneTake: { prompt: "", reference_source: "entities" }
    });
    expect(out.reference_source).toBe("entities");
    expect(out.references).toEqual([
      { entity_id: "street", asset_id: "img-street", label: "the location Wet street" },
      { entity_id: "runner", asset_id: "img-runner", label: "the character Runner" },
      { entity_id: "sneaker", asset_id: "img-sneaker", label: "the prop Sneaker" }
    ]);
  });

  it("says the images fix identity only, and sends no shot still", () => {
    const out = compileOneTake({
      shots: BOARD,
      entities: CAST,
      oneTake: { prompt: "", reference_source: "entities" }
    });
    expect(out.compiled.split("\n\n")[0]).toBe(
      `REFS: [Image 1] is the location Wet street. [Image 2] is the character Runner. [Image 3] is the prop Sneaker. ${ONE_TAKE_ENTITY_REFS_NOTE}`
    );
    expect(out.compiled).not.toContain("still of");
  });

  it("compiles no REFS block when no used entity has an image", () => {
    const out = compileOneTake({
      shots: [shot("a", 0, { entity_ids: ["ghost"], keyframe: still("still-a") })],
      entities: CAST,
      oneTake: { prompt: "", reference_source: "entities" }
    });
    expect(out.references).toEqual([]);
    expect(out.compiled.startsWith("STEP_01")).toBe(true);
  });

  it("keeps sending stills when the board holds entities but the source is stills", () => {
    const out = compileOneTake({ shots: BOARD, entities: CAST });
    expect(out.references.map((r) => r.asset_id)).toEqual([
      "still-puddle",
      "still-stride"
    ]);
  });

  it("compiles a scene clip's entity references from its own shots", () => {
    const out = compileSceneClip(
      [...BOARD, shot("splash", 2, { entity_ids: ["bystander"] })],
      { id: "clip", prompt: "", shot_ids: ["stride", "splash"], reference_source: "entities" },
      CAST
    );
    expect(out.references.map((r) => r.entity_id)).toEqual([
      "runner",
      "street",
      "sneaker",
      "bystander"
    ]);
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

  it("keeps the reference source through a parse and rejects an unknown one", () => {
    const parsed = storyboardDocument.parse({
      ...baseDocument,
      one_take: { prompt: "", reference_source: "entities" }
    });
    expect(parsed.one_take?.reference_source).toBe("entities");
    expect(
      storyboardDocument.safeParse({
        ...baseDocument,
        one_take: { prompt: "", reference_source: "keyframes" }
      }).success
    ).toBe(false);
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

describe("sceneClipRun", () => {
  const run = [
    shot("a", 0, { scene_id: "s1" }),
    shot("b", 1, { scene_id: "s1" }),
    shot("c", 2, { scene_id: "s1" }),
    shot("d", 3, { scene_id: "s2" })
  ];

  it("resolves consecutive shots of one scene in board order", () => {
    const resolved = sceneClipRun(run, ["c", "b"]);
    expect(resolved.issue).toBeNull();
    expect(resolved.shots.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it.each([
    [["a"], "A scene clip covers 2 to 5 shots."],
    [["a", "c"], "The shots in this scene clip are no longer next to each other."],
    [["c", "d"], "The shots in this scene clip are no longer in one scene."],
    [["a", "gone"], "A shot in this scene clip was deleted."]
  ])("reports why %j is not a run", (ids, issue) => {
    expect(sceneClipRun(run, ids).issue).toBe(issue);
  });

  it("compiles windows and image numbers from the run's first shot", () => {
    const compiled = compileSceneClip(
      [
        shot("a", 0, { duration_seconds: 4 }),
        shot("b", 1, { duration_seconds: 2, keyframe: still("still-b") }),
        shot("c", 2, { duration_seconds: 3, keyframe: still("still-c") })
      ],
      { id: "clip", prompt: "", shot_ids: ["b", "c"] }
    );
    expect(compiled.steps).toEqual([
      { shot_id: "b", start_seconds: 0, end_seconds: 2 },
      { shot_id: "c", start_seconds: 2, end_seconds: 5 }
    ]);
    expect(compiled.references.map((r) => r.asset_id)).toEqual([
      "still-b",
      "still-c"
    ]);
  });

  it("stores scene clips on the document and rejects a run over five shots", () => {
    const base = {
      screenplay: null,
      shots: [],
      brief: "",
      style: "",
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: null,
      videoModel: null
    };
    const parsed = storyboardDocument.parse({
      ...base,
      scene_clips: [{ id: "clip", prompt: "Go.", shot_ids: ["a", "b"] }]
    });
    expect(parsed.scene_clips?.[0].shot_ids).toEqual(["a", "b"]);
    expect(
      storyboardDocument.safeParse({
        ...base,
        scene_clips: [
          { id: "clip", prompt: "", shot_ids: ["a", "b", "c", "d", "e", "f"] }
        ]
      }).success
    ).toBe(false);
  });
});
