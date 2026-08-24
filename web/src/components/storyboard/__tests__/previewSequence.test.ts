/**
 * @jest-environment node
 */
import type { Shot } from "@nodetool-ai/protocol";
import type { StoryboardBoard } from "../../../stores/storyboard/StoryboardStore";
import {
  buildPreviewSequence,
  previewDimensions,
  previewSignature
} from "../previewSequence";

const shot = (overrides: Partial<Shot>): Shot => ({
  type: "shot",
  id: "shot-0",
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const clipShot = (id: string, index: number, extra: Partial<Shot> = {}): Shot =>
  shot({
    id,
    index,
    status: "rendered",
    clip: { type: "video", asset_id: `clip-${id}`, uri: `asset://${id}` },
    ...extra
  });

const stillShot = (id: string, index: number, extra: Partial<Shot> = {}): Shot =>
  shot({
    id,
    index,
    status: "keyframe_ready",
    keyframe: { type: "image", asset_id: `still-${id}`, uri: `asset://${id}` },
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

describe("previewDimensions", () => {
  it("maps landscape, portrait and square ratios onto a 1080 long edge", () => {
    expect(previewDimensions("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(previewDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(previewDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(previewDimensions("4:3")).toEqual({ width: 1440, height: 1080 });
  });

  it("falls back to 1920×1080 for a malformed ratio", () => {
    expect(previewDimensions("nonsense")).toEqual({
      width: 1920,
      height: 1080
    });
    expect(previewDimensions("16:0")).toEqual({ width: 1920, height: 1080 });
    expect(previewDimensions(undefined)).toEqual({ width: 1920, height: 1080 });
  });

  it("rounds an odd width to an even one", () => {
    // 1080 * 5/3 = 1800; 1080 * 7/5 = 1512 — pick a ratio that lands odd.
    expect(previewDimensions("1001:1000").width % 2).toBe(0);
  });
});

describe("buildPreviewSequence", () => {
  it("plays clips, holds keyframe stills, and drops shots with neither", () => {
    const preview = buildPreviewSequence(
      board({
        shots: [
          stillShot("b", 1, { duration_seconds: 3 }),
          clipShot("a", 0, { duration_seconds: 5, slug: "Opening" }),
          shot({ id: "empty", index: 2 })
        ]
      })
    );

    expect(preview).not.toBeNull();
    const { sequence, stillShotIds, skippedShotIds } = preview!;

    // The played clip, its audio twin, and the held still.
    expect(sequence.clips).toHaveLength(3);
    const [first, , second] = sequence.clips;
    expect(first.name).toBe("Opening");
    expect(first.mediaType).toBe("video");
    expect(first.currentAssetId).toBe("clip-a");
    expect(first.startMs).toBe(0);
    expect(first.durationMs).toBe(5000);

    expect(second.mediaType).toBe("image");
    expect(second.currentAssetId).toBe("still-b");
    expect(second.startMs).toBe(5000);
    expect(second.durationMs).toBe(3000);

    expect(sequence.durationMs).toBe(8000);
    expect(sequence.tracks.map((t) => t.name)).toEqual(["Shots", "Shot Audio"]);
    expect(stillShotIds).toEqual(["b"]);
    expect(skippedShotIds).toEqual(["empty"]);
  });

  it("defaults a shot with no duration to four seconds", () => {
    const preview = buildPreviewSequence(board({ shots: [clipShot("a", 0)] }));
    expect(preview!.sequence.clips[0].durationMs).toBe(4000);
  });

  it("sizes the sequence from the board aspect ratio at 30 fps", () => {
    const preview = buildPreviewSequence(
      board({ aspectRatio: "9:16", shots: [clipShot("a", 0)] })
    );
    expect(preview!.sequence.width).toBe(1080);
    expect(preview!.sequence.height).toBe(1920);
    expect(preview!.sequence.fps).toBe(30);
  });

  it("derives a stable sequence id from the board id", () => {
    const shots = [clipShot("a", 0)];
    const one = buildPreviewSequence(board({ shots }));
    const two = buildPreviewSequence(board({ shots }));
    expect(one!.sequence.id).toBe("storyboard-preview-board-1");
    expect(two!.sequence.id).toBe(one!.sequence.id);
  });

  it("returns null when no shot has playable media", () => {
    expect(buildPreviewSequence(board({ shots: [] }))).toBeNull();
    expect(
      buildPreviewSequence(board({ shots: [shot({}), shot({ id: "x", index: 1 })] }))
    ).toBeNull();
  });
});

describe("previewSignature", () => {
  it("ignores board edits that do not change the cut", () => {
    const shots = [clipShot("a", 0), stillShot("b", 1)];
    const base = board({ shots });
    expect(previewSignature({ ...base, brief: "new brief" })).toBe(
      previewSignature(base)
    );
    expect(previewSignature({ ...base, activeShotId: "a" })).toBe(
      previewSignature(base)
    );
  });

  it("changes when media, order, duration or ratio changes", () => {
    const base = board({ shots: [clipShot("a", 0), stillShot("b", 1)] });
    const signature = previewSignature(base);

    expect(previewSignature({ ...base, aspectRatio: "9:16" })).not.toBe(
      signature
    );
    expect(
      previewSignature(
        board({ shots: [clipShot("a", 0, { duration_seconds: 9 }), stillShot("b", 1)] })
      )
    ).not.toBe(signature);
    expect(
      previewSignature(board({ shots: [clipShot("a", 1), stillShot("b", 0)] }))
    ).not.toBe(signature);
    expect(
      previewSignature(board({ shots: [clipShot("a", 0), clipShot("b", 1)] }))
    ).not.toBe(signature);
  });

  it("is empty for a board that does not exist", () => {
    expect(previewSignature(undefined)).toBe("");
  });
});
