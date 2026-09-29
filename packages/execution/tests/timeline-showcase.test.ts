import { parseClipEffectType } from "@nodetool-ai/timeline";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHOWCASE_TARGET } from "../src/timeline-debug/showcase.js";
import { validateTimelineSequence } from "../src/timeline-debug/index.js";

const track = (id: string, visible = true) => ({
  id,
  name: id,
  type: "overlay",
  index: 0,
  visible,
  locked: false
});
const clip = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  trackId: id,
  name: id,
  startMs: 0,
  durationMs: 2000,
  mediaType: "shape",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  shapeStyle: { kind: "rect", fill: "#ffffff" },
  ...overrides
});
const document = (
  clips = [clip("one")],
  extra: Record<string, unknown> = {}
) => ({
  tracks: clips.map((c) => track(c.trackId)),
  clips,
  markers: [],
  ...extra
});
const warnings = (raw: unknown) =>
  validateTimelineSequence(raw, { tier: "showcase" }).warnings.filter((w) =>
    w.code.startsWith("showcase_")
  );
const custom = {
  id: "motion",
  role: "in",
  preset: "custom",
  durationMs: 500,
  custom: {
    curves: [
      {
        property: "positionY",
        keyframes: [
          { t: 0, value: 100 },
          { t: 1, value: 0 }
        ]
      }
    ]
  }
};
const camera = { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000 };
const transform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
  depthPx: 100
};

function showcase() {
  return document(
    [
      clip("scene", {
        mediaType: "group",
        shapeStyle: undefined,
        transform,
        animations: [custom],
        effects: [{ id: "finish", type: "grain", enabled: true, amount: 0.1 }]
      }),
      clip("bed", { parentId: "scene" }),
      clip("mid", { parentId: "scene" }),
      clip("front", { parentId: "scene" })
    ],
    { camera2d: camera }
  );
}

