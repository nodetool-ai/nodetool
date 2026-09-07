/**
 * BakedCurvePreview — the polyline geometry and what it renders.
 *
 * The scaling is the whole component: a curve whose values run 1 … 1.15 and
 * one that runs -20 … 20 have to fill the same box, and a flat curve has to
 * draw a line rather than divide by a zero span.
 */

import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";

import {
  BakedCurvePreview,
  bakedCurvePolyline
} from "../BakedCurvePreview";

const points = (pairs: [number, number][]) =>
  pairs.map(([timeMs, value]) => ({ timeMs, value }));

describe("bakedCurvePolyline", () => {
  it("returns nothing for an empty curve", () => {
    expect(bakedCurvePolyline([])).toBe("");
  });

  it("scales time across and value up, with the loud end at the top", () => {
    const polyline = bakedCurvePolyline(
      points([
        [0, 1],
        [500, 1.15],
        [1000, 1]
      ])
    );

    // x: 0 … 100 across the measured span. y: 32 at the quiet end, 0 at the
    // loud one, because SVG y grows downward.
    expect(polyline).toBe("0.00,32.00 50.00,0.00 100.00,32.00");
  });

  it("puts a flat curve down the middle instead of dividing by zero", () => {
    expect(
      bakedCurvePolyline(
        points([
          [0, 0.8],
          [1000, 0.8]
        ])
      )
    ).toBe("0.00,16.00 100.00,16.00");
  });

  it("draws a single keyframe as a level line", () => {
    expect(bakedCurvePolyline(points([[250, 3]]))).toBe("0,16 100,16");
  });

  it("scales a range that spans zero the same way", () => {
    const polyline = bakedCurvePolyline(
      points([
        [0, -20],
        [100, 0],
        [200, 20]
      ])
    );
    expect(polyline).toBe("0.00,32.00 50.00,16.00 100.00,0.00");
  });
});

describe("<BakedCurvePreview />", () => {
  it("renders the curve with its keyframe count and its value range", () => {
    render(
      <BakedCurvePreview
        label="Scale from audio"
        points={points([
          [0, 1],
          [500, 1.15],
          [1000, 1]
        ])}
      />
    );

    const svg = screen.getByRole("img", {
      name: "Scale from audio curve, 3 keyframes"
    });
    expect(svg.querySelector("polyline")?.getAttribute("points")).toBe(
      "0.00,32.00 50.00,0.00 100.00,32.00"
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("1.15")).toBeInTheDocument();
  });

  it("renders nothing when there is no curve", () => {
    const { container } = render(
      <BakedCurvePreview label="Scale from audio" points={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
