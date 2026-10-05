import { describe, expect, it } from "vitest";
import {
  STORYBOARD_BUNDLE_SCHEMA_VERSION,
  normalizeStoryboardScene,
  normalizeStoryboardScreenplay,
  normalizeStoryboardShot,
  parseStoryboardBundle,
  storyboardDocument,
  storyboardShotGraphics,
  storyboardScreenplay
} from "../src/api-schemas/storyboards.js";

/** The shape an agent sent that the persistence layer silently refused. */
const agentScreenplay = {
  type: "screenplay",
  title: "Lighthouse Dawn",
  brief: "A keeper's last night",
  style: "noir, high contrast",
  shots: [
    {
      slug: "Lighthouse at dusk",
      action: "A lighthouse against a darkening sky",
      camera: { framing: "wide" },
      motion: "slow push in",
      durationSeconds: 4
    },
    {
      slug: "The light dies",
      action: "The beam flickers out as dawn breaks",
      durationSeconds: 6
    }
  ]
};

describe("normalizeStoryboardScreenplay", () => {
  it("produces a screenplay the save schema accepts", () => {
    const play = normalizeStoryboardScreenplay(agentScreenplay);
    expect(() => storyboardScreenplay.parse(play)).not.toThrow();
    expect(play.id).toEqual(expect.any(String));
    play.shots.forEach((shot, index) => {
      expect(shot.type).toBe("shot");
      expect(shot.id).toEqual(expect.any(String));
      expect(shot.index).toBe(index);
      expect(shot.status).toBe("planned");
    });
  });

  it("converts the camelCase tool surface to the wire shape", () => {
    const play = normalizeStoryboardScreenplay(agentScreenplay);
    expect(play.shots[0].duration_seconds).toBe(4);
    expect(play.shots[1].duration_seconds).toBe(6);
    expect(play.style_bible).toBe("noir, high contrast");
    expect(play.brief).toBe("A keeper's last night");
  });

  it("keeps ids, indexes and statuses that were supplied", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      id: "sp_1",
      title: "Kept",
      shots: [
        {
          type: "shot",
          id: "shot_a",
          index: 7,
          action: "A wide desert",
          status: "rendered"
        }
      ]
    });
    expect(play.id).toBe("sp_1");
    expect(play.shots[0].id).toBe("shot_a");
    expect(play.shots[0].index).toBe(7);
    expect(play.shots[0].status).toBe("rendered");
  });

  it("prefers an explicit wire key over its camelCase alias", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Both",
      style_bible: "wire wins",
      style: "alias loses",
      shots: [
        { action: "A shot", duration_seconds: 2, durationSeconds: 9 }
      ]
    });
    expect(play.style_bible).toBe("wire wins");
    expect(play.shots[0].duration_seconds).toBe(2);
  });

  it("uses the caller's id generator", () => {
    let n = 0;
    const play = normalizeStoryboardScreenplay(agentScreenplay, {
      generateId: () => `id_${++n}`
    });
    expect(play.id).toBe("id_1");
    expect(play.shots.map((s) => s.id)).toEqual(["id_2", "id_3"]);
  });

  it("rejects a shot with no action, naming its position and slug", () => {
    expect(() =>
      normalizeStoryboardScreenplay({
        type: "screenplay",
        title: "Broken",
        shots: [{ slug: "Opening", camera: { framing: "wide" } }]
      })
    ).toThrow(/position 0 \("Opening"\)/);
  });

  it("rejects a payload that is not a screenplay", () => {
    expect(() => normalizeStoryboardScreenplay(null)).toThrow(/Screenplay/);
    expect(() =>
      normalizeStoryboardScreenplay({ type: "screenplay" })
    ).toThrow(/shots/);
  });
});

