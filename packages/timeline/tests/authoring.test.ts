/**
 * A hand-authored document arrives without the schema's bookkeeping; these pin
 * what is filled in, what is left alone, and what is lifted out.
 */
import { describe, expect, it } from "vitest";
import { typewriterTiming } from "../src/animation/typewriter.js";
import {
  normalizeAuthoredDocument,
  sourceTypeForClip
} from "../src/authoring.js";
import { findInstrumentPreset } from "../src/midi/presets.js";

describe("normalizeAuthoredDocument", () => {
  it("fills clip and track effect ids without collisions or overwriting authored ids", () => {
    const raw = {
      tracks: [
        {
          id: "video",
          name: "Video",
          type: "video",
          effects: [
            { type: "grain", enabled: true },
            { id: "effect_1", type: "vignette", enabled: true }
          ]
        }
      ],
      clips: [{ trackId: "video", effects: [{ type: "glow", enabled: true }] }]
    };
    const { document } = normalizeAuthoredDocument(raw);
    expect(document.tracks).toMatchObject([
      { effects: [{ id: "effect_2" }, { id: "effect_1" }] }
    ]);
    expect(document.clips).toMatchObject([{ effects: [{ id: "effect_3" }] }]);
    expect(normalizeAuthoredDocument(document).document).toEqual(document);
    expect(raw.clips[0].effects[0]).not.toHaveProperty("id");
  });

  it("declares omitted scene, audio and midi tracks from clip media types", () => {
    const { document } = normalizeAuthoredDocument({
      tracks: [],
      clips: [
        { trackId: "t_scenes", mediaType: "group" },
        { trackId: "sound", mediaType: "audio" },
        { trackId: "notes", mediaType: "midi" },
        { trackId: "t_scenes", mediaType: "group" }
      ]
    });
    expect(document.tracks).toEqual([
      {
        id: "t_scenes",
        name: "t_scenes",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      },
      {
        id: "sound",
        name: "sound",
        type: "audio",
        index: 1,
        visible: true,
        locked: false
      },
      {
        id: "notes",
        name: "notes",
        type: "midi",
        index: 2,
        visible: true,
        locked: false
      }
    ]);
  });

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
      {
        id: "T1",
        name: "Video",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
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
    expect(clip).toMatchObject({
      status: "draft",
      locked: true,
      sourceType: "generated"
    });
    expect((clip.animations as Record<string, unknown>[])[0].id).toBe("keep");
    expect(document.markers).toHaveLength(1);
  });

  it("numbers filled animation ids uniquely across the document", () => {
    const { document } = normalizeAuthoredDocument({
      clips: [
        {
          id: "C1",
          animations: [{ role: "in" }, { id: "anim_2", role: "out" }]
        },
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

  it("resolves a typewriter's plain duration the way animate_clip does", () => {
    const text = { text: "Hello there" };
    const typewriter = {
      role: "in",
      preset: "typewriter",
      delayMs: 200,
      durationMs: 500
    };
    const { document } = normalizeAuthoredDocument({
      tracks: [],
      clips: [
        {
          id: "C1",
          mediaType: "text",
          durationMs: 2000,
          textStyle: text,
          animations: [typewriter]
        }
      ]
    });
    const [animation] = (document.clips as Array<{ animations: unknown[] }>)[0]!
      .animations;
    expect(animation).toMatchObject({
      delayMs: 200,
      ...typewriterTiming(text.text, 1800, 500)
    });

    // Already resolved: a second pass leaves it alone.
    const again = normalizeAuthoredDocument(document);
    expect(again.document.clips).toEqual(document.clips);
  });

  it("resolves a midi track's instrument preset and leaves an unknown one", () => {
    const { document } = normalizeAuthoredDocument({
      tracks: [
        {
          id: "T1",
          name: "drums",
          type: "midi",
          instrument: { preset: "dr1-tr-void" }
        },
        {
          id: "T2",
          name: "bass",
          type: "midi",
          instrument: { preset: "no-such-voice" }
        }
      ],
      clips: []
    });
    const [drums, bass] = document.tracks as Array<{ instrument: unknown }>;
    expect(drums!.instrument).toEqual(
      findInstrumentPreset("dr1-tr-void")!.instrument
    );
    expect(bass!.instrument).toEqual({ preset: "no-such-voice" });
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