describe("timeline showcase validation", () => {
  it("is opt-in and adds five actionable structural warnings without failing correctness", () => {
    expect(validateTimelineSequence(document()).warnings).toEqual([]);
    const result = validateTimelineSequence(document(), { tier: "showcase" });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "showcase_scene_groups_missing",
        "showcase_custom_motion_missing",
        "showcase_finish_missing",
        "showcase_camera_missing",
        "showcase_layer_density_low"
      ])
    );
    expect(warnings(document()).length).toBeGreaterThanOrEqual(5);
  });
  it("rejects a presence-only scene with thin motion and finishing", () => {
    expect(warnings(showcase()).map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "showcase_scene_group_density_low",
        "showcase_custom_animation_density_low",
        "showcase_effect_variety_low",
        "showcase_clip_density_low"
      ])
    );
  });
  it("does not count disabled motion, zero-strength finish, unused camera or empty groups", () => {
    expect(
      warnings(
        document(
          [
            clip("one", {
              animations: [{ ...custom, enabled: false }],
              effects: [
                { id: "grain", type: "grain", enabled: true, amount: 0 }
              ]
            }),
            clip("empty", { mediaType: "group", shapeStyle: undefined })
          ],
          { camera2d: camera }
        )
      ).map((w) => w.code)
    ).toEqual(
      expect.arrayContaining([
        "showcase_scene_groups_missing",
        "showcase_custom_motion_missing",
        "showcase_finish_missing",
        "showcase_camera_missing"
      ])
    );
  });
  it("ignores hidden tracks, hidden clips, empty text, audio and adjustment clips in density", () => {
    const clips = [
      clip("bed"),
      clip("hidden", { hidden: true }),
      clip("track-hidden"),
      clip("empty-text", {
        mediaType: "text",
        shapeStyle: undefined,
        textStyle: { text: "", fontSizePx: 30, color: "#fff" }
      }),
      clip("audio", { mediaType: "audio", shapeStyle: undefined }),
      clip("grade", { mediaType: "adjustment", shapeStyle: undefined })
    ];
    const raw = document(clips, {
      tracks: clips.map((c) => track(c.trackId, c.id !== "track-hidden"))
    });
    expect(warnings(raw).map((w) => w.code)).toContain(
      "showcase_layer_density_low"
    );
  });
  it("measures concurrent duration rather than total clip count and clips children to scene windows", () => {
    const raw = showcase();
    raw.clips[0].durationMs = 200;
    raw.clips.push(clip("tail", { startMs: 200, durationMs: 1800 }));
    raw.tracks.push(track("tail"));
    const density = warnings(raw).find(
      (w) => w.code === "showcase_layer_density_low"
    );
    expect(density?.message).toContain("10%");
    expect(density?.message).toContain("80%");
  });
  it("does not count constant or out-of-window custom curves", () => {
    for (const animation of [
      { ...custom, delayMs: 3000 },
      {
        ...custom,
        custom: {
          curves: [
            {
              property: "positionY",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 0 }
              ]
            }
          ]
        }
      }
    ]) {
      expect(
        warnings(document([clip("one", { animations: [animation] })])).map(
          (w) => w.code
        )
      ).toContain("showcase_custom_motion_missing");
    }
  });
  it("recognizes non-neutral color and levels grades while ignoring neutral or disabled grades", () => {
    const base = { id: "grade", enabled: true };
    const grades = [
      { ...base, type: "color", contrast: 1, saturation: 1, brightness: 0 },
      {
        ...base,
        type: "levels",
        inBlack: 0,
        inWhite: 1,
        gamma: 1,
        outBlack: 0,
        outWhite: 1
      },
      { ...base, type: "grain", amount: 0.1, enabled: false }
    ];
    for (const effect of grades) {
      expect(
        warnings(document([clip("one", { effects: [effect] })])).map(
          (w) => w.code
        )
      ).toContain("showcase_finish_missing");
    }
    for (const effect of [
      { ...base, type: "color", saturation: 0 },
      {
        ...base,
        type: "levels",
        inBlack: 0.1,
        inWhite: 1,
        gamma: 1,
        outBlack: 0,
        outWhite: 1
      }
    ]) {
      expect(
        warnings(document([clip("one", { effects: [effect] })])).map(
          (w) => w.code
        )
      ).not.toContain("showcase_finish_missing");
    }
  });
  it("ignores finish and motion on an inactive group or adjustment outside visible content", () => {
    const raw = document(
      [
        clip("visible"),
        clip("scene", {
          mediaType: "group",
          hidden: true,
          animations: [custom],
          transform,
          effects: [{ id: "finish", type: "grain", enabled: true, amount: 0.1 }]
        }),
        clip("child", { parentId: "scene" }),
        clip("adjust", {
          mediaType: "adjustment",
          startMs: 3000,
          effects: [
            { id: "finish2", type: "grain", enabled: true, amount: 0.1 }
          ]
        })
      ],
      { camera2d: camera }
    );
    expect(warnings(raw).map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "showcase_custom_motion_missing",
        "showcase_finish_missing",
        "showcase_camera_missing"
      ])
    );
  });
  it("handles a large sequence of disjoint windows without counting boundary contacts as overlap", () => {
    const clips = Array.from({ length: 12000 }, (_, i) =>
      clip(`c${i}`, { startMs: i * 100, durationMs: 100 })
    );
    const result = warnings(document(clips));
    expect(
      result.find((w) => w.code === "showcase_layer_density_low")?.message
    ).toContain("0%");
  });
});

