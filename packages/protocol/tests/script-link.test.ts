import { describe, expect, it } from "vitest";
import type { Entity, Screenplay, Shot } from "../src/creative.js";
import type { ScriptLine } from "../src/api-schemas/scripts.js";
import {
  NARRATOR_SPEAKER_ID,
  deriveShotScaffold,
  extractScriptFromScreenplay,
  orphanedLineIds,
  shotDialogueDrifted,
  validateScriptLink
} from "../src/script-link.js";

const shot = (overrides: Partial<Shot> & Pick<Shot, "id" | "index">): Shot => ({
  type: "shot",
  action: "A lighthouse against a darkening sky",
  status: "planned",
  ...overrides
});

const screenplay = (shots: Shot[], overrides: Partial<Screenplay> = {}): Screenplay => ({
  type: "screenplay",
  id: "sp_1",
  title: "Lighthouse Dawn",
  shots,
  ...overrides
});

const character = (id: string, name: string, voiceId?: string): Entity => ({
  type: "entity",
  id,
  kind: "character",
  name,
  descriptor: `${name}, weathered face`,
  voice_id: voiceId ?? null
});

const line = (id: string, text: string, speakerId: string | null): ScriptLine => ({
  id,
  speakerId,
  text,
  takes: []
});

describe("extractScriptFromScreenplay", () => {
  const maren = character("ent_maren", "Maren", "voice_maren");
  const otto = character("ent_otto", "Otto");
  const style: Entity = {
    type: "entity",
    id: "ent_noir",
    kind: "style",
    name: "Noir",
    descriptor: "high contrast"
  };

  const play = screenplay([
    shot({
      id: "shot_a",
      index: 0,
      action: "Maren climbs the stair",
      dialogue: "One more night.",
      narration: "The keeper had counted every dawn."
    }),
    shot({
      id: "shot_b",
      index: 1,
      action: "Otto watches the beam",
      dialogue: "It will hold."
    }),
    shot({ id: "shot_c", index: 2, action: "The beam dies" })
  ]);

  it("casts a shot's dialogue with the character entitiesForShot matched", () => {
    const { document } = extractScriptFromScreenplay(play, [maren, otto, style]);
    const lines = document.sections[0].lines;
    expect(lines.map((l) => l.text)).toEqual([
      "One more night.",
      "The keeper had counted every dawn.",
      "It will hold."
    ]);
    expect(lines[0].speakerId).toBe("speaker_ent_maren");
    expect(lines[1].speakerId).toBe(NARRATOR_SPEAKER_ID);
    expect(lines[2].speakerId).toBe("speaker_ent_otto");
    // The style entity applies to every shot but casts nobody.
    expect(document.cast.map((s) => s.id)).toEqual([
      "speaker_ent_maren",
      NARRATOR_SPEAKER_ID,
      "speaker_ent_otto"
    ]);
  });

  it("seeds voice_id onto the cast entry and leaves the rest unset", () => {
    const { document } = extractScriptFromScreenplay(play, [maren, otto]);
    expect(document.cast[0].voice).toEqual({
      provider: "",
      model: "",
      voice: "voice_maren"
    });
    expect(document.cast[2].voice).toBeNull();
  });

  it("returns a shot→lines map covering only shots with words", () => {
    const { lineIdsByShotId } = extractScriptFromScreenplay(play, [maren, otto]);
    expect(lineIdsByShotId).toEqual({
      shot_a: ["line_shot_a_dialogue", "line_shot_a_narration"],
      shot_b: ["line_shot_b_dialogue"]
    });
    expect(lineIdsByShotId.shot_c).toBeUndefined();
  });

  it("reads shots in index order, not array order", () => {
    const reversed = screenplay([
      shot({ id: "shot_late", index: 1, action: "b", narration: "second" }),
      shot({ id: "shot_early", index: 0, action: "a", narration: "first" })
    ]);
    const { document } = extractScriptFromScreenplay(reversed, []);
    expect(document.sections[0].lines.map((l) => l.text)).toEqual([
      "first",
      "second"
    ]);
  });

  it("honours an explicit entity_ids override on a shot", () => {
    const override = screenplay([
      shot({
        id: "shot_x",
        index: 0,
        action: "Maren climbs the stair",
        dialogue: "One more night.",
        entity_ids: ["ent_otto"]
      })
    ]);
    const { document } = extractScriptFromScreenplay(override, [maren, otto]);
    expect(document.sections[0].lines[0].speakerId).toBe("speaker_ent_otto");
  });

  it("leaves a line uncast when no character matches", () => {
    const { document } = extractScriptFromScreenplay(
      screenplay([
        shot({ id: "shot_y", index: 0, action: "A door opens", dialogue: "Hello?" })
      ]),
      []
    );
    expect(document.sections[0].lines[0].speakerId).toBeNull();
    expect(document.cast).toEqual([]);
  });

  it("titles the single section from the screenplay", () => {
    const { document } = extractScriptFromScreenplay(play, []);
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0].title).toBe("Lighthouse Dawn");
    expect(document.sections[0].id).toBe("section_sp_1");
  });
});

