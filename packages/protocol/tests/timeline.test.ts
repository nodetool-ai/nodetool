/**
 * Contract tests for the timeline persistence schema.
 *
 * Regression guard: per-clip GPU effects (color grading, blur), 2-D transform,
 * border radius, and incoming transition must survive a parse round-trip. They
 * live on the `TimelineClip` type and are written by the inspector; when they
 * were missing from this Zod schema, tRPC silently stripped them on autosave,
 * so toggling color grading / blur reverted within one autosave cycle.
 */

import { describe, it, expect } from "vitest";
import {
  createTimelineVersionInput,
  listTimelineVersionsInput,
  midiNote,
  timelineClip,
  timelineDocument,
  timelineVersionListItem,
  timelineVersionResponse
} from "../src/api-schemas/timeline.js";

const baseClip = {
  id: "c1",
  trackId: "t1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video" as const,
  sourceType: "imported" as const,
  status: "generated" as const,
  locked: false,
  versions: []
};

describe("timelineClip schema", () => {
  it("preserves a clip color effect through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      effects: [
        {
          id: "inspector:color",
          type: "color" as const,
          enabled: true,
          brightness: 0.2,
          contrast: 1.1,
          saturation: 1.0
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.effects).toEqual(clip.effects);
  });

  it("preserves a clip blur effect through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      effects: [
        {
          id: "inspector:blur",
          type: "blur" as const,
          enabled: true,
          radius: 5
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.effects).toEqual(clip.effects);
  });

  it("preserves transform, borderRadius, and transitionIn", () => {
    const clip = {
      ...baseClip,
      transform: {
        position: { x: 10, y: -5 },
        scale: { x: 1.5, y: 1.5 },
        rotation: 0.25,
        anchor: { x: 0.5, y: 0.5 }
      },
      borderRadius: 12,
      transitionIn: { type: "crossfade" as const, durationMs: 300 }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.transform).toEqual(clip.transform);
    expect(parsed.borderRadius).toBe(12);
    expect(parsed.transitionIn).toEqual(clip.transitionIn);
  });

  it("carries an effect type this build cannot apply (I2)", () => {
    // It used to be refused, which failed the whole document rather than the
    // one effect — the hard failure I2 forbids. The compositors skip it and
    // `unsupportedEffectTypes` names it; the strictness that used to come from
    // refusing it is pinned in `timeline-motion-schema.test.ts`.
    const clip = {
      ...baseClip,
      effects: [{ id: "x", type: "bogus", enabled: true, amount: 0.5 }]
    };
    expect(timelineClip.parse(clip).effects).toEqual(clip.effects);
  });

  it("preserves clip animations through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      animations: [
        {
          id: "anim-1",
          role: "in" as const,
          preset: "slide",
          durationMs: 500,
          delayMs: 200,
          easing: "easeOut",
          enabled: true,
          params: { direction: "left", distance: 0.3 }
        },
        {
          id: "anim-2",
          role: "loop" as const,
          preset: "kenBurns",
          durationMs: 3000
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.animations).toEqual(clip.animations);
  });

  it("preserves an animation's stagger through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      animations: [
        {
          id: "anim-1",
          role: "in" as const,
          preset: "pop",
          durationMs: 400,
          stagger: { unit: "word", offsetMs: 120, from: "center" as const }
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.animations).toEqual(clip.animations);
    // A future unit id must parse (compiles un-staggered on old builds).
    const future = timelineClip.safeParse({
      ...baseClip,
      animations: [
        {
          id: "a",
          role: "in",
          preset: "fade",
          durationMs: 400,
          stagger: { unit: "character", offsetMs: 40 }
        }
      ]
    });
    expect(future.success).toBe(true);
  });

  it("parses a clip with no animations field", () => {
    const parsed = timelineClip.parse(baseClip);
    expect(parsed.animations).toBeUndefined();
  });

  it("accepts an unknown preset string (validation is the engine's job)", () => {
    const clip = {
      ...baseClip,
      animations: [
        {
          id: "a",
          role: "in" as const,
          preset: "future-preset-99",
          durationMs: 400
        }
      ]
    };
    const result = timelineClip.safeParse(clip);
    expect(result.success).toBe(true);
  });

  it("rejects an animation with an unknown role", () => {
    const clip = {
      ...baseClip,
      animations: [{ id: "a", role: "bogus", preset: "fade", durationMs: 400 }]
    };
    expect(timelineClip.safeParse(clip).success).toBe(false);
  });

  it("preserves an authored text clip and its style", () => {
    const clip = {
      ...baseClip,
      mediaType: "text" as const,
      textStyle: {
        text: "Opening title",
        fontSizePx: 96,
        color: "#ffffff",
        align: "center" as const,
        maxWidthFrac: 0.8
      }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.mediaType).toBe("text");
    expect(parsed.textStyle).toEqual(clip.textStyle);
  });

  it("preserves an authored shape clip and its style", () => {
    const clip = {
      ...baseClip,
      mediaType: "shape" as const,
      shapeStyle: {
        kind: "ellipse" as const,
        fill: "#334455",
        x: 0.2,
        y: 0.2,
        width: 0.6,
        height: 0.6
      }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.shapeStyle).toEqual(clip.shapeStyle);
  });
});

