/**
 * Tests for the timeline merge adapter — which units an external op touched,
 * and what the draft keeps when the two sides disagree (ADR 0001).
 */
import { describe, expect, it } from "@jest/globals";

import type { ClipAnimation } from "@nodetool-ai/timeline";

import {
  adoptGeneratedClipField,
  mergeTimelineDocuments,
  timelineUnitsTouchedByOp,
  type GeneratedClipField,
  type TimelineMergeDoc
} from "../merge";
import { bakedAudioAnimationField } from "../TimelineStore";

const trackOf = (id: string, name = id) => ({
  id,
  type: "video",
  name,
  index: 0,
  visible: true,
  locked: false
});

const clipOf = (
  id: string,
  trackId: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  trackId,
  name: id,
  startMs: 0,
  durationMs: 1000,
  ...overrides
});

const docOf = (
  tracks: unknown[],
  clips: unknown[]
): TimelineMergeDoc => ({
  tracks,
  clips,
  markers: [],
  transcript: [],
  scriptEnabled: false,
  fps: 30,
  width: 1920,
  height: 1080
});

describe("timelineUnitsTouchedByOp", () => {
  it("attributes an id-less add to its own kind alone", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_add_track",
        input: { type: "audio", name: "Music" }
      })
    ).toEqual([{ kind: "track" }]);
  });

  it("attributes a stamped add to the unit it created", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_add_text_clip",
        input: { track_id: "T1", text: "Title", id: "C2" }
      })
    ).toEqual([
      { kind: "track", unitId: "T1" },
      { kind: "clip", unitId: "C2" }
    ]);
  });

  it("falls back to every kind only for a verb naming none of them", () => {
    expect(
      timelineUnitsTouchedByOp({ tool: "ui_timeline_seek", input: {} })
    ).toEqual([
      { kind: "track" },
      { kind: "clip" },
      { kind: "marker" },
      { kind: "transcript" }
    ]);
  });
});

describe("mergeTimelineDocuments", () => {
  it("leaves an unrelated drifted dirty clip alone when the op adds a track", () => {
    const base = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    // The user trimmed C1 and has not saved.
    const draft = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 400 })]
    );
    // The server copy carries an older drift on C1 the add_track write did
    // not make, plus the new track.
    const server = docOf(
      [trackOf("T1"), trackOf("T2", "Music")],
      [clipOf("C1", "T1", { durationMs: 900 })]
    );

    const { doc, conflicts } = mergeTimelineDocuments(base, draft, server, [
      { tool: "ui_timeline_add_track", input: { type: "audio", name: "Music" } }
    ]);

    expect(doc.tracks.map((t) => (t as { id: string }).id)).toEqual([
      "T1",
      "T2"
    ]);
    expect((doc.clips[0] as { durationMs: number }).durationMs).toBe(400);
    expect(conflicts).toEqual([]);
  });

  it("still contests a clip the write actually touched", () => {
    const base = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    const draft = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 400 })]
    );
    const server = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { durationMs: 900 })]
    );

    const { doc, conflicts } = mergeTimelineDocuments(base, draft, server, [
      { tool: "ui_timeline_trim_clip", input: { target: "C1" } }
    ]);

    expect((doc.clips[0] as { durationMs: number }).durationMs).toBe(400);
    expect(conflicts.map((c) => `${c.unit.kind}:${c.reason}`)).toEqual([
      "clip:edited"
    ]);
  });
});