describe("script link fields", () => {
  it("normalizes the camelCase link aliases onto the wire keys", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Linked",
      scriptId: "script_1",
      shots: [
        {
          action: "Maren climbs the stair",
          scriptLineIds: ["l1", "l2"],
          scriptTextSnapshot: "One more night.\nIt will hold.",
          durationSource: "audio"
        }
      ]
    });
    expect(play.script_id).toBe("script_1");
    expect(play.shots[0].script_line_ids).toEqual(["l1", "l2"]);
    expect(play.shots[0].script_text_snapshot).toBe(
      "One more night.\nIt will hold."
    );
    expect(play.shots[0].duration_source).toBe("audio");
  });

  it("prefers the wire key over its alias", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Both",
      script_id: "wire",
      scriptId: "alias",
      shots: [
        {
          action: "A shot",
          duration_source: "manual",
          durationSource: "audio"
        }
      ]
    });
    expect(play.script_id).toBe("wire");
    expect(play.shots[0].duration_source).toBe("manual");
  });

  it("leaves a document without link fields unchanged", () => {
    const play = normalizeStoryboardScreenplay(agentScreenplay);
    expect(play.script_id).toBeUndefined();
    expect(play.shots[0].script_line_ids).toBeUndefined();
    expect(play.shots[0].script_text_snapshot).toBeUndefined();
    expect(play.shots[0].duration_source).toBeUndefined();
    expect(() => storyboardScreenplay.parse(play)).not.toThrow();
  });

  it("refuses a duration_source outside the two known values", () => {
    expect(() =>
      normalizeStoryboardScreenplay({
        type: "screenplay",
        title: "Bad",
        shots: [{ action: "A shot", durationSource: "vibes" }]
      })
    ).toThrow(/duration_source/);
  });
});

describe("motion graphics intent", () => {
  const graphics = {
    mode: "hybrid" as const,
    direction: "Keep the packshot centered while the offer builds around it.",
    elements: [
      {
        id: "headline",
        kind: "text" as const,
        role: "headline" as const,
        text: "NEW DROP",
        direction: "Reveal from behind the product."
      },
      {
        id: "logo",
        kind: "asset" as const,
        role: "logo" as const,
        asset_id: "asset-logo",
        entity_id: "entity-brand",
        direction: "Hold bottom right."
      }
    ]
  };

  const motionDesign = {
    direction: "One continuous yellow line ties the cut together.",
    transitions: [
      {
        from_shot_id: "shot-a",
        to_shot_id: "shot-b",
        direction: "Carry the line through the cut."
      }
    ],
    continuities: [
      {
        id: "yellow-line",
        shot_ids: ["shot-a", "shot-b"],
        direction: "Persist across both shots."
      }
    ]
  };

  it("normalizes and round-trips shot graphics plus board motion design", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Product drop",
      motionDesign,
      shots: [
        {
          id: "shot-a",
          action: "A faithful product packshot on a clean studio background",
          graphics
        },
        {
          id: "shot-b",
          action: "The same product against a color field"
        }
      ]
    });

    expect(play.motion_design).toEqual(motionDesign);
    expect(play.shots[0].graphics).toEqual(graphics);
    expect(storyboardScreenplay.parse(play)).toEqual(play);
  });

  it("preserves graphics intent through the storyboard document schema", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Product drop",
      motion_design: motionDesign,
      shots: [
        {
          id: "shot-a",
          action: "Product hero",
          graphics
        },
        { id: "shot-b", action: "CTA" }
      ]
    });
    const doc = storyboardDocument.parse({
      screenplay: play,
      shots: play.shots,
      brief: "Launch the product",
      style: "minimal studio",
      entityIds: ["entity-brand"],
      aspectRatio: "9:16",
      directorModel: null,
      imageModel: null,
      videoModel: null
    });

    expect(doc.screenplay?.motion_design).toEqual(motionDesign);
    expect(doc.shots[0].graphics?.elements?.[0]).toMatchObject({
      id: "headline",
      kind: "text",
      text: "NEW DROP"
    });
  });

  it("rejects malformed cross-shot and graphics contracts", () => {
    expect(() =>
      normalizeStoryboardScreenplay({
        type: "screenplay",
        title: "Broken motion",
        motionDesign: {
          transitions: [{ from_shot_id: "shot-a" }]
        },
        shots: [{ action: "Product hero" }]
      })
    ).toThrow(/motion_design/);

    expect(() =>
      normalizeStoryboardScreenplay({
        type: "screenplay",
        title: "Broken graphics",
        shots: [
          {
            action: "Product hero",
            graphics: { mode: "cinematic_magic" }
          }
        ]
      })
    ).toThrow(/graphics/);
  });
});

describe("normalizeStoryboardShot", () => {
  it("fills in what the save requires", () => {
    const shot = normalizeStoryboardShot(
      { action: "A wide desert", durationSeconds: 3 },
      2,
      { generateId: () => "shot_x" }
    );
    expect(shot).toMatchObject({
      type: "shot",
      id: "shot_x",
      index: 2,
      status: "planned",
      duration_seconds: 3
    });
  });
});