describe("validateScriptLink", () => {
  const scriptDoc = {
    sections: [
      {
        id: "sec_1",
        lines: [line("l1", "One", null), line("l2", "Two", null)]
      }
    ]
  };

  it("accepts a board whose references all resolve", () => {
    const play = screenplay(
      [
        shot({ id: "s1", index: 0, script_line_ids: ["l1"] }),
        shot({ id: "s2", index: 1, script_line_ids: ["l2"] })
      ],
      { script_id: "script_1" }
    );
    expect(validateScriptLink(play, scriptDoc)).toEqual({
      errors: [],
      warnings: []
    });
  });

  it("reports a line claimed by two shots", () => {
    const play = screenplay(
      [
        shot({ id: "s1", index: 0, script_line_ids: ["l1"] }),
        shot({ id: "s2", index: 1, script_line_ids: ["l1"] })
      ],
      { script_id: "script_1" }
    );
    const { errors } = validateScriptLink(play, scriptDoc);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("duplicate_line_reference");
    expect(errors[0].shotId).toBe("s2");
    expect(errors[0].message).toContain("s1");
  });

  it("reports a reference the script cannot satisfy, naming the shot", () => {
    const play = screenplay(
      [shot({ id: "s1", index: 0, script_line_ids: ["l1", "l_gone"] })],
      { script_id: "script_1" }
    );
    const { errors } = validateScriptLink(play, scriptDoc);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("unknown_line_reference");
    expect(errors[0].lineId).toBe("l_gone");
    expect(errors[0].shotId).toBe("s1");
  });

  it("warns, but does not error, when the linked script is gone", () => {
    const play = screenplay([shot({ id: "s1", index: 0 })], {
      script_id: "script_1"
    });
    const { errors, warnings } = validateScriptLink(play, null);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("missing_script");
  });

  it("errors on line references without a script_id", () => {
    const play = screenplay([
      shot({ id: "s1", index: 0, script_line_ids: ["l1"] })
    ]);
    const { errors } = validateScriptLink(play, scriptDoc);
    expect(errors.map((issue) => issue.code)).toEqual([
      "unlinked_board_reference"
    ]);
  });

  it("passes an unlinked board with no references", () => {
    const play = screenplay([shot({ id: "s1", index: 0 })]);
    expect(validateScriptLink(play, null)).toEqual({ errors: [], warnings: [] });
  });
});

