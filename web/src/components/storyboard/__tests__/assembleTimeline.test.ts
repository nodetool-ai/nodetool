/**
 * @jest-environment node
 */
import type { Shot } from "@nodetool-ai/protocol";
import type { StoryboardBoard } from "../../../stores/storyboard/StoryboardStore";
import {
  buildTimelineDocument,
  isAssemblableShot
} from "../assembleTimeline";

const shot = (overrides: Partial<Shot>): Shot => ({
  type: "shot",
  id: "shot-0",
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const renderedShot = (id: string, index: number, extra: Partial<Shot> = {}): Shot =>
  shot({
    id,
    index,
    status: "rendered",
    clip: { type: "video", asset_id: `asset-${id}`, uri: `asset://${id}` },
    ...extra
  });

const board = (overrides: Partial<StoryboardBoard>): StoryboardBoard => ({
  id: "board-1",
  screenplay: null,
  shots: [],
  title: "My film",
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  updatedAt: 0,
  activeShotId: null,
  timelineId: null,
  ...overrides
});

describe("isAssemblableShot", () => {
  it("requires rendered status and a persisted clip asset", () => {
    expect(isAssemblableShot(renderedShot("a", 0))).toBe(true);
    expect(isAssemblableShot(shot({ status: "approved" }))).toBe(false);
    expect(
      isAssemblableShot(
        shot({ status: "rendered", clip: { type: "video", uri: "data:x" } })
      )
    ).toBe(false);
  });
});

describe("buildTimelineDocument", () => {
  it("lays rendered shots end to end in index order with storyboard links", () => {
    const doc = buildTimelineDocument(
      board({
        shots: [
          renderedShot("b", 1, { duration_seconds: 6 }),
          renderedShot("a", 0, { duration_seconds: 5, slug: "Opening" })
        ]
      })
    );

    expect(doc.tracks).toHaveLength(1);
    expect(doc.tracks[0].type).toBe("video");
    expect(doc.clips).toHaveLength(2);

    const [first, second] = doc.clips;
    expect(first.name).toBe("Opening");
    expect(first.startMs).toBe(0);
    expect(first.durationMs).toBe(5000);
    expect(first.currentAssetId).toBe("asset-a");
    expect(first.sourceType).toBe("imported");
    expect(first.storyboardBoardId).toBe("board-1");
    expect(first.storyboardShotId).toBe("a");

    expect(second.startMs).toBe(5000);
    expect(second.durationMs).toBe(6000);
    expect(second.storyboardShotId).toBe("b");
    expect(doc.durationMs).toBe(11000);
  });

  it("skips unrendered shots and reports them", () => {
    const doc = buildTimelineDocument(
      board({
        shots: [
          renderedShot("a", 0),
          shot({ id: "pending", index: 1, status: "keyframe_ready" })
        ]
      })
    );
    expect(doc.clips.filter((c) => c.storyboardShotId)).toHaveLength(1);
    expect(doc.skippedShotIds).toEqual(["pending"]);
  });

  it("adds draft narration and music clips spanning the cut", () => {
    const doc = buildTimelineDocument(
      board({
        shots: [renderedShot("a", 0, { duration_seconds: 4 })],
        screenplay: {
          type: "screenplay",
          id: "sp-1",
          title: "T",
          shots: [],
          narration: "The light had always obeyed her.",
          music_prompt: "slow maritime score, instrumental"
        }
      })
    );

    const audioTracks = doc.tracks.filter((t) => t.type === "audio");
    expect(audioTracks.map((t) => t.name)).toEqual(["Narration", "Music"]);

    const audioClips = doc.clips.filter((c) => c.mediaType === "audio");
    expect(audioClips).toHaveLength(2);
    for (const clip of audioClips) {
      expect(clip.bindingKind).toBe("text-to-audio");
      expect(clip.status).toBe("draft");
      expect(clip.startMs).toBe(0);
      expect(clip.durationMs).toBe(4000);
    }
    expect(audioClips[0].prompt).toContain("light had always obeyed");
    expect(audioClips[1].prompt).toContain("maritime score");
  });

  it("returns an empty document for a board with no rendered shots", () => {
    const doc = buildTimelineDocument(board({ shots: [shot({})] }));
    expect(doc.clips).toHaveLength(0);
    expect(doc.durationMs).toBe(0);
    expect(doc.skippedShotIds).toEqual(["shot-0"]);
    expect(doc.linked).toBe(false);
    expect(doc.skippedLineIds).toEqual([]);
  });
});

describe("buildTimelineDocument, linked to a script", () => {
  const take = (id: string, durationMs: number) => ({
    id: `${id}-take`,
    assetId: `voice-${id}`,
    durationMs,
    words: [],
    textSnapshot: "Hello",
    voiceSnapshot: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });

  const scriptInput = {
    scriptId: "script-1",
    cast: [{ id: "spk1", name: "Narrator", voice: null }],
    sections: [
      {
        id: "s1",
        lines: [
          {
            id: "line-a",
            speakerId: "spk1",
            text: "Hello",
            takes: [take("a", 2000)],
            currentTakeId: "a-take"
          },
          {
            id: "line-b",
            text: "And then",
            takes: [take("b", 3000)],
            currentTakeId: "b-take"
          }
        ]
      }
    ]
  };

  const linkedBoard = () =>
    board({
      shots: [
        renderedShot("a", 0, {
          duration_seconds: 30,
          script_line_ids: ["line-a", "line-b"]
        })
      ],
      screenplay: {
        type: "screenplay",
        id: "sp-1",
        title: "T",
        shots: [],
        script_id: "script-1",
        narration: "The light had always obeyed her.",
        music_prompt: "slow maritime score"
      }
    });

  it("takes shot lengths from the takes and lays a voiceover clip per line", () => {
    const doc = buildTimelineDocument(linkedBoard(), scriptInput);

    expect(doc.linked).toBe(true);
    const [shotClip] = doc.clips.filter((c) => c.mediaType === "video");
    expect(shotClip.durationMs).toBe(5000);

    const voice = doc.clips.filter((c) => c.scriptLineId);
    expect(voice.map((c) => c.scriptLineId)).toEqual(["line-a", "line-b"]);
    expect(voice.map((c) => c.startMs)).toEqual([0, 2000]);
    for (const clip of voice) {
      expect(clip.scriptId).toBe("script-1");
      expect(clip.storyboardBoardId).toBe("board-1");
      expect(clip.storyboardShotId).toBe("a");
    }
    // The script says the words now — no whole-cut narration draft clip.
    expect(doc.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Voiceover",
      "Music"
    ]);
    expect(doc.skippedLineIds).toEqual([]);
  });

  it("assembles the unlinked way when the script could not be read", () => {
    const doc = buildTimelineDocument(linkedBoard(), null);

    expect(doc.linked).toBe(false);
    expect(doc.skippedLineIds).toEqual([]);
    expect(doc.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Narration",
      "Music"
    ]);
    // The shot keeps its own target length without the takes to time it.
    expect(doc.clips[0].durationMs).toBe(30000);
  });

  it("ignores a script handed to an unlinked board", () => {
    const doc = buildTimelineDocument(
      board({ shots: [renderedShot("a", 0, { duration_seconds: 4 })] }),
      scriptInput
    );
    expect(doc.linked).toBe(false);
    expect(doc.clips.filter((c) => c.scriptLineId)).toHaveLength(0);
  });

  it("reports the lines of a shot it had to skip", () => {
    const doc = buildTimelineDocument(
      board({
        shots: [
          shot({
            id: "pending",
            index: 0,
            status: "keyframe_ready",
            script_line_ids: ["line-a"]
          })
        ],
        screenplay: {
          type: "screenplay",
          id: "sp-1",
          title: "T",
          shots: [],
          script_id: "script-1"
        }
      }),
      scriptInput
    );
    expect(doc.skippedShotIds).toEqual(["pending"]);
    expect(doc.skippedLineIds).toEqual(["line-a"]);
  });
});