const exampleDir = fileURLToPath(
  new URL("../../base-nodes/nodetool/examples/timelines/", import.meta.url)
);
describe("showcase example floor", () => {
  const examples = readdirSync(exampleDir).filter(
    (name) => name.endsWith(".timeline.json") && !name.startsWith("t-minus-30")
  );
  // Asserts against `SHOWCASE_TARGET` itself, not a second hardcoded copy of
  // its numbers — a target that drifts from what the shipped examples
  // measure to now fails here with a diff naming the new medians, instead of
  // this test silently duplicating whatever showcase.ts happens to say.
  it("measures the medians used in the validator derivation", () => {
    const rows = examples.map((name) => {
      const { document: doc } = JSON.parse(
        readFileSync(exampleDir + name, "utf8")
      );
      const visual = doc.clips.filter(
        (c: { mediaType: string }) =>
          c.mediaType !== "audio" && c.mediaType !== "midi"
      );
      const seconds =
        (Math.max(
          ...visual.map(
            (c: { startMs: number; durationMs: number }) =>
              c.startMs + c.durationMs
          )
        ) -
          Math.min(...visual.map((c: { startMs: number }) => c.startMs))) /
        1000;
      const effects = [...doc.clips, ...doc.tracks].flatMap(
        (c: { effects?: Array<{ type: string; enabled: boolean }> }) =>
          c.effects ?? []
      );
      return {
        groups: doc.clips.filter(
          (c: { mediaType: string }) => c.mediaType === "group"
        ).length,
        custom:
          doc.clips
            .flatMap(
              (c: { animations?: Array<{ preset: string }> }) =>
                c.animations ?? []
            )
            .filter((a: { preset: string }) => a.preset === "custom").length /
          seconds,
        effects: new Set(
          effects
            .filter(
              (e: { enabled: boolean; type: string }) =>
                e.enabled && parseClipEffectType(e.type) !== null
            )
            .map((e: { type: string }) => e.type)
        ).size,
        clips: doc.clips.length / seconds
      };
    });
    const median = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    expect(median(rows.map((r) => r.groups))).toBe(SHOWCASE_TARGET.groups);
    expect(median(rows.map((r) => r.custom))).toBeCloseTo(SHOWCASE_TARGET.customPerSecond);
    expect(median(rows.map((r) => r.effects))).toBe(SHOWCASE_TARGET.effects);
    expect(median(rows.map((r) => r.clips))).toBeCloseTo(SHOWCASE_TARGET.clipsPerSecond);
  });
  it("actually inspects shipped showcases", () =>
    expect(examples.length).toBeGreaterThan(0));
  // serein's t476/t477/t478 ("Formal"/"Brief"/"Warm") were previously an
  // allow-listed finding here — three text clips that looked identically
  // positioned because their boxes were measured from each clip's own
  // authored (pre-layout) transform. They are `row`/`stack` children; once
  // boxes are measured from the layout-resolved position (see
  // `resolveClipLayouts` in showcase.ts), they sit apart as authored and the
  // finding was a measurement artifact, not a real one. No allow-list needed.
  for (const name of examples) {
    it(name + " has zero showcase warnings", () => {
      const example = JSON.parse(readFileSync(exampleDir + name, "utf8"));
      expect(
        validateTimelineSequence(example.document, {
          tier: "showcase",
          fps: example.fps,
          width: example.width,
          height: example.height
        }).warnings.filter((w) => w.code.startsWith("showcase_"))
      ).toEqual([]);
    });
  }
  it("rejects the measured agent-run shape", () => {
    const clips = Array.from({ length: 29 }, (_, i) =>
      clip("agent" + i, {
        durationMs: 10000,
        ...(i < 3
          ? { mediaType: "group", shapeStyle: undefined, transform }
          : { parentId: "agent" + (i % 3) }),
        ...(i < 20 ? { animations: [{ ...custom, id: "a" + i }] } : {}),
        ...(i === 0
          ? {
              effects: [
                { id: "blur", type: "blur", enabled: true, radius: 2 },
                { id: "grain", type: "grain", enabled: true, amount: 0.1 },
                {
                  id: "vignette",
                  type: "vignette",
                  enabled: true,
                  amount: 0.2,
                  softness: 0.5
                }
              ]
            }
          : {})
      })
    );
    const result = validateTimelineSequence(
      document(clips, { camera2d: camera }),
      { tier: "showcase" }
    );
    expect(result.errors).toEqual([]);
    expect(
      result.warnings
        .filter((w) => w.code.startsWith("showcase_"))
        .map((w) => w.code)
    ).toEqual(
      expect.arrayContaining([
        "showcase_scene_group_density_low",
        "showcase_custom_animation_density_low",
        "showcase_effect_variety_low",
        "showcase_clip_density_low"
      ])
    );
  });
  it("does not treat a chain of finishing effects alone as variety", () => {
    const effects = [
      { type: "grain", amount: 0.1 },
      { type: "vignette", amount: 0.2, softness: 0.5 },
      { type: "color", contrast: 1.1 },
      {
        type: "curves",
        master: [
          { x: 0, y: 0 },
          { x: 1, y: 0.9 }
        ]
      },
      {
        type: "levels",
        inBlack: 0.1,
        inWhite: 1,
        gamma: 1,
        outBlack: 0,
        outWhite: 1
      },
      { type: "lut", cube: "reference", intensity: 0.5 }
    ].map((effect, i) => ({ ...effect, id: "finish" + i, enabled: true }));
    const raw = document([clip("finish-only", { effects })]);
    expect(validateTimelineSequence(raw).errors).toEqual([]);
    expect(warnings(raw).map((w) => w.code)).toContain(
      "showcase_effect_variety_low"
    );
  });
  it("requires blur on a deliberately fast position or scale move", () => {
    for (const [property, value] of [
      ["positionX", 100000],
      ["offsetX", 100000],
      ["offsetY", 100000],
      ["scale", 1000]
    ]) {
      const fast = clip("fast", {
        animations: [
          {
            ...custom,
            custom: {
              curves: [
                {
                  property,
                  keyframes: [
                    { t: 0, value: 0 },
                    { t: 1, value }
                  ]
                }
              ]
            }
          }
        ]
      });
      expect(warnings(document([fast])).map((w) => w.code)).toContain(
        "showcase_motion_blur_missing"
      );
      const blurred = {
        ...fast,
        motionBlur: { shutterAngle: 180, samplesPerFrame: 8 }
      };
      expect(warnings(document([blurred])).map((w) => w.code)).not.toContain(
        "showcase_motion_blur_missing"
      );
    }
  });
});

