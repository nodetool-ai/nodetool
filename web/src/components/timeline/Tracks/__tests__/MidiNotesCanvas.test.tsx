/**
 * O6: a midi clip draws one controller curve over its note lines.
 */

import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { MidiControllerLane } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { MidiNotesCanvas } from "../MidiNotesCanvas";
import { controllerCurveVertices, curveLane } from "../midiCurve";

const lane = (
  id: string,
  points: Array<[number, number]>,
  extra: Partial<MidiControllerLane> = {}
): MidiControllerLane => ({
  id,
  kind: "cc",
  cc: 7,
  points: points.map(([tick, value], i) => ({ id: `${id}${i}`, tick, value })),
  ...extra
});

// 120 BPM: 960 ticks = 500 ms. A 4000 ms window drawn 400 px wide is 0.1 px/ms.
const SPEC = { inPointMs: 0, durationMs: 4000, bpm: 120, widthPx: 400, heightPx: 32 };

describe("controllerCurveVertices", () => {
  it("draws a step lane as horizontal then vertical segments", () => {
    const vertices = controllerCurveVertices(
      lane("s", [[0, 0], [960, 127]], { interpolation: "step" }),
      SPEC
    );
    expect(vertices).toEqual([
      { x: 0, y: 31 },
      { x: 50, y: 31 },
      { x: 50, y: 1 },
      { x: 400, y: 1 }
    ]);
  });

  it("draws a linear lane as straight segments and holds the last value", () => {
    const vertices = controllerCurveVertices(lane("l", [[0, 0], [960, 127]]), SPEC);
    expect(vertices).toEqual([
      { x: 0, y: 31 },
      { x: 50, y: 1 },
      { x: 400, y: 1 }
    ]);
  });

  it("starts at the first point and draws nothing before it", () => {
    const vertices = controllerCurveVertices(lane("l", [[1920, 127], [2880, 0]]), SPEC);
    expect(vertices?.[0]).toEqual({ x: 100, y: 1 });
  });

  it("maps pitch bend over its signed range", () => {
    const vertices = controllerCurveVertices(
      lane("p", [[0, 0]], { kind: "pitchBend", cc: undefined }),
      SPEC
    );
    // 0 sits just under the middle of -8192..8191.
    expect(vertices?.[0]?.y).toBeCloseTo(1 + (1 - 8192 / 16383) * 30, 5);
  });

  it("respects the trim window", () => {
    const vertices = controllerCurveVertices(lane("l", [[0, 0], [1920, 127]]), {
      ...SPEC,
      inPointMs: 500,
      durationMs: 1000,
      widthPx: 100
    });
    // At the window start (960 ticks) the linear lane is halfway: round(63.5) = 64.
    expect(vertices?.[0]?.x).toBe(0);
    expect(vertices?.[0]?.y).toBeCloseTo(1 + (1 - 64 / 127) * 30, 5);
  });

  it("returns null for an empty lane list", () => {
    expect(controllerCurveVertices(curveLane([lane("e", [])]), SPEC)).toBeNull();
  });
});

describe("curveLane", () => {
  it("takes the first lane in list order that has a point", () => {
    const lanes = [lane("a", []), lane("b", [[0, 5]]), lane("c", [[0, 9]], { cc: 10 })];
    expect(curveLane(lanes)?.id).toBe("b");
  });
});

describe("MidiNotesCanvas curve", () => {
  const calls: Array<[string, ...number[]]> = [];
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    calls.length = 0;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const ctx = {
      scale: jest.fn(),
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
      lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
      stroke: () => calls.push(["stroke"]),
      globalAlpha: 1,
      lineWidth: 0
    };
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx) as never;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  const draw = (controllers: MidiControllerLane[]) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <MidiNotesCanvas
          notes={[]}
          controllers={controllers}
          inPointMs={0}
          durationMs={4000}
          bpm={120}
          widthPx={400}
          color="#3d68a8"
        />
      </ThemeProvider>
    );

  it("strokes a step curve with horizontal and vertical segments", () => {
    draw([lane("s", [[0, 0], [960, 127]], { interpolation: "step" })]);
    expect(calls.filter((c) => c[0] === "stroke")).toHaveLength(1);
    const lines = calls.filter((c) => c[0] === "lineTo");
    expect(lines).toHaveLength(3);
    // The first segment is horizontal and the second is vertical.
    expect(lines[0]![2]).toBe(31);
    expect(lines[1]![1]).toBe(50);
  });

  it("strokes a linear curve with a slanted segment", () => {
    draw([lane("l", [[0, 0], [960, 127]])]);
    const lines = calls.filter((c) => c[0] === "lineTo");
    expect(lines).toEqual([
      ["lineTo", 50, 1],
      ["lineTo", 400, 1]
    ]);
  });

  it("draws no curve for a clip without controller points", () => {
    draw([]);
    expect(calls.filter((c) => c[0] === "stroke")).toHaveLength(0);
  });
});
