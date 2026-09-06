import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildDirectorPrompt,
  buildScreenplaySchema,
  fallbackScreenplay,
  parseScreenplay
} from "../src/screenplay-authoring.js";

const compile = (shotCount: number): ValidateFunction => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(buildScreenplaySchema(shotCount));
};

const shot = (sceneId: string, action: string): Record<string, unknown> => ({
  scene_id: sceneId,
  action
});

const payload = (
  scenes: Array<Record<string, unknown>>,
  shots: Array<Record<string, unknown>>
): Record<string, unknown> => ({ title: "Lighthouse Dawn", scenes, shots });

describe("buildScreenplaySchema", () => {
  it("requires scenes, and a scene_id on every shot", () => {
    const validate = compile(2);
    expect(
      validate(
        payload(
          [{ id: "s1", slugline: "EXT. PIER — DAWN", lighting: "cold" }],
          [shot("s1", "the keeper walks out"), shot("s1", "the lamp turns")]
        )
      )
    ).toBe(true);

    expect(validate(payload([], [shot("s1", "a"), shot("s1", "b")]))).toBe(
      false
    );
    expect(
      validate(
        payload(
          [{ id: "s1", slugline: "EXT. PIER — DAWN" }],
          [{ action: "no scene named" }, shot("s1", "b")]
        )
      )
    ).toBe(false);
    expect(
      validate(
        payload(
          [{ slugline: "EXT. PIER — DAWN" }],
          [shot("s1", "a"), shot("s1", "b")]
        )
      )
    ).toBe(false);
  });

  it("accepts camera equipment and rejects an undeclared key", () => {
    const validate = compile(1);
    const scenes = [{ id: "s1", slugline: "INT. LAMP ROOM — NIGHT" }];
    expect(
      validate(
        payload(scenes, [
          {
            ...shot("s1", "hands on the brass"),
            camera: { equipment: "dolly" }
          }
        ])
      )
    ).toBe(true);
    expect(
      validate(
        payload(scenes, [
          { ...shot("s1", "hands on the brass"), camera: { rig: "dolly" } }
        ])
      )
    ).toBe(false);
  });

  it("pins the shot count and leaves the scene count open", () => {
    const validate = compile(2);
    const scenes = [
      { id: "s1", slugline: "EXT. PIER — DAWN" },
      { id: "s2", slugline: "INT. LAMP ROOM — NIGHT" },
      { id: "s3", slugline: "EXT. CLIFF — DUSK" }
    ];
    expect(validate(payload(scenes, [shot("s1", "a"), shot("s3", "b")]))).toBe(
      true
    );
    expect(validate(payload(scenes, [shot("s1", "a")]))).toBe(false);
  });

  it("cannot express the shot→scene cross-reference, so parseScreenplay does", () => {
    // Kept as a test because it is the reason the check lives downstream: a
    // dangling scene_id is well-formed JSON Schema and only parseScreenplay
    // repairs it.
    const validate = compile(1);
    const raw = payload(
      [{ id: "s1", slugline: "EXT. PIER — DAWN" }],
      [shot("nope", "the keeper walks out")]
    );
    expect(validate(raw)).toBe(true);
    expect(parseScreenplay(raw, { shotCount: 1 }).shots[0].scene_id).toBe(
      "scene-0"
    );
  });
});

describe("buildDirectorPrompt", () => {
  it("names the genre", () => {
    const prompt = buildDirectorPrompt(
      "A keeper",
      "cold blues",
      3,
      "16:9",
      "Drama"
    );
    expect(prompt).toContain("Genre:\nDrama");
  });

  it("omits the genre paragraph when there is none", () => {
    expect(buildDirectorPrompt("A keeper", "", 3, "16:9")).not.toContain(
      "Genre:"
    );
    expect(buildDirectorPrompt("A keeper", "", 3, "16:9", "   ")).not.toContain(
      "Genre:"
    );
  });

  it("asks for scenes and per-shot scene ids", () => {
    const prompt = buildDirectorPrompt("A keeper", "", 3, "16:9");
    expect(prompt).toContain("scene_id");
    expect(prompt).toContain("slugline");
  });
});

describe("DIRECTOR_SYSTEM_PROMPT", () => {
  it("states the slugline form and the one-scene-per-shot rule", () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("INT./EXT. LOCATION");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("scene_id");
    expect(DIRECTOR_SYSTEM_PROMPT).toContain("consecutive");
  });
});

