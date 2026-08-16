import { describe, expect, it } from "vitest";
import {
  normalizeStoryboardScreenplay,
  normalizeStoryboardShot,
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