describe("showcase craft checks", () => {
  it("warns when a scene's visible content covers little of the frame", () => {
    const thin = document([
      clip("scene", { mediaType: "group", shapeStyle: undefined }),
      clip("dot", {
        parentId: "scene",
        shapeStyle: {
          kind: "rect",
          x: 0.48,
          y: 0.48,
          width: 0.04,
          height: 0.04,
          fill: "#ffffff"
        }
      })
    ]);
    expect(warnings(thin).map((w) => w.code)).toContain(
      "showcase_frame_underfilled"
    );

    const filled = document([
      clip("scene", { mediaType: "group", shapeStyle: undefined }),
      clip("bed", {
        parentId: "scene",
        shapeStyle: {
          kind: "rect",
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.3,
          fill: "#ffffff"
        }
      })
    ]);
    expect(warnings(filled).map((w) => w.code)).not.toContain(
      "showcase_frame_underfilled"
    );

    const tilted = document([
      clip("scene", { mediaType: "group", shapeStyle: undefined }),
      // A small always-visible mark on its own — excluding the perspective
      // group entirely would still leave this one alone, which is
      // underfilled by itself. That is what makes the assertion below a real
      // test of *counting* the tilted content, not just of not crashing on
      // it: a scene with no counted content at all is skipped, not warned,
      // so a scene that excluded the tilted group here would pass this
      // assertion "for free" without ever measuring it.
      clip("mark", {
        parentId: "scene",
        shapeStyle: { kind: "rect", x: 0.48, y: 0.48, width: 0.04, height: 0.04, fill: "#ffffff" }
      }),
      clip("cam", {
        parentId: "scene",
        mediaType: "group",
        shapeStyle: undefined,
        transform: { ...transform, rotationX: 10, perspective: 2800 }
      }),
      clip("bed", {
        parentId: "cam",
        shapeStyle: {
          kind: "rect",
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8,
          fill: "#ffffff"
        }
      })
    ]);
    expect(warnings(tilted).map((w) => w.code)).not.toContain(
      "showcase_frame_underfilled"
    );
  });

  it("resolves a flex column's children before measuring collision boxes", () => {
    // Flex `gap` cannot go negative (CSS clamps it to 0), so a negative
    // separation — the case that must still collide — is authored as a
    // negative top margin on the second line instead.
    const stacked = (gapPx: number) =>
      document([
        clip("stack", {
          mediaType: "group",
          shapeStyle: undefined,
          layout: { display: "flex", flexDirection: "column" }
        }),
        clip("line1", {
          parentId: "stack",
          mediaType: "text",
          shapeStyle: undefined,
          textStyle: { text: "Title line", fontSizePx: 40, color: "#ffffff" }
        }),
        clip("line2", {
          parentId: "stack",
          mediaType: "text",
          shapeStyle: undefined,
          textStyle: { text: "Subtitle line", fontSizePx: 40, color: "#ffffff" },
          flexItem: { margin: { top: gapPx } }
        })
      ]);
    expect(warnings(stacked(100)).map((w) => w.code)).not.toContain(
      "showcase_text_collision"
    );
    expect(warnings(stacked(-60)).map((w) => w.code)).toContain(
      "showcase_text_collision"
    );
  });

  it("warns when a text box crosses an unfilled ring's stroke, not when it sits in the hole", () => {
    const ring = clip("ring", {
      mediaType: "shape",
      shapeStyle: {
        kind: "ellipse",
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2,
        stroke: "#ffffff",
        strokeWidthPx: 8
      }
    });
    const crossing = document([
      ring,
      clip("label", {
        mediaType: "text",
        shapeStyle: undefined,
        textStyle: {
          text: "INTRODUCING SOMETHING NEW TODAY",
          fontSizePx: 50,
          color: "#ffffff"
        }
      })
    ]);
    expect(warnings(crossing).map((w) => w.code)).toContain(
      "showcase_text_collision"
    );

    const inTheHole = document([
      ring,
      clip("label", {
        mediaType: "text",
        shapeStyle: undefined,
        textStyle: { text: "OK", fontSizePx: 20, color: "#ffffff" }
      })
    ]);
    expect(warnings(inTheHole).map((w) => w.code)).not.toContain(
      "showcase_text_collision"
    );
  });

  it("reads a flex-resized ring's stroke at its resolved size, not its tiny authored one", () => {
    // Same ring, same text, same expected outcome as the test above — the
    // ring is just authored tiny and stretched to the identical 384x216 box
    // (centered, matching x:0.4/y:0.4/width:0.2/height:0.2 of a 1920x1080
    // frame) by a flex container instead of being authored at that size
    // directly. If `shapeStrokeChordsInFrame` read the authored box instead
    // of the resolved one, the ring would collapse to a near-invisible dot
    // at the frame's centre and never cross the text's box.
    const ringFlex = clip("ringFlex", {
      mediaType: "group",
      shapeStyle: undefined,
      layout: { display: "flex", width: 384, height: 216 }
    });
    const ring = clip("ring", {
      parentId: "ringFlex",
      mediaType: "shape",
      shapeStyle: {
        kind: "ellipse",
        x: 0.49,
        y: 0.49,
        width: 0.01,
        height: 0.01,
        stroke: "#ffffff",
        strokeWidthPx: 8
      },
      flexItem: { position: "absolute", inset: 0 }
    });
    const crossing = document([
      ringFlex,
      ring,
      clip("label", {
        mediaType: "text",
        shapeStyle: undefined,
        textStyle: {
          text: "INTRODUCING SOMETHING NEW TODAY",
          fontSizePx: 50,
          color: "#ffffff"
        }
      })
    ]);
    expect(warnings(crossing).map((w) => w.code)).toContain(
      "showcase_text_collision"
    );

    const inTheHole = document([
      ringFlex,
      ring,
      clip("label", {
        mediaType: "text",
        shapeStyle: undefined,
        textStyle: { text: "OK", fontSizePx: 20, color: "#ffffff" }
      })
    ]);
    expect(warnings(inTheHole).map((w) => w.code)).not.toContain(
      "showcase_text_collision"
    );
  });

  it("reads a flex row's resolved position through its rotated, translated ancestor, not as absolute frame pixels", () => {
    // The tidewater pattern: a flex row (its own flex root) sits inside a
    // plain, non-flex ancestor group that is itself moved and tilted — same
    // shape as "ticket copy"/"price" living in a row inside "stub" inside
    // "ticket" (translated down, rotated a few degrees). A flex root's
    // resolved position is parent-local (relative to its own untranslated
    // frame, packages/timeline/AGENTS.md "PARENT-LOCAL") — the renderer's
    // ordinary ancestor-matrix composition adds the ancestor's real
    // translation and rotation back on top of that, exactly once. Reading a
    // flex-managed clip's resolved box as if it were already absolute frame
    // pixels skips that composition entirely, landing "copy"/"price" near
    // the frame's untouched centre — right on top of an unrelated clip
    // actually placed there — instead of down and tilted with their own
    // ancestor.
    const box = clip("box", {
      mediaType: "group",
      shapeStyle: undefined,
      transform: {
        position: { x: 0, y: 300 },
        scale: { x: 1, y: 1 },
        rotation: -0.15,
        anchor: { x: 0.5, y: 0.5 }
      }
    });
    const row = clip("row", {
      parentId: "box",
      mediaType: "group",
      shapeStyle: undefined,
      layout: { display: "flex", flexDirection: "row", gap: 20 }
    });
    const copy = clip("copy", {
      parentId: "row",
      mediaType: "text",
      shapeStyle: undefined,
      textStyle: { text: "TICKET COPY", fontSizePx: 40, color: "#ffffff" }
    });
    const price = clip("price", {
      parentId: "row",
      mediaType: "text",
      shapeStyle: undefined,
      textStyle: { text: "$42", fontSizePx: 40, color: "#ffffff" }
    });
    // Unrelated, sitting at the untouched frame centre — where "copy"/"price"
    // would wrongly land if their resolved position were read as absolute.
    const dates = clip("dates", {
      mediaType: "text",
      shapeStyle: undefined,
      textStyle: { text: "AUG 14-16", fontSizePx: 40, color: "#ffffff" }
    });
    const result = warnings(document([box, row, copy, price, dates]));
    expect(result.map((w) => w.code)).not.toContain("showcase_text_collision");
  });

  it("does not flag text sitting under an opaque shape drawn behind it", () => {
    const behind = document(
      [
        clip("label", {
          mediaType: "text",
          shapeStyle: undefined,
          textStyle: { text: "TITLE", fontSizePx: 60, color: "#ffffff" }
        }),
        clip("bed", {
          mediaType: "shape",
          trackId: "bed",
          shapeStyle: {
            kind: "rect",
            x: 0.2,
            y: 0.2,
            width: 0.5,
            height: 0.5,
            fill: "#111111"
          }
        })
      ],
      {
        tracks: [
          track("label"),
          { ...track("bed"), index: 1 }
        ]
      }
    );
    expect(warnings(behind).map((w) => w.code)).not.toContain(
      "showcase_text_collision"
    );
  });

  it("warns on a thin motion range and not on a document with style tracks and a transition", () => {
    const thin = document([
      clip("one", { animations: [custom] })
    ]);
    expect(warnings(thin).map((w) => w.code)).toContain(
      "showcase_motion_range_narrow"
    );

    const wide = document([
      clip("one", {
        animations: [
          custom,
          {
            id: "style",
            role: "in",
            preset: "custom",
            durationMs: 500,
            custom: {
              curves: [
                {
                  property: "scale",
                  keyframes: [
                    { t: 0, value: 0.8 },
                    { t: 1, value: 1 }
                  ]
                }
              ],
              styleTracks: [
                {
                  target: "textStyle.color",
                  keyframes: [
                    { t: 0, value: "#ffffff" },
                    { t: 1, value: "#000000" }
                  ]
                }
              ]
            }
          }
        ],
        transitionIn: { id: "t1", type: "dissolve", durationMs: 300 }
      })
    ]);
    expect(warnings(wide).map((w) => w.code)).not.toContain(
      "showcase_motion_range_narrow"
    );
  });

  it("warns on a frozen timer and a ticker whose window misses the clip's visible span", () => {
    const scene = clip("scene", {
      mediaType: "group",
      shapeStyle: undefined,
      animations: [custom]
    });
    const frozenTimer = document([
      scene,
      clip("timer", {
        parentId: "scene",
        mediaType: "text",
        shapeStyle: undefined,
        durationMs: 3000,
        textStyle: { text: "25:00", fontSizePx: 120, color: "#ffffff" }
      })
    ]);
    expect(warnings(frozenTimer).map((w) => w.code)).toContain(
      "showcase_dead_motion"
    );

    const tickingTimer = document([
      scene,
      clip("timer", {
        parentId: "scene",
        mediaType: "text",
        shapeStyle: undefined,
        durationMs: 3000,
        textStyle: { text: "25:00", fontSizePx: 120, color: "#ffffff" },
        animations: [
          {
            id: "count",
            role: "in",
            preset: "custom",
            durationMs: 2800,
            delayMs: 0,
            textAnimator: { kind: "ticker", from: 0, to: 25 }
          }
        ]
      })
    ]);
    expect(warnings(tickingTimer).map((w) => w.code)).not.toContain(
      "showcase_dead_motion"
    );

    const lateTicker = document([
      scene,
      clip("counter", {
        parentId: "scene",
        mediaType: "text",
        shapeStyle: undefined,
        durationMs: 3000,
        textStyle: { text: "47", fontSizePx: 120, color: "#ffffff" },
        animations: [
          {
            id: "count",
            role: "in",
            preset: "custom",
            durationMs: 200,
            delayMs: 2900,
            textAnimator: { kind: "ticker", from: 0, to: 47 }
          }
        ]
      })
    ]);
    expect(warnings(lateTicker).map((w) => w.code)).toContain(
      "showcase_dead_motion"
    );
  });
});
