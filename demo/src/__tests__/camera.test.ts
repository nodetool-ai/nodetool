import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCameraKeys,
  buildShotCameraKeys,
  fitBoundsToViewport,
  resolveTargetBounds,
  shotAt,
  shotCameraAt,
  validateShots,
  type Rect,
} from "../camera";
import type { TutorialShot } from "../types";

const shots: readonly TutorialShot[] = [
  { id: "wide", fromMs: 0, toMs: 1000, target: { kind: "overview" }, moveMs: 0 },
  {
    id: "control",
    fromMs: 1000,
    toMs: 2500,
    target: { kind: "component", focusId: "prompt" },
    padding: 40,
    maxZoom: 2,
  },
];

test("fits tall and small subjects inside the safe picture area", () => {
  const tall = fitBoundsToViewport(
    { x: 100, y: 100, width: 200, height: 900 },
    { width: 1920, height: 1080 },
    { padding: 40, safeArea: { bottom: 200 } }
  );
  assert.ok(tall.zoom <= 880 / 900);

  const small = fitBoundsToViewport(
    { x: 100, y: 100, width: 20, height: 20 },
    { width: 1280, height: 720 },
    { maxZoom: 2.25 }
  );
  assert.equal(small.zoom, 2.25);
});

test("uses the largest region left by an overlay exclusion", () => {
  const viewport = fitBoundsToViewport(
    { x: 0, y: 0, width: 400, height: 200 },
    { width: 1920, height: 1080 },
    { safeArea: { exclusions: [{ x: 0, y: 800, width: 1920, height: 280 }] } }
  );
  assert.ok(viewport.y < 800);
  assert.throws(
    () => fitBoundsToViewport(
      { x: 0, y: 0, width: 20, height: 20 },
      { width: 100, height: 100 },
      { safeArea: { exclusions: [{ x: 0, y: 0, width: 100, height: 100 }] } }
    ),
    /no available picture area/
  );
});

test("resolves groups only when every real target resolves", () => {
  const registry = new Map<string, Rect>([
    ["a", { x: 10, y: 20, width: 30, height: 40 }],
    ["b", { x: 80, y: 100, width: 20, height: 10 }],
  ]);
  const resolver = (target: { kind: string; focusId?: string }) =>
    target.focusId ? registry.get(target.focusId) : undefined;
  const overview = { x: 0, y: 0, width: 1920, height: 1080 };
  const group = resolveTargetBounds(
    { kind: "group", targets: [
      { kind: "component", focusId: "a" },
      { kind: "component", focusId: "b" },
    ] },
    0,
    resolver,
    overview
  );
  assert.deepEqual(group, { x: 10, y: 20, width: 90, height: 90 });
  assert.equal(
    resolveTargetBounds(
      { kind: "group", targets: [
        { kind: "component", focusId: "a" },
        { kind: "component", focusId: "does-not-exist" },
      ] },
      0,
      resolver,
      overview
    ),
    undefined
  );
});

test("validates shot ordering and produces strictly ordered camera keys", () => {
  assert.deepEqual(validateShots(shots), []);
  assert.ok(validateShots([
    shots[0],
    { ...shots[1], id: "wide", fromMs: 500, anchorMs: 300, moveMs: Number.NaN },
  ]).length >= 3);
  const bounds = new Map<string, Rect>([
    ["wide", { x: 0, y: 0, width: 1920, height: 1080 }],
    ["control", { x: 600, y: 300, width: 200, height: 80 }],
  ]);
  const keys = buildShotCameraKeys(shots, bounds, { width: 1920, height: 1080 });
  assert.ok(keys.every((key, index) => index === 0 || key.t > keys[index - 1].t));
  assert.equal(shotAt(shots, 2500)?.id, "control");
  assert.deepEqual(shotCameraAt(keys, 1500), shotCameraAt(keys, 1500));
  assert.throws(() => buildShotCameraKeys(shots, new Map(), { width: 1920, height: 1080 }), /Missing bounds/);
});

test("direct and sequential sampling agree after backward seeks", () => {
  const bounds = new Map<string, Rect>([
    ["wide", { x: 0, y: 0, width: 1920, height: 1080 }],
    ["control", { x: 600, y: 300, width: 200, height: 80 }],
  ]);
  const fullKeys = buildShotCameraKeys(shots, bounds, { width: 1920, height: 1080 });
  const directKeys = buildShotCameraKeys(shots.slice(0, 2), bounds, {
    width: 1920,
    height: 1080,
  });
  const seekOrder = [1700, 2400, 1100, 2200, 1000];
  for (const timeMs of seekOrder) {
    assert.deepEqual(
      shotCameraAt(fullKeys, timeMs),
      shotCameraAt(directKeys, timeMs),
      `camera diverged at ${timeMs}ms`
    );
  }
});

test("legacy camera keys stay ordered for a replay shorter than the establish hold", () => {
  const keys = buildCameraKeys({}, [], 400);
  assert.ok(keys.every((key, index) => index === 0 || key.t > keys[index - 1].t));
  assert.equal(keys[keys.length - 1].t, 400);
});
