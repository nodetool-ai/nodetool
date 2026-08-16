/**
 * Tests for joint storyboard + script assembly (linked.ts), plus the
 * regression fixtures that pin unlinked assembly: `buildLinkedTimeline` is a
 * third function precisely so `buildStoryboardTimeline` and
 * `buildScriptTimeline` keep producing what they produced before.
 */

import { describe, it, expect } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import type {
  ScriptLine,
  ScriptSection
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { buildLinkedTimeline } from "../src/linked.js";
import { buildScriptTimeline } from "../src/script.js";
import { DEFAULT_SHOT_MS, buildStoryboardTimeline } from "../src/storyboard.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

function voicedLine(
  id: string,
  durationMs: number,
  overrides: Partial<ScriptLine> = {}
): ScriptLine {
  return {
    id,
    speakerId: "speaker-1",
    text: `text of ${id}`,
    currentTakeId: `take-${id}`,
    takes: [
      {
        id: `take-${id}`,
        assetId: `asset-${id}`,
        durationMs,
        words: [{ word: id, startMs: 0, endMs: durationMs }],
        textSnapshot: `text of ${id}`,
        voiceSnapshot: null,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    ...overrides
  };
}

const draftLine = (id: string): ScriptLine => ({
  id,
  speakerId: "speaker-1",
  text: `text of ${id}`,
  takes: []
});

const section = (lines: ScriptLine[]): ScriptSection => ({
  id: "section-1",
  title: "Act one",
  lines
});

const cast = [
  {
    id: "speaker-1",
    name: "Ada",
    voice: { provider: "elevenlabs", model: "v3", voice: "rachel" }
  }
];

function renderedShot(
  id: string,
  index: number,
  overrides: Partial<Shot> = {}
): Shot {
  return {
    type: "shot",
    id,
    index,
    action: `action of ${id}`,
    status: "rendered",
    clip: { type: "video", asset_id: `clip-${id}` },
    ...overrides
  };
}

/** Clip ids and track ids are minted per call; compare everything else. */
const withoutIds = (clips: TimelineClip[]) =>
  clips.map(({ id: _id, trackId: _trackId, ...rest }) => rest);
const trackShape = (tracks: TimelineTrack[]) =>
  tracks.map(({ id: _id, ...rest }) => rest);

// ── buildLinkedTimeline ───────────────────────────────────────────────

describe("buildLinkedTimeline", () => {
  it("makes each shot as long as the takes it covers", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("s1", 0, { script_line_ids: ["a"] }),
        renderedShot("s2", 1, { script_line_ids: ["b"] })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [section([voicedLine("a", 1500), voicedLine("b", 2500)])]
      }
    });

    const video = result.clips.filter((c) => c.mediaType === "video");
    expect(video.map((c) => c.durationMs)).toEqual([1500, 2500]);
    expect(video.map((c) => c.startMs)).toEqual([0, 1500]);
    expect(result.durationMs).toBe(4000);
  });

  it("starts each line's clip at its shot start plus the in-shot offset", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("s1", 0, { script_line_ids: ["a", "b"] }),
        renderedShot("s2", 1, { script_line_ids: ["c"] })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [
          section([
            voicedLine("a", 1000, { pauseAfterMs: 400 }),
            voicedLine("b", 600),
            voicedLine("c", 900)
          ])
        ]
      }
    });

    const audio = result.clips.filter((c) => c.scriptLineId);
    expect(audio.map((c) => c.scriptLineId)).toEqual(["a", "b", "c"]);
    // Shot 1 spans 0–2000 (1000 + 400 pause + 600); shot 2 starts there.
    expect(audio.map((c) => c.startMs)).toEqual([0, 1400, 2000]);
    // The clip is the take alone — the pause is spacing, not audio.
    expect(audio.map((c) => c.durationMs)).toEqual([1000, 600, 900]);
    expect(result.durationMs).toBe(2900);
  });

  it("stamps both linkage key families on every voiceover clip", () => {
    const result = buildLinkedTimeline({
      boardId: "board-9",
      shots: [renderedShot("s1", 0, { script_line_ids: ["a"] })],
      script: {
        scriptId: "script-9",
        cast,
        sections: [section([voicedLine("a", 1000)])]
      }
    });

    const audio = result.clips.find((c) => c.mediaType === "audio");
    expect(audio).toBeDefined();
    expect(audio?.scriptId).toBe("script-9");
    expect(audio?.scriptLineId).toBe("a");
    expect(audio?.storyboardBoardId).toBe("board-9");
    expect(audio?.storyboardShotId).toBe("s1");
  });

  it("carries the same clip payload buildScriptTimeline writes", () => {
    const line = voicedLine("a", 1000);
    const linked = buildLinkedTimeline({
      boardId: "board-1",
      shots: [renderedShot("s1", 0, { script_line_ids: ["a"] })],
      script: { scriptId: "script-1", cast, sections: [section([line])] }
    });
    const script = buildScriptTimeline({
      scriptId: "script-1",
      cast,
      sections: [section([line])]
    });

    const fromLinked = linked.clips.find((c) => c.scriptLineId === "a");
    const fromScript = script.clips[0];
    expect(fromLinked?.name).toBe(fromScript.name);
    expect(fromLinked?.prompt).toBe(fromScript.prompt);
    expect(fromLinked?.speaker).toBe("Ada");
    expect(fromLinked?.voice).toBe("rachel");
    expect(fromLinked?.caption).toEqual(fromScript.caption);
    expect(fromLinked?.currentAssetId).toBe(fromScript.currentAssetId);
    expect(fromLinked?.bindingKind).toBe(fromScript.bindingKind);
    expect(fromLinked?.sourceType).toBe(fromScript.sourceType);
    expect(fromLinked?.status).toBe(fromScript.status);
  });

  it("emits no whole-cut narration draft clip", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      musicPrompt: "low strings",
      shots: [
        renderedShot("s1", 0, {
          narration: "the light turns",
          script_line_ids: ["a"]
        })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [section([voicedLine("a", 1000)])]
      }
    });

    expect(result.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Voiceover",
      "Music"
    ]);
    expect(result.clips.some((c) => c.name === "Narration")).toBe(false);
    const music = result.clips.find((c) => c.name === "Music");
    expect(music?.startMs).toBe(0);
    expect(music?.durationMs).toBe(1000);
    expect(music?.status).toBe("draft");
  });

  it("reports skipped shots and the lines they carried", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("s1", 0, { script_line_ids: ["a"] }),
        renderedShot("s2", 1, {
          status: "keyframe_ready",
          clip: undefined,
          script_line_ids: ["b", "c"]
        })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [
          section([
            voicedLine("a", 1000),
            voicedLine("b", 1000),
            voicedLine("c", 1000)
          ])
        ]
      }
    });

    expect(result.skippedShotIds).toEqual(["s2"]);
    expect(result.skippedLineIds).toEqual(["b", "c"]);
    expect(result.clips.filter((c) => c.scriptLineId)).toHaveLength(1);
  });

  it("skips an unvoiced line and falls back to the shot's own duration", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("s1", 0, {
          duration_seconds: 6,
          script_line_ids: ["a", "b"]
        }),
        renderedShot("s2", 1, { script_line_ids: ["c"] })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [
          section([
            voicedLine("a", 1000),
            draftLine("b"),
            voicedLine("c", 1000)
          ])
        ]
      }
    });

    const video = result.clips.filter((c) => c.mediaType === "video");
    expect(video[0].durationMs).toBe(6000);
    expect(result.skippedLineIds).toEqual(["b"]);
    expect(video[1].startMs).toBe(6000);
  });

  it("falls back to the default length when the shot has no duration either", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [renderedShot("s1", 0, { script_line_ids: ["a"] })],
      script: {
        scriptId: "script-1",
        cast,
        sections: [section([draftLine("a")])]
      }
    });

    expect(result.durationMs).toBe(DEFAULT_SHOT_MS);
    expect(result.clips.filter((c) => c.scriptLineId)).toEqual([]);
  });

  it("ignores audio timing on a shot pinned to manual duration", () => {
    const input = {
      boardId: "board-1",
      script: {
        scriptId: "script-1",
        cast,
        sections: [section([voicedLine("a", 1000)])]
      }
    };
    const audioLed = buildLinkedTimeline({
      ...input,
      shots: [
        renderedShot("s1", 0, { duration_seconds: 7, script_line_ids: ["a"] })
      ]
    });
    const manual = buildLinkedTimeline({
      ...input,
      shots: [
        renderedShot("s1", 0, {
          duration_seconds: 7,
          duration_source: "manual",
          script_line_ids: ["a"]
        })
      ]
    });

    expect(audioLed.durationMs).toBe(1000);
    expect(manual.durationMs).toBe(7000);
    // The voiceover clip is unaffected: it is the take, where the take falls.
    const audioClip = manual.clips.find((c) => c.scriptLineId === "a");
    expect(audioClip?.startMs).toBe(0);
    expect(audioClip?.durationMs).toBe(1000);
  });

  it("orders shots by index, not by array order", () => {
    const result = buildLinkedTimeline({
      boardId: "board-1",
      shots: [
        renderedShot("s2", 1, { script_line_ids: ["b"] }),
        renderedShot("s1", 0, { script_line_ids: ["a"] })
      ],
      script: {
        scriptId: "script-1",
        cast,
        sections: [section([voicedLine("a", 1000), voicedLine("b", 2000)])]
      }
    });

    expect(
      result.clips
        .filter((c) => c.mediaType === "video")
        .map((c) => c.storyboardShotId)
    ).toEqual(["s1", "s2"]);
  });
});

