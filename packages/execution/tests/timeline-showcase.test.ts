import { parseClipEffectType } from "@nodetool-ai/timeline";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
    expect(median(rows.map((r) => r.groups))).toBe(22);
    expect(median(rows.map((r) => r.custom))).toBeCloseTo(103 / 23);
    expect(median(rows.map((r) => r.effects))).toBe(7);
    expect(median(rows.map((r) => r.clips))).toBeCloseTo(140 / 15);
  });
  it("actually inspects shipped showcases", () =>
    expect(examples.length).toBeGreaterThan(0));
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