describe("adoptGeneratedClipField", () => {
  /** A stand-in for `generatedMatte`: one field a route writes onto a clip. */
  const matteField: GeneratedClipField<{
    id: string;
    name?: string;
    matte?: unknown;
  }> = {
    valueOf: (clip) => clip.matte,
    overlay: (target, source) => ({ ...target, matte: source.matte })
  };

  const ops = [
    { tool: "ui_timeline_update_clip", input: { clip_id: "C1" } }
  ];

  /** base → draft → server for a clip the route wrote a matte onto. */
  const scenario = (draftClip: Record<string, unknown>) => {
    const base = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { matte: { assetId: "", status: "generating" } })]
    );
    const draft = docOf([trackOf("T1")], [clipOf("C1", "T1", draftClip)]);
    const server = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { matte: { assetId: "paid", status: "ready" } })]
    );
    return {
      base,
      draft,
      server,
      merged: mergeTimelineDocuments(base, draft, server, ops)
    };
  };

  it("overlays the generated field onto a clip the draft changed elsewhere", () => {
    const { base, draft, server, merged } = scenario({
      name: "User rename",
      matte: { assetId: "", status: "generating" }
    });
    // The unit merge alone refuses the whole clip: that is the bug.
    expect(merged.conflicts).toHaveLength(1);

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      matteField
    );

    expect(adopted.doc.clips[0]).toMatchObject({
      name: "User rename",
      matte: { assetId: "paid", status: "ready" }
    });
    expect(adopted.conflicts).toEqual([]);
    expect(adopted.pending).toEqual([]);
    // The clip's next base is what the server now holds.
    expect(adopted.nextBase.clips[0]).toMatchObject({
      name: "C1",
      matte: { assetId: "paid", status: "ready" }
    });
  });

  it("contests only a draft that changed the generated field itself", () => {
    const { base, draft, server, merged } = scenario({
      name: "User rename",
      matte: undefined
    });

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      matteField
    );

    expect(adopted.doc.clips[0]).toMatchObject({
      name: "User rename",
      matte: undefined
    });
    expect(adopted.pending).toHaveLength(1);
    expect(adopted.pending[0].external).toMatchObject({
      matte: { assetId: "paid", status: "ready" }
    });
    expect(adopted.conflicts).toEqual(adopted.pending);
    // A refused slot keeps the base it had, so the offer stays reachable.
    expect(adopted.nextBase.clips[0]).toMatchObject({
      matte: { assetId: "", status: "generating" }
    });
  });

  it("treats a draft that already holds the generated value as resolved", () => {
    // A live document sync applied the finished matte to the draft while this
    // pass still holds the pre-run base.
    const { base, draft, server, merged } = scenario({
      matte: { assetId: "paid", status: "ready" }
    });
    // Draft and server agree, so the unit merge has nothing to contest.
    expect(merged.conflicts).toEqual([]);

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      matteField
    );

    expect(adopted.doc.clips[0]).toMatchObject({
      matte: { assetId: "paid", status: "ready" }
    });
    expect(adopted.conflicts).toEqual([]);
    expect(adopted.pending).toEqual([]);
    // The base catches up, so the next autosave has nothing to write back.
    expect(adopted.nextBase.clips[0]).toMatchObject({
      matte: { assetId: "paid", status: "ready" }
    });
  });

  it("leaves a clip the route did not write in this field alone", () => {
    const base = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    const draft = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { name: "User rename" })]
    );
    const server = docOf([trackOf("T1")], [clipOf("C1", "T1")]);
    const merged = mergeTimelineDocuments(base, draft, server, ops);

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      matteField
    );

    expect(adopted.doc).toBe(merged.doc);
    expect(adopted.nextBase).toBe(merged.nextBase);
    expect(adopted.conflicts).toEqual(merged.conflicts);
  });
});

describe("bakedAudioAnimationField", () => {
  const ops = [{ tool: "ui_timeline_bake_audio", input: { clip_id: "C1" } }];

  /** An audio bake driving `scale`: what the property selector matches. */
  const bakeOf = (id: string, value: number): ClipAnimation => ({
    id,
    role: "emphasis",
    preset: "custom",
    durationMs: 2000,
    custom: {
      timeBase: "source",
      curves: [
        {
          property: "scale",
          keyframes: [
            { t: 0, sourceMs: 0, value: 1 },
            { t: 1, sourceMs: 2000, value }
          ]
        }
      ],
      bakedFrom: { kind: "audio", clipId: "A1" }
    }
  });

  const EARLIER = bakeOf("anim-0", 1.05);
  const BAKED = bakeOf("anim-1", 1.15);

  const sidesOf = (
    baseAnimations: ClipAnimation[],
    draftAnimations: ClipAnimation[],
    serverAnimations: ClipAnimation[]
  ) => {
    const base = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { animations: baseAnimations })]
    );
    const draft = docOf(
      [trackOf("T1")],
      [
        clipOf("C1", "T1", {
          name: "User rename",
          animations: draftAnimations
        })
      ]
    );
    const server = docOf(
      [trackOf("T1")],
      [clipOf("C1", "T1", { animations: serverAnimations })]
    );
    return {
      base,
      draft,
      server,
      merged: mergeTimelineDocuments(base, draft, server, ops)
    };
  };

  it("adopts the curve this bake wrote beside an earlier bake of the same property", () => {
    // Append mode: the server kept the earlier bake and added this one, and
    // the user renamed the clip while the request ran.
    const { base, draft, server, merged } = sidesOf(
      [EARLIER],
      [EARLIER],
      [EARLIER, BAKED]
    );

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      bakedAudioAnimationField("scale", "anim-1")
    );

    expect(adopted.doc.clips[0]).toMatchObject({
      name: "User rename",
      animations: [EARLIER, BAKED]
    });
    expect(adopted.conflicts).toEqual([]);
    expect(adopted.pending).toEqual([]);
  });

  it("falls back to the property selector when the route reports no id", () => {
    const { base, draft, server, merged } = sidesOf([], [], [BAKED]);

    const adopted = adoptGeneratedClipField(
      merged,
      { base, draft, server },
      ["C1"],
      bakedAudioAnimationField("scale")
    );

    expect(adopted.doc.clips[0]).toMatchObject({
      name: "User rename",
      animations: [BAKED]
    });
    expect(adopted.conflicts).toEqual([]);
  });
});