// ── Regression: unlinked assembly is untouched ────────────────────────

describe("unlinked assembly is unchanged", () => {
  const shots: Shot[] = [
    renderedShot("s1", 0, { slug: "Lighthouse", duration_seconds: 2 }),
    renderedShot("s2", 1),
    renderedShot("s3", 2, { status: "planned", clip: undefined })
  ];

  it("buildStoryboardTimeline output matches the fixture", () => {
    const result = buildStoryboardTimeline({
      boardId: "board-1",
      narration: "the light turns",
      musicPrompt: "low strings",
      shots
    });

    expect(trackShape(result.tracks)).toEqual([
      { name: "Shots", type: "video", index: 0, visible: true, locked: false },
      {
        name: "Narration",
        type: "audio",
        index: 1,
        visible: true,
        locked: false
      },
      { name: "Music", type: "audio", index: 2, visible: true, locked: false }
    ]);
    expect(withoutIds(result.clips)).toEqual([
      {
        name: "Lighthouse",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "clip-s1",
        storyboardBoardId: "board-1",
        storyboardShotId: "s1",
        locked: false,
        versions: []
      },
      {
        name: "Shot 2",
        startMs: 2000,
        durationMs: DEFAULT_SHOT_MS,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "clip-s2",
        storyboardBoardId: "board-1",
        storyboardShotId: "s2",
        locked: false,
        versions: []
      },
      {
        name: "Narration",
        startMs: 0,
        durationMs: 6000,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: "the light turns",
        status: "draft",
        locked: false,
        versions: []
      },
      {
        name: "Music",
        startMs: 0,
        durationMs: 6000,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: "low strings",
        status: "draft",
        locked: false,
        versions: []
      }
    ]);
    expect(result.durationMs).toBe(6000);
    expect(result.skippedShotIds).toEqual(["s3"]);
  });

  it("buildScriptTimeline output matches the fixture", () => {
    const result = buildScriptTimeline({
      scriptId: "script-1",
      cast,
      sections: [
        section([
          voicedLine("a", 1000, { pauseAfterMs: 250 }),
          draftLine("b"),
          voicedLine("c", 2000)
        ])
      ]
    });

    expect(trackShape(result.tracks)).toEqual([
      {
        name: "Voiceover",
        type: "audio",
        index: 0,
        visible: true,
        locked: false
      }
    ]);
    expect(withoutIds(result.clips)).toEqual([
      {
        name: "text of a",
        startMs: 0,
        durationMs: 1000,
        mediaType: "audio",
        sourceType: "imported",
        bindingKind: "text-to-audio",
        status: "generated",
        currentAssetId: "asset-a",
        prompt: "text of a",
        voice: "rachel",
        speaker: "Ada",
        caption: { words: [{ word: "a", startMs: 0, endMs: 1000 }] },
        scriptId: "script-1",
        scriptLineId: "a",
        locked: false,
        versions: []
      },
      {
        name: "text of c",
        startMs: 1250,
        durationMs: 2000,
        mediaType: "audio",
        sourceType: "imported",
        bindingKind: "text-to-audio",
        status: "generated",
        currentAssetId: "asset-c",
        prompt: "text of c",
        voice: "rachel",
        speaker: "Ada",
        caption: { words: [{ word: "c", startMs: 0, endMs: 2000 }] },
        scriptId: "script-1",
        scriptLineId: "c",
        locked: false,
        versions: []
      }
    ]);
    expect(result.durationMs).toBe(3250);
    expect(result.skippedLineIds).toEqual(["b"]);
  });
});
