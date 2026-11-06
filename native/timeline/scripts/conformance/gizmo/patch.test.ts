import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { makeClip, setKeyframes, type ClipTransform, type TimelineClip } from "@nodetool-ai/timeline";
import { gizmoTransformPatch } from "../../../../../web/src/components/timeline/Inspector/keyframeRows";

it("matches the web gizmoTransformPatch including easing, zero scales, and raw animation metadata", () => {
  let seed = 79;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const requests: { clip: TimelineClip; next: ClipTransform; atMs: number | null }[] = [];
  for (let i = 0; i < 600; i += 1) {
    let clip = makeClip({ id: "picture", trackId: "v", mediaType: "image", startMs: 100, durationMs: 2000 });
    clip = {
      ...clip,
      transform: {
        position: { x: random() * 200, y: random() * 100 },
        scale: { x: i % 7 === 0 ? 0 : random() * 3 - 1, y: i % 11 === 0 ? 0 : random() * 3 - 1 },
        rotation: random() * 2,
        anchor: { x: random(), y: random() },
        rotationX: 10,
        depthPx: 5
      }
    };
    const properties = ["offsetX", "offsetY", "scale", "rotation"] as const;
    for (const [index, property] of properties.entries()) {
      if ((i & (1 << index)) === 0) { continue; }
      for (const atMs of [0, 1000, 2000]) {
        clip = { ...clip, animations: setKeyframes(clip, [{ property, value: random() * 10 }], atMs) };
      }
    }
    if (clip.animations) {
      clip.animations = clip.animations.map(a => ({ ...a, easing: i % 3 === 0 ? "easeInQuad" : undefined }));
    }
    const next: ClipTransform = {
      ...clip.transform!,
      position: { x: random() * 300 - 100, y: random() * 200 - 50 },
      scale: { x: random() * 4 - 2, y: random() * 4 - 2 },
      rotation: random() * 6 - 3,
      anchor: { x: random(), y: random() }
    };
    requests.push({ clip, next, atMs: i % 13 === 0 ? null : [0, 0.01, 500, 999.99, 1000, 1500, 2000][i % 7] });
  }
  const bin = process.env.NT_GIZMO_ORACLE;
  if (!bin) { throw new Error("NT_GIZMO_ORACLE must name the native binary"); }
  const actual: unknown[] = [];
  for (let i = 0; i < requests.length; i += 16) {
    actual.push(...JSON.parse(execFileSync(bin, [], {
      input: JSON.stringify(requests.slice(i, i + 16)), encoding: "utf8", timeout: 10000
    })));
  }
  expect(actual).toHaveLength(requests.length);
  requests.forEach((request, index) => {
    const expected = JSON.parse(JSON.stringify(gizmoTransformPatch(request.clip, request.next, request.atMs)));
    expect(actual[index], `case ${index}`).toEqual(expected);
  });
});
