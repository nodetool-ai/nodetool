/**
 * F25: a pattern region draws its loop repeats dimmed, mutes rows that solo
 * leaves out, draws tied followers as on, and redraws when the track height
 * changes.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow } from "@nodetool-ai/timeline";

import { PatternRegionCanvas } from "../PatternRegionCanvas";

interface Rect { x: number; y: number; w: number; alpha: number }

let rects: Rect[] = [];
let roCallback: ResizeObserverCallback | null = null;

beforeEach(() => {
  rects = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    scale: jest.fn(),
    clearRect: jest.fn(),
    fillRect(x: number, y: number, w: number) {
      rects.push({ x, y, w, alpha: this.globalAlpha });
    }
  };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      roCallback = cb;
    }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => jest.restoreAllMocks());

const pattern = (rows: Array<Partial<StepRow> & Pick<StepRow, "id" | "assignment">>): StepPattern =>
  normalizePattern({ lengthSteps: 16, rows: rows as StepRow[] });
const allOn = (n: number) => Array.from({ length: n }, () => ({ on: true }));

// 120 BPM: a 1/16 step is 125 ms. 2000 ms over 160 px is 10 px per step.
const BASE = { durationMs: 2000, inPointMs: 0, bpm: 120, widthPx: 160, color: "#88aaff" };

it("dims the loop repeats of a looped region", () => {
  const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, lengthSteps: 5, steps: allOn(5) }]);
  render(<PatternRegionCanvas {...BASE} pattern={p} loopLengthMs={375} />);
  const first = rects.filter((r) => r.x < 30);
  const repeats = rects.filter((r) => r.x >= 30);
  expect(first).toHaveLength(3);
  expect(repeats.length).toBe(13);
  expect(Math.max(...repeats.map((r) => r.alpha))).toBeLessThan(Math.min(...first.map((r) => r.alpha)));
});

it("dims rows that solo leaves out and draws tied followers as on", () => {
  const p = pattern([
    { id: "a", assignment: { type: "note", pitch: 36 }, solo: true, steps: [{ on: true }, { tie: true }] },
    { id: "b", assignment: { type: "note", pitch: 38 }, steps: allOn(16) }
  ]);
  render(<PatternRegionCanvas {...BASE} pattern={p} />);
  const ys = [...new Set(rects.map((r) => r.y))].sort((m, n) => m - n);
  const rowA = rects.filter((r) => r.y === ys[0]);
  const rowB = rects.filter((r) => r.y === ys[1]);
  expect(rowA[1]!.alpha).toBe(rowA[0]!.alpha);
  expect(Math.max(...rowB.map((r) => r.alpha))).toBeLessThan(rowA[0]!.alpha);
});

it("redraws at the new height when the track is resized", () => {
  const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, steps: allOn(16) }]);
  render(<PatternRegionCanvas {...BASE} pattern={p} />);
  const canvas = screen.getByTestId("pattern-region-canvas") as HTMLCanvasElement;
  expect(roCallback).not.toBeNull();
  Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 90 });
  act(() => roCallback!([], {} as ResizeObserver));
  expect(canvas.height).toBe(90 * (window.devicePixelRatio || 1));
});

it("draws on steps bright and off steps faint, one band per row (F42)", () => {
  const p = pattern([
    { id: "a", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { on: false }] },
    { id: "b", assignment: { type: "note", pitch: 38 }, steps: [{ on: false }, { on: true }] }
  ]);
  render(<PatternRegionCanvas {...BASE} pattern={p} />);
  const ys = [...new Set(rects.map((r) => r.y))].sort((m, n) => m - n);
  expect(ys).toHaveLength(2);
  const at = (y: number, x: number) => rects.find((r) => r.y === y && Math.round(r.x) === x)!;
  expect(at(ys[0]!, 0).alpha).toBeGreaterThan(at(ys[0]!, 10).alpha);
  expect(at(ys[1]!, 10).alpha).toBeGreaterThan(at(ys[1]!, 0).alpha);
});

it("draws a 1/8 row with cells twice as wide (F42)", () => {
  const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, stepRate: "1/8", steps: allOn(16) }]);
  render(<PatternRegionCanvas {...BASE} pattern={p} />);
  expect(rects).toHaveLength(8);
  expect(Math.round(rects[1]!.x)).toBe(20);
  expect(Math.round(rects[0]!.w)).toBe(19);
});

it("starts at the region in point (F42)", () => {
  const p = pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, steps: [{ on: false }, { on: false }, { on: true }] }]);
  render(<PatternRegionCanvas {...BASE} pattern={p} durationMs={1750} widthPx={140} inPointMs={250} />);
  const first = rects.find((r) => Math.round(r.x) === 0)!;
  const second = rects.find((r) => Math.round(r.x) === 10)!;
  expect(first.alpha).toBeGreaterThan(second.alpha);
});

it("draws nothing for an empty pattern or a zero-length region (F42)", () => {
  render(<PatternRegionCanvas {...BASE} pattern={pattern([])} />);
  render(<PatternRegionCanvas {...BASE} durationMs={0} pattern={pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, steps: allOn(16) }])} />);
  expect(rects).toHaveLength(0);
});

it("redraws when a step changes (F42)", () => {
  const off = pattern([{ id: "a", assignment: { type: "note", pitch: 36 } }]);
  const { rerender } = render(<PatternRegionCanvas {...BASE} pattern={off} />);
  const faint = rects[0]!.alpha;
  rects = [];
  rerender(<PatternRegionCanvas {...BASE} pattern={pattern([{ id: "a", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] }])} />);
  expect(rects[0]!.alpha).toBeGreaterThan(faint);
});