describe("parseStoryboardBundle", () => {
  const document = {
    screenplay: null,
    shots: [],
    brief: "A keeper's last night",
    style: "noir",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };

  it("fills in what a shipped file may leave out", () => {
    const bundle = parseStoryboardBundle({ name: "Lighthouse", document });
    expect(bundle).toMatchObject({
      schemaVersion: STORYBOARD_BUNDLE_SCHEMA_VERSION,
      name: "Lighthouse",
      description: "",
      tags: []
    });
  });

  it("preserves motion graphics through bundle import", () => {
    const graphicsDocument = {
      ...document,
      screenplay: {
        type: "screenplay",
        id: "sp-graphics",
        title: "Offer",
        shots: [
          {
            type: "shot",
            id: "shot-1",
            index: 0,
            action: "A faithful packshot",
            status: "planned",
            graphics: {
              mode: "overlay",
              elements: [
                {
                  id: "headline",
                  kind: "text",
                  role: "headline",
                  text: "SAVE 20%"
                }
              ]
            }
          }
        ],
        motion_design: {
          direction: "Keep the headline rhythm consistent across the cut."
        }
      },
      shots: [
        {
          type: "shot",
          id: "shot-1",
          index: 0,
          action: "A faithful packshot",
          status: "planned",
          graphics: {
            mode: "overlay",
            elements: [
              {
                id: "headline",
                kind: "text",
                role: "headline",
                text: "SAVE 20%"
              }
            ]
          }
        }
      ]
    };

    const bundle = parseStoryboardBundle({
      name: "Offer",
      document: graphicsDocument
    });

    expect(bundle?.document.screenplay?.motion_design).toEqual({
      direction: "Keep the headline rhythm consistent across the cut."
    });
    expect(bundle?.document.shots[0].graphics?.elements?.[0]).toMatchObject({
      id: "headline",
      kind: "text",
      text: "SAVE 20%"
    });
  });

  it("refuses a file that carries no board", () => {
    expect(parseStoryboardBundle({ name: "Lighthouse" })).toBeNull();
    expect(parseStoryboardBundle({ document })).toBeNull();
    expect(parseStoryboardBundle("not an object")).toBeNull();
  });

  it("refuses a bundle written against a newer schema", () => {
    expect(
      parseStoryboardBundle({
        schemaVersion: STORYBOARD_BUNDLE_SCHEMA_VERSION + 1,
        name: "From the future",
        document
      })
    ).toBeNull();
  });
});

describe("setup stage and genre", () => {
  /** A board written before the guided setup shipped. */
  const legacyDocument = {
    screenplay: null,
    shots: [],
    brief: "A keeper's last night",
    style: "noir",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };

  it("reads a document with neither field as done and no genre", () => {
    const doc = storyboardDocument.parse(legacyDocument);
    expect(doc.setupStage).toBe("done");
    expect(doc.genre).toBe("");
  });

  it("round-trips every stage", () => {
    for (const stage of [
      "idea",
      "genre",
      "review",
      "entities",
      "look",
      "done"
    ] as const) {
      const doc = storyboardDocument.parse({
        ...legacyDocument,
        setupStage: stage,
        genre: "thriller"
      });
      expect(doc.setupStage).toBe(stage);
      expect(doc.genre).toBe("thriller");
    }
  });

  it("refuses a stage it does not know", () => {
    expect(
      storyboardDocument.safeParse({ ...legacyDocument, setupStage: "look-dev" })
        .success
    ).toBe(false);
  });
});

describe("per-shot render models", () => {
  const legacyDocument = {
    screenplay: null,
    shots: [
      {
        type: "shot",
        id: "shot-1",
        index: 0,
        action: "A lighthouse at dawn",
        status: "planned"
      }
    ],
    brief: "A keeper's last night",
    style: "noir",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };

  it("preserves model refs and still accepts legacy shots without them", () => {
    const withModels = storyboardDocument.parse({
      ...legacyDocument,
      shots: [
        {
          ...legacyDocument.shots[0],
          still_model: {
            id: "atlas/still",
            provider: "atlascloud",
            name: "Atlas Still"
          },
          clip_model: {
            id: "atlas/clip",
            provider: "atlascloud",
            name: "Atlas Clip"
          }
        }
      ]
    });

    expect(withModels.shots[0]).toMatchObject({
      still_model: { id: "atlas/still", provider: "atlascloud" },
      clip_model: { id: "atlas/clip", provider: "atlascloud" }
    });
    expect(storyboardDocument.parse(legacyDocument).shots[0].still_model).toBe(
      undefined
    );
  });
});