describe("timeline version schemas", () => {
  const baseVersion = {
    id: "v1",
    timelineId: "seq-1",
    version: 3,
    name: null,
    saveType: "manual" as const,
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 4200,
    createdAt: "2026-01-01T00:00:00Z"
  };

  it("keeps the list item free of the document", () => {
    const parsed = timelineVersionListItem.parse({
      ...baseVersion,
      document: { tracks: [], clips: [], markers: [] }
    });
    expect(parsed).not.toHaveProperty("document");
  });

  it("parses a list item with the name omitted entirely", () => {
    const withoutName: Record<string, unknown> = { ...baseVersion };
    delete withoutName.name;
    expect(timelineVersionListItem.safeParse(withoutName).success).toBe(true);
  });

  it("rejects an unknown saveType", () => {
    expect(
      timelineVersionListItem.safeParse({ ...baseVersion, saveType: "bogus" })
        .success
    ).toBe(false);
  });

  it("carries the document on the single-version response", () => {
    const document = { tracks: [], clips: [], markers: [] };
    const parsed = timelineVersionResponse.parse({ ...baseVersion, document });
    expect(parsed.document).toEqual(document);
  });

  it("bounds the list limit and the manual snapshot name", () => {
    expect(
      listTimelineVersionsInput.safeParse({ id: "s", limit: 501 }).success
    ).toBe(false);
    expect(
      listTimelineVersionsInput.safeParse({ id: "s", limit: 0 }).success
    ).toBe(false);
    expect(listTimelineVersionsInput.safeParse({ id: "s" }).success).toBe(true);
    expect(
      createTimelineVersionInput.safeParse({ id: "s", name: "x".repeat(201) })
        .success
    ).toBe(false);
  });
});

describe("midi", () => {
  const notes = [
    { id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: 960 },
    { id: "n2", pitch: 67, velocity: 80, startTick: 960, durationTick: 480 }
  ];

  const document = {
    tracks: [
      {
        id: "t-midi",
        name: "Keys",
        type: "midi" as const,
        index: 0,
        visible: true,
        locked: false,
        instrument: {
          type: "subtractive" as const,
          waveform: "saw" as const,
          attackMs: 5,
          decayMs: 120,
          sustain: 0.7,
          releaseMs: 150,
          cutoffHz: 4000,
          resonance: 0.7,
          gainDb: -6
        }
      }
    ],
    clips: [
      {
        ...baseClip,
        trackId: "t-midi",
        mediaType: "midi" as const,
        inPointMs: 0,
        durationMs: 2000,
        notes
      }
    ],
    markers: [],
    tempo: {
      bpm: 90,
      offsetMs: 250,
      timeSignature: { beatsPerBar: 3, beatUnit: 4 }
    }
  };

  it("round-trips a midi track, its clip's notes and the tempo", () => {
    const parsed = timelineDocument.parse(document);
    expect(parsed).toEqual(document);
    expect(parsed.clips[0].notes).toEqual(notes);
    expect(parsed.tracks[0].instrument).toEqual(document.tracks[0].instrument);
    expect(parsed.tempo).toEqual(document.tempo);
  });

  it("refuses a pitch outside 0..127 and a velocity outside 1..127", () => {
    expect(() => midiNote.parse({ ...notes[0], pitch: 128 })).toThrow();
    expect(() => midiNote.parse({ ...notes[0], velocity: 0 })).toThrow();
    expect(() => midiNote.parse({ ...notes[0], startTick: -1 })).toThrow();
    expect(() => midiNote.parse({ ...notes[0], durationTick: 0 })).toThrow();
    expect(() => midiNote.parse({ ...notes[0], pitch: 60.5 })).toThrow();
  });

  it("refuses a clip carrying more notes than the cap", () => {
    const many = Array.from({ length: 4097 }, (_, i) => ({
      id: `n${i}`,
      pitch: 60,
      velocity: 100,
      startTick: i,
      durationTick: 1
    }));
    expect(() =>
      timelineClip.parse({ ...baseClip, mediaType: "midi", notes: many })
    ).toThrow();
  });
});
