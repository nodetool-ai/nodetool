import { fireEvent, render, screen } from "@testing-library/react";
import { jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import {
  ANIMATED_PROPERTIES,
  normalizeCustomCurves,
  type CustomClipAnimation
} from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipCustomCurves } from "../ClipCustomCurves";

const renderCurves = (
  custom: CustomClipAnimation,
  onChange: (next: CustomClipAnimation) => void = jest.fn()
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipCustomCurves
        custom={custom}
        labelPrefix="Animation 1"
        sourceAnchored={false}
        onChange={onChange}
      />
    </ThemeProvider>
  );

const ramp = [
  { t: 0, value: 0 },
  { t: 1, value: 1 }
];

describe("ClipCustomCurves", () => {
  it("adds a curve for a property no other curve drives", () => {
    const onChange = jest.fn<(next: CustomClipAnimation) => void>();
    renderCurves({ curves: [{ property: "opacity", keyframes: ramp }] }, onChange);

    fireEvent.click(screen.getByRole("button", { name: "Add curve" }));

    const next = onChange.mock.calls[0][0];
    expect(next.curves).toHaveLength(2);
    expect(next.curves[1].property).not.toBe("opacity");
    expect(normalizeCustomCurves(next.curves).ok).toBe(true);
  });

  it("disables Add curve once every property has a curve", () => {
    renderCurves({
      curves: ANIMATED_PROPERTIES.map((property) => ({
        property,
        keyframes: ramp
      }))
    });

    expect(screen.getByRole("button", { name: "Add curve" })).toBeDisabled();
  });

  it("keeps a curve's last keyframe", () => {
    renderCurves({
      curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }] }]
    });

    expect(
      screen.getByRole("button", {
        name: "Remove Animation 1 curve 1 keyframe 1"
      })
    ).toBeDisabled();
  });

  it("shows why the curves are rejected", () => {
    renderCurves({
      curves: [
        { property: "opacity", keyframes: ramp },
        { property: "opacity", keyframes: ramp }
      ]
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /one curve per property/
    );
  });
});