describe("parseScreenplay scenes", () => {
  it("assigns scene-N ids in order and remaps every shot onto them", () => {
    const screenplay = parseScreenplay(
      payload(
        [
          { id: "A", slugline: "EXT. PIER — DAWN", lighting: "cold flat sky" },
          { id: "B", slugline: "INT. LAMP ROOM — NIGHT" }
        ],
        [shot("A", "the keeper walks out"), shot("B", "the lamp turns")]
      ),
      { shotCount: 2 }
    );
    expect(screenplay.scenes).toEqual([
      {
        type: "scene",
        id: "scene-0",
        slugline: "EXT. PIER — DAWN",
        lighting: "cold flat sky"
      },
      { type: "scene", id: "scene-1", slugline: "INT. LAMP ROOM — NIGHT" }
    ]);
    expect(screenplay.shots.map((s) => s.scene_id)).toEqual([
      "scene-0",
      "scene-1"
    ]);
  });

  it("gives a shot naming an unreturned scene the previous shot's scene", () => {
    const screenplay = parseScreenplay(
      payload(
        [
          { id: "A", slugline: "EXT. PIER — DAWN" },
          { id: "B", slugline: "INT. LAMP ROOM — NIGHT" }
        ],
        [shot("A", "a"), shot("ghost", "b"), shot("B", "c")]
      ),
      { shotCount: 3 }
    );
    // Contiguity (§ 7.7.3): the orphan extends scene-0's run rather than
    // punching an unscened hole into it.
    expect(screenplay.shots.map((s) => s.scene_id)).toEqual([
      "scene-0",
      "scene-0",
      "scene-1"
    ]);
  });

  it("gives a leading orphan the first scene", () => {
    const screenplay = parseScreenplay(
      payload(
        [{ id: "A", slugline: "EXT. PIER — DAWN" }],
        [shot("ghost", "a")]
      ),
      { shotCount: 1 }
    );
    expect(screenplay.shots[0].scene_id).toBe("scene-0");
  });

  it("parses a response with no scenes and leaves scene_id unset", () => {
    const screenplay = parseScreenplay(
      { title: "Old Answer", shots: [{ action: "a" }, shot("A", "b")] },
      { shotCount: 2 }
    );
    expect(screenplay.scenes).toBeUndefined();
    expect(screenplay.shots.map((s) => s.scene_id)).toEqual([
      undefined,
      undefined
    ]);
  });

  it("keeps the first scene when two share a model id", () => {
    const screenplay = parseScreenplay(
      payload(
        [
          { id: "A", slugline: "EXT. PIER — DAWN" },
          { id: "A", slugline: "INT. LAMP ROOM — NIGHT" }
        ],
        [shot("A", "a")]
      ),
      { shotCount: 1 }
    );
    expect(screenplay.shots[0].scene_id).toBe("scene-0");
    expect(screenplay.scenes?.map((s) => s.id)).toEqual(["scene-0", "scene-1"]);
  });
});

describe("parseScreenplay genre and equipment", () => {
  it("reads the genre off the payload", () => {
    expect(
      parseScreenplay(
        { title: "t", genre: "Thriller", shots: [] },
        { shotCount: 0 }
      ).genre
    ).toBe("Thriller");
  });

  it("falls back to the caller's genre when the payload has none", () => {
    expect(
      parseScreenplay(
        { title: "t", shots: [] },
        { shotCount: 0, genre: "Horror" }
      ).genre
    ).toBe("Horror");
  });

  it("reads camera equipment", () => {
    const screenplay = parseScreenplay(
      {
        title: "t",
        shots: [
          { action: "a", camera: { framing: "wide", equipment: "crane" } }
        ]
      },
      { shotCount: 1 }
    );
    expect(screenplay.shots[0].camera).toEqual({
      framing: "wide",
      equipment: "crane"
    });
  });
});

describe("fallbackScreenplay", () => {
  it("returns one scene that every shot names", () => {
    const screenplay = fallbackScreenplay({
      brief: "A keeper closes the light",
      style: "cold blues",
      shotCount: 3,
      aspectRatio: "16:9"
    });
    expect(screenplay.scenes).toEqual([
      {
        type: "scene",
        id: "scene-0",
        slugline: "A keeper closes the light"
      }
    ]);
    expect(screenplay.shots.map((s) => s.scene_id)).toEqual([
      "scene-0",
      "scene-0",
      "scene-0"
    ]);
  });
});
