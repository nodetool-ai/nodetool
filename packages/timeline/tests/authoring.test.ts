/**
 * A hand-authored document arrives without the schema's bookkeeping; these pin
 * what is filled in, what is left alone, and what is lifted out.
 */
import { describe, expect, it } from "vitest";
import { normalizeAuthoredDocument, sourceTypeForClip } from "../src/authoring.js";

describe("normalizeAuthoredDocument", () => {
  it("fills the fields the schema requires and the caller omitted", () => {
    const { document } = normalizeAuthoredDocument({
      tracks: [{ id: "T1", name: "Video", type: "video" }],
      clips: [
        {
          id: "C1",
          trackId: "T1",
          name: "Title",
          mediaType: "text",
          startMs: 0,
          durationMs: 2000,
          animations: [{ role: "in", preset: "fade" }]
        }
      ]
    });
    expect(document.tracks).toEqual([
      { id: "T1", name: "Video", type: "video", index: 0, visible: true, locked: false }
    ]);
    const clip = (document.clips as Record<string, unknown>[])[0];
    expect(clip).toMatchObject({
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: []
    });
    expect((clip.animations as Record<string, unknown>[])[0].id).toBe("anim_1");
    expect(document.markers).toEqual([]);
  });

  it("never overwrites a value the caller sent", () => {
    const { document } = normalizeAuthoredDocument({
      tracks: [{ id: "T1", index: 4, visible: false, locked: true }],
      clips: [
        {
          id: "C1",
          status: "draft",
          locked: true,
          sourceType: "generated",
          versions: [{ id: "V1" }],
          animations: [{ id: "keep", role: "in", preset: "fade" }]
        }
      ],
      markers: [{ id: "M1", timeMs: 10, label: "beat" }]
    });
    expect(document.tracks).toEqual([
      { id: "T1", index: 4, visible: false, locked: true }
    ]);
    const clip = (document.clips as Record<string, unknown>[])[0];
    expect(clip).toMatchObject({ status: "draft", locked: true, sourceType: "generated" });
    expect((clip.animations as Record<string, unknown>[])[0].id).toBe("keep");
    expect(document.markers).toHaveLength(1);
  });

  it("numbers filled animation ids uniquely across the document", () => {
    const { document } = normalizeAuthoredDocument({
      clips: [
        { id: "C1", animations: [{ role: "in" }, { id: "anim_2", role: "out" }] },
        { id: "C2", animations: [{ role: "in" }] }
      ]
    });
    const ids = (document.clips as Record<string, unknown>[]).flatMap((c) =>
      (c.animations as Record<string, unknown>[]).map((a) => a.id)
    );
    expect(ids).toEqual(["anim_1", "anim_2", "anim_3"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("lifts document-level fps/width/height out as sequence settings", () => {
    const { document, settings } = normalizeAuthoredDocument({
      fps: 24,
      width: 1080,
      height: 1920,
      tracks: [],
      clips: []
    });
    expect(settings).toEqual({ fps: 24, width: 1080, height: 1920 });
    expect(document.fps).toBeUndefined();
    expect(document.width).toBeUndefined();
    expect(document.height).toBeUndefined();
  });
});

describe("sourceTypeForClip", () => {
  it("calls a clip generated only when it names what generates it", () => {
    expect(sourceTypeForClip({})).toBe("imported");
    expect(sourceTypeForClip({ prompt: "a fox" })).toBe("generated");
    expect(sourceTypeForClip({ workflowId: "wf" })).toBe("generated");
    expect(sourceTypeForClip({ prompt: "   " })).toBe("imported");
  });
});