describe("scenes", () => {
  /** A screenplay saved before scenes existed. */
  const legacyScreenplay = {
    type: "screenplay",
    id: "sp_old",
    title: "Lighthouse Dawn",
    shots: [
      {
        type: "shot",
        id: "shot_a",
        index: 0,
        action: "A lighthouse against a darkening sky",
        status: "planned"
      }
    ]
  };

  it("parses a pre-scene screenplay unchanged", () => {
    const parsed = storyboardScreenplay.parse(legacyScreenplay);
    expect(parsed).toEqual(legacyScreenplay);
    expect(parsed.genre).toBeUndefined();
    expect(parsed.scenes).toBeUndefined();
    expect(parsed.shots[0].scene_id).toBeUndefined();
  });

  it("normalizes a camelCase agent payload into scenes and scene_id", () => {
    let n = 0;
    const play = normalizeStoryboardScreenplay(
      {
        type: "screenplay",
        title: "Scened",
        genre: "thriller",
        scenes: [
          { slugline: "INT. FLAT - HALLWAY - DAWN", lighting: "cold key" },
          { slugline: "EXT. PIER - NIGHT" }
        ],
        shots: [
          { action: "She opens the door", sceneId: "sc_1" },
          { action: "The pier lights cut out", sceneId: "sc_2" }
        ]
      },
      { generateId: () => `id_${++n}` }
    );
    expect(play.genre).toBe("thriller");
    expect(play.shots.map((shot) => shot.scene_id)).toEqual(["sc_1", "sc_2"]);
    expect(play.scenes).toEqual([
      {
        type: "scene",
        id: "id_4",
        slugline: "INT. FLAT - HALLWAY - DAWN",
        lighting: "cold key"
      },
      { type: "scene", id: "id_5", slugline: "EXT. PIER - NIGHT" }
    ]);
  });

  it("prefers an explicit scene_id over the sceneId alias", () => {
    const play = normalizeStoryboardScreenplay({
      type: "screenplay",
      title: "Both",
      shots: [{ action: "A shot", scene_id: "wire", sceneId: "alias" }]
    });
    expect(play.shots[0].scene_id).toBe("wire");
  });

  it("names a scene with no slugline by its position", () => {
    const scene = normalizeStoryboardScene({ lighting: "practicals" }, 2, {
      generateId: () => "sc_x"
    });
    expect(scene).toEqual({
      type: "scene",
      id: "sc_x",
      slugline: "Scene 3",
      lighting: "practicals"
    });
  });
});

describe("authored frames on graphics", () => {
  const element = { id: "glyph", kind: "asset", asset_id: "a" };
  it("accepts frame, typography, lock, limits and review rules, and an element without them", () => {
    const parsed = storyboardShotGraphics.parse({
      review_rules: ["The anchor never moves."],
      elements: [
        { ...element, frame: { box: [-0.06, 0.3, 0.66, 0.46], fit: "cover", align: { x: "start" }, clip: true }, lock: ["position", "scale", "crop"], limits: { x: 0.05, scale: 0.15 } },
        { id: "copy", kind: "text", text: "Hi", typography: { size: 0.075, weight: 700, align: "center", maxLines: 2 } },
        { ...element, id: "plain" }
      ]
    });
    expect(parsed.elements?.[0].frame?.box).toEqual([-0.06, 0.3, 0.66, 0.46]);
    expect(parsed.elements?.[2]).toEqual({ ...element, id: "plain" });
    expect(parsed.review_rules).toEqual(["The anchor never moves."]);
  });
  it.each([
    ["a box with three numbers", { frame: { box: [0, 0, 1] } }],
    ["an unknown fit", { frame: { box: [0, 0, 1, 1], fit: "stretch" } }],
    ["an unknown lock", { lock: ["rotation"] }],
    ["a negative limit", { limits: { x: -1 } }],
    ["a weight outside the set", { typography: { weight: 800 } }]
  ])("rejects %s", (_name, extra) => {
    expect(storyboardShotGraphics.safeParse({ elements: [{ ...element, ...extra }] }).success).toBe(false);
  });
});
