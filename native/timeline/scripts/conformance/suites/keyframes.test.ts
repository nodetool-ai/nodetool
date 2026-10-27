import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { ANIMATION_PRESETS } from "../../../../../packages/timeline/src/animation/presets";
import type { TimelineClip } from "../../../../../packages/timeline/src/types";
import * as keys from "../../../../../packages/timeline/src/keyframes";
import * as rows from "../../../../../web/src/components/timeline/Inspector/keyframeRows";

// Generated animation IDs are nondeterministic in both implementations.
// Replace only generated IDs. JSON represents negative zero as zero.
// Every other field and number compares exactly.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === "id" &&
        typeof child === "string" &&
        /^[0-9a-f]{32}$/.test(child) &&
        Reflect.get(value, "preset") === "custom"
          ? "<generated>"
          : stable(child)
      ])
    );
  }
  return value === undefined ? null : Object.is(value, -0) ? 0 : value;
}
const rowSpecs = [
  rows.OPACITY_ROW,
  rows.POSITION_ROW,
  rows.SCALE_ROW,
  rows.ROTATION_ROW,
  rows.CAMERA_ORBIT_ROW,
  rows.CAMERA_FOV_ROW,
  rows.CAMERA_ZOOM_ROW
];
let seed = 142857;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const clips = [-100, 0, 1, 1000, 2000, 100000].flatMap((durationMs) =>
  [0, 1, 2].map((base) => ({
    id: "c",
    trackId: "v",
    name: "Picture",
    mediaType: "image" as const,
    sourceType: "imported" as const,
    status: "generated" as const,
    locked: false,
    versions: [],
    startMs: 123,
    durationMs,
    opacity: base,
    transform: {
      position: { x: base, y: -base },
      scale: { x: base, y: 2 },
      rotation: base,
      anchor: { x: 0.5, y: 0.5 }
    }
  }))
);
const requests: [string, unknown[]][] = [];
const expected: unknown[] = [];
function compare(name: string, args: unknown[], result: unknown) {
  requests.push([name, args]);
  expected.push(stable(result));
}
for (const source of clips) {
  for (let iteration = 0; iteration < 8; iteration++) {
    let clip: TimelineClip = source;
    if (iteration > 0) {
      const entries = keys.KEYFRAME_PROPERTIES.map((property) => ({
        property,
        value: random() * 4
      }));
      clip = { ...source, animations: keys.setKeyframes(source, entries, 0) };
      const initialAnimation = clip.animations?.[0];
      if (initialAnimation) initialAnimation.id = `existing-${iteration}`;
      clip = {
        ...clip,
        animations: keys.setKeyframes(
          clip,
          entries.map((e) => ({ ...e, value: random() * 3 })),
          source.durationMs
        )
      };
      const keyedAnimation = clip.animations?.[0];
      if (keyedAnimation && iteration % 2)
        keyedAnimation.easing = [
          "linear",
          "easeIn",
          "easeOut",
          "easeInOut",
          "hold"
        ][iteration % 5];
    }
    const at = [
      -1,
      0,
      0.1,
      source.durationMs / 3,
      source.durationMs,
      source.durationMs + 1
    ][iteration % 6];
    const properties = ["offsetX", "offsetY", "opacity"] as const;
    for (const property of keys.KEYFRAME_PROPERTIES) {
      compare("keyframeIdentity", [property], keys.keyframeIdentity(property));
      compare("keyframeRowFor", [property], rows.keyframeRowFor(property)?.id);
      compare(
        "isPropertyKeyframed",
        [clip, property],
        keys.isPropertyKeyframed(clip, property)
      );
      compare(
        "keyframeValueAt",
        [clip, property, at],
        keys.keyframeValueAt(clip, property, at)
      );
      compare(
        "hasKeyframeAt",
        [clip, property, at],
        keys.hasKeyframeAt(clip, property, at)
      );
      compare(
        "keyframeEasingAt",
        [clip, property, at],
        keys.keyframeEasingAt(clip, property, at)
      );
      compare(
        "setKeyframe",
        [clip, property, at, 2],
        keys.setKeyframe(clip, property, at, 2)
      );
      compare(
        "removeKeyframe",
        [clip, property, at],
        keys.removeKeyframe(clip, property, at)
      );
      compare(
        "composeKeyframeValue",
        [property, 2, 3],
        keys.composeKeyframeValue(property, 2, 3)
      );
      compare(
        "keyframeValueForComposed",
        [property, iteration % 2, 3],
        keys.keyframeValueForComposed(property, iteration % 2, 3)
      );
    }
    compare("keyframeTimesMs", [clip], keys.keyframeTimesMs(clip));
    compare(
      "moveKeyframes",
      [clip, properties, 0, at],
      keys.moveKeyframes(clip, properties, 0, at)
    );
    compare(
      "setKeyframeEasing",
      [clip, properties, 0, "hold"],
      keys.setKeyframeEasing(clip, properties, 0, "hold")
    );
    compare(
      "clearKeyframes",
      [clip, properties],
      keys.clearKeyframes(clip, properties)
    );
    compare(
      "removeKeyframes",
      [clip, properties, at],
      keys.removeKeyframes(clip, properties, at)
    );
    for (const direction of [-1, 1] as const)
      compare(
        "adjacentKeyframeMs",
        [clip, properties, at, direction],
        keys.adjacentKeyframeMs(clip, properties, at, direction)
      );
    for (const row of rowSpecs) {
      compare("rowProperties", [row.id], rows.rowProperties(row));
      compare("isRowKeyframed", [clip, row.id], rows.isRowKeyframed(clip, row));
      compare(
        "rowHasKeyframeAt",
        [clip, row.id, at],
        rows.rowHasKeyframeAt(clip, row, at)
      );
      compare(
        "rowKeyframeTimesMs",
        [clip, row.id],
        rows.rowKeyframeTimesMs(clip, row)
      );
      for (const time of [null, at]) {
        compare(
          "toggleRowStopwatch",
          [clip, row.id, time],
          rows.toggleRowStopwatch(clip, row, time)
        );
        compare(
          "toggleRowKeyframeAt",
          [clip, row.id, time],
          rows.toggleRowKeyframeAt(clip, row, time)
        );
        row.inputs.forEach((input, index) => {
          compare(
            "inputValueAt",
            [clip, row.id, index, at],
            rows.inputValueAt(clip, input, at)
          );
          compare(
            "commitInputValue",
            [clip, row.id, index, iteration - 1, time],
            rows.commitInputValue(clip, row, input, iteration - 1, time)
          );
        });
      }
    }
    compare(
      "gizmoTransformPatch",
      [clip, source.transform, at],
      rows.gizmoTransformPatch(clip, source.transform, at)
    );
  }
}
// Arbitrary stored curve ordering, normalized-time tolerance, mixed presets,
// animation metadata and per-segment easing survive each mutation.
for (const easing of [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "hold",
  "easeOutBack",
  "easeOutElastic",
  "easeOutBounce",
  "cubic-bezier(0.2,0.5,0.8,1)",
  "spring(100,10,1)",
  "future-easing"
]) {
  const clip: TimelineClip = {
    ...clips[9],
    durationMs: 10000,
    animations: [
      {
        id: "other",
        role: "in",
        preset: "fade",
        durationMs: 100,
        enabled: false
      },
      {
        id: "existing-custom",
        role: "emphasis",
        preset: "custom",
        durationMs: 10000,
        delayMs: 0,
        params: { keyframed: true },
        easing,
        custom: {
          curves: [
            {
              property: "offsetX",
              keyframes: [
                { t: 1, value: 8, easing: "easeOut" },
                { t: 0, value: -2 },
                { t: 0.0001, value: 3, easing: "hold" },
                { t: 0.5, value: 5, easing: "easeIn" }
              ]
            },
            {
              property: "opacity",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 1, easing: "easeInOut" }
              ]
            }
          ]
        }
      }
    ]
  };
  compare("findKeyframeAnimation", [clip], keys.findKeyframeAnimation(clip));
  compare("keyframePropertiesFor", [clip], keys.keyframePropertiesFor(clip));
  compare(
    "keyframePropertiesFor",
    [{ mediaType: "model3d" }],
    keys.keyframePropertiesFor({ mediaType: "model3d" })
  );
  compare("keyframeTimesMs", [clip, []], keys.keyframeTimesMs(clip, []));
  for (const at of [
    -1, 0, 0.5, 0.9999, 1, 1.0001, 3210, 5000, 9999, 10000, 11000
  ]) {
    compare(
      "keyframeValueAt",
      [clip, "offsetX", at],
      keys.keyframeValueAt(clip, "offsetX", at)
    );
    compare(
      "hasKeyframeAt",
      [clip, "offsetX", at],
      keys.hasKeyframeAt(clip, "offsetX", at)
    );
    compare(
      "setKeyframeEasing",
      [clip, ["offsetX"], at, "hold"],
      keys.setKeyframeEasing(clip, ["offsetX"], at, "hold")
    );
    compare(
      "moveKeyframes",
      [clip, ["offsetX"], at, 5000],
      keys.moveKeyframes(clip, ["offsetX"], at, 5000)
    );
    compare(
      "setKeyframe",
      [clip, "offsetX", at, 4],
      keys.setKeyframe(clip, "offsetX", at, 4)
    );
  }
}
const largeClip: TimelineClip = {
  ...clips[9],
  durationMs: 31999,
  animations: [
    {
      id: "large",
      preset: "custom",
      role: "emphasis",
      durationMs: 31999,
      params: { keyframed: true },
      custom: {
        curves: [
          {
            property: "offsetX",
            keyframes: Array.from({ length: 32000 }, (_, i) => ({
              t: i / 31999,
              value: i
            }))
          }
        ]
      }
    }
  ]
};
compare("keyframeTimesMs", [largeClip], keys.keyframeTimesMs(largeClip));
compare(
  "moveKeyframes",
  [largeClip, ["offsetX"], 0, 30000],
  keys.moveKeyframes(largeClip, ["offsetX"], 0, 30000)
);
it("compares random and edge-case keyframe helpers and every inspector row exactly", () => {
  const binary = process.env.NT_KEYFRAME_HELPERS;
  if (!binary) throw new Error("NT_KEYFRAME_HELPERS is required");
  const actual: unknown[] = JSON.parse(
    execFileSync(binary, ["--helpers"], {
      input: JSON.stringify(requests),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
      env: { ...process.env, QT_QPA_PLATFORM: "offscreen" }
    })
  );
  expect(actual.length).toBe(requests.length);
  actual.forEach((result, index) =>
    expect(
      stable(result),
      `${index}: ${requests[index][0]} ${JSON.stringify(requests[index][1])}`
    ).toEqual(expected[index])
  );
});

it("keeps the native animation preset descriptors equal to the web catalog", () => {
  const qml = readFileSync(
    new URL(
      "../../../qml/Inspector/MotionAnimationCatalog.qml",
      import.meta.url
    ),
    "utf8"
  );
  const json = qml
    .slice(qml.indexOf("presets:") + "presets:".length, qml.lastIndexOf("}"))
    .trim();
  expect(JSON.parse(json)).toEqual(
    JSON.parse(JSON.stringify(ANIMATION_PRESETS))
  );
});