describe("deriveShotScaffold", () => {
  const cast = [
    { id: NARRATOR_SPEAKER_ID, name: "Narrator", voice: null },
    { id: "speaker_maren", name: "Maren", voice: null }
  ];
  const script = {
    id: "script_1",
    cast,
    sections: [
      {
        id: "sec_1",
        lines: [
          line("l1", "The keeper had counted every dawn.", NARRATOR_SPEAKER_ID),
          line("l2", "One more night.", "speaker_maren")
        ]
      },
      {
        id: "sec_2",
        lines: [line("l3", "It will hold.", "speaker_maren")]
      }
    ]
  };

  it("gives one shot per line by default, in reading order", () => {
    const scaffold = deriveShotScaffold(script);
    expect(scaffold.map((s) => s.script_line_ids)).toEqual([
      ["l1"],
      ["l2"],
      ["l3"]
    ]);
    expect(scaffold.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("projects narrator lines as narration and cast lines as dialogue", () => {
    const scaffold = deriveShotScaffold(script);
    expect(scaffold[0]).toEqual({
      index: 0,
      script_line_ids: ["l1"],
      narration: "The keeper had counted every dawn."
    });
    expect(scaffold[1]).toEqual({
      index: 1,
      script_line_ids: ["l2"],
      dialogue: "One more night."
    });
  });

  it("treats an uncast line as narration", () => {
    const scaffold = deriveShotScaffold({
      id: "script_2",
      cast: [],
      sections: [{ id: "sec_1", lines: [line("l1", "Silence.", null)] }]
    });
    expect(scaffold[0].narration).toBe("Silence.");
    expect(scaffold[0].dialogue).toBeUndefined();
  });

  it("groups up to maxLinesPerShot lines but never crosses a section", () => {
    const scaffold = deriveShotScaffold(script, { maxLinesPerShot: 2 });
    expect(scaffold.map((s) => s.script_line_ids)).toEqual([
      ["l1", "l2"],
      ["l3"]
    ]);
    expect(scaffold[0].narration).toBe("The keeper had counted every dawn.");
    expect(scaffold[0].dialogue).toBe("One more night.");
  });

  it("skips empty lines", () => {
    const scaffold = deriveShotScaffold({
      id: "script_3",
      cast,
      sections: [
        {
          id: "sec_1",
          lines: [line("l1", "  ", null), line("l2", "Spoken.", "speaker_maren")]
        }
      ]
    });
    expect(scaffold).toHaveLength(1);
    expect(scaffold[0].script_line_ids).toEqual(["l2"]);
  });

  it("round-trips an extracted script back to the same projection", () => {
    const play = screenplay([
      shot({
        id: "shot_a",
        index: 0,
        action: "Maren climbs",
        dialogue: "One more night."
      }),
      shot({
        id: "shot_b",
        index: 1,
        action: "The beam turns",
        narration: "Dawn came anyway."
      })
    ]);
    const maren = character("ent_maren", "Maren");
    const { document } = extractScriptFromScreenplay(play, [maren]);
    const scaffold = deriveShotScaffold({ id: "script_1", ...document });
    expect(scaffold[0].dialogue).toBe("One more night.");
    expect(scaffold[1].narration).toBe("Dawn came anyway.");
  });
});

describe("shotDialogueDrifted", () => {
  const linesById = new Map<string, ScriptLine>([
    ["l1", line("l1", "One more night.", null)],
    ["l2", line("l2", "It will hold.", null)]
  ]);

  it("is false when the snapshot matches the joined live texts", () => {
    const target = shot({
      id: "s1",
      index: 0,
      script_line_ids: ["l1", "l2"],
      script_text_snapshot: "One more night.\nIt will hold."
    });
    expect(shotDialogueDrifted(target, linesById)).toBe(false);
  });

  it("is true after a linked line's text changes", () => {
    const target = shot({
      id: "s1",
      index: 0,
      script_line_ids: ["l1"],
      script_text_snapshot: "One last night."
    });
    expect(shotDialogueDrifted(target, linesById)).toBe(true);
  });

  it("is true when a linked line is gone", () => {
    const target = shot({
      id: "s1",
      index: 0,
      script_line_ids: ["l1", "l_gone"],
      script_text_snapshot: "One more night.\nIt will hold."
    });
    expect(shotDialogueDrifted(target, linesById)).toBe(true);
  });

  it("is false for a shot that links nothing", () => {
    expect(shotDialogueDrifted(shot({ id: "s1", index: 0 }), linesById)).toBe(
      false
    );
  });
});

describe("orphanedLineIds", () => {
  const scriptDoc = {
    sections: [
      {
        id: "sec_1",
        lines: [line("l1", "One", null), line("l2", "Two", null)]
      },
      { id: "sec_2", lines: [line("l3", "Three", null)] }
    ]
  };

  it("lists linked-script lines no shot covers, in reading order", () => {
    const play = screenplay(
      [shot({ id: "s1", index: 0, script_line_ids: ["l2"] })],
      { script_id: "script_1" }
    );
    expect(orphanedLineIds(play, scriptDoc)).toEqual(["l1", "l3"]);
  });

  it("is empty when every line has a shot", () => {
    const play = screenplay(
      [
        shot({ id: "s1", index: 0, script_line_ids: ["l1", "l2"] }),
        shot({ id: "s2", index: 1, script_line_ids: ["l3"] })
      ],
      { script_id: "script_1" }
    );
    expect(orphanedLineIds(play, scriptDoc)).toEqual([]);
  });

  it("is empty on an unlinked board", () => {
    const play = screenplay([shot({ id: "s1", index: 0 })]);
    expect(orphanedLineIds(play, scriptDoc)).toEqual([]);
  });
});
