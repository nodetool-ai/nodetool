import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { ClipTransform } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import { TransformGizmoOverlay } from "../TransformGizmoOverlay";

// jsdom ships no PointerEvent, so testing-library would otherwise drop
// clientX/clientY. Back it with MouseEvent (which carries the coords) and a
// no-op pointer-capture API on SVG elements.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 0;
  }
}
// @ts-expect-error — augmenting the jsdom global for tests.
window.PointerEvent = FakePointerEvent;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

// Square source on a 2:1 canvas/frame. containBaseScale → {x:0.5, y:1}, so the
// identity box spans x 50..150, y 0..100 with center (100,50).
const baseProps = {
  clipId: "clip-1",
  transform: undefined as ClipTransform | undefined,
  sourceWidth: 100,
  sourceHeight: 100,
  canvasWidth: 200,
  canvasHeight: 100,
  frameWidth: 200,
  frameHeight: 100
};

describe("TransformGizmoOverlay", () => {
  it("renders the gizmo box for a visible selected clip", () => {
    const { getByTestId, container } = render(
      <TransformGizmoOverlay {...baseProps} onChange={() => {}} />
    );
    expect(getByTestId("timeline-transform-gizmo")).toBeInTheDocument();
    const polygon = container.querySelector("polygon");
    expect(polygon?.getAttribute("points")).toBe("50,0 150,0 150,100 50,100");
  });

  it("returns null when source dimensions are unknown", () => {
    const { container } = render(
      <TransformGizmoOverlay
        {...baseProps}
        sourceWidth={0}
        sourceHeight={0}
        onChange={() => {}}
      />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("translates a body drag into a position change", () => {
    const onChange = jest.fn();
    const { container, getByTestId } = render(
      <TransformGizmoOverlay {...baseProps} onChange={onChange} />
    );
    const polygon = container.querySelector("polygon")!;
    const svg = getByTestId("timeline-transform-gizmo");

    fireEvent.pointerDown(polygon, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 130, clientY: 70, pointerId: 1 });

    expect(onChange).toHaveBeenCalled();
    const [, next] = onChange.mock.calls.at(-1)!;
    // canvas/frame are equal so 1 CSS px == 1 position px here.
    expect(next.position.x).toBeCloseTo(30, 3);
    expect(next.position.y).toBeCloseTo(20, 3);
  });

  it("scales toward a corner when a corner handle is dragged", () => {
    const onChange = jest.fn();
    const { container, getByTestId } = render(
      <TransformGizmoOverlay {...baseProps} onChange={onChange} />
    );
    const svg = getByTestId("timeline-transform-gizmo");
    // The bottom-right handle sits at (150,100); the fixed corner is (50,0).
    const rects = Array.from(container.querySelectorAll("rect"));
    const br = rects.find(
      (r) =>
        Number(r.getAttribute("x")) + 4 === 150 &&
        Number(r.getAttribute("y")) + 4 === 100
    )!;
    expect(br).toBeTruthy();

    fireEvent.pointerDown(br, { clientX: 150, clientY: 100, pointerId: 2 });
    // Drag the corner halfway back toward the fixed corner → ~0.5 scale.
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 50, pointerId: 2 });

    expect(onChange).toHaveBeenCalled();
    const [, next] = onChange.mock.calls.at(-1)!;
    expect(next.scale.x).toBeCloseTo(0.5, 2);
    expect(next.scale.y).toBeCloseTo(0.5, 2);
  });

  it("rotates around the pivot without moving it", () => {
    const onChange = jest.fn();
    const { container, getByTestId } = render(
      <TransformGizmoOverlay {...baseProps} onChange={onChange} />
    );
    const svg = getByTestId("timeline-transform-gizmo");
    // Rotation handle is the circle sitting above the top edge midpoint
    // (100,0); pivot/center is (100,50).
    const circle = Array.from(container.querySelectorAll("circle")).find(
      (c) => Math.abs(Number(c.getAttribute("cx")) - 100) < 0.001
    )!;
    fireEvent.pointerDown(circle, { clientX: 100, clientY: -24, pointerId: 3 });
    // Swing 90° around the center: from straight up to pointing right.
    fireEvent.pointerMove(svg, { clientX: 150, clientY: 50, pointerId: 3 });

    const [, next] = onChange.mock.calls.at(-1)!;
    expect(Math.abs(next.rotation)).toBeCloseTo(Math.PI / 2, 2);
    // Pivot/position is untouched — rotation pivots around the anchor.
    expect(next.position.x).toBeCloseTo(0, 6);
    expect(next.position.y).toBeCloseTo(0, 6);
  });

  it("moves the anchor on a pivot drag, snapping to the corner", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TransformGizmoOverlay {...baseProps} onChange={onChange} />
    );
    const svg = getByTestId("timeline-transform-gizmo");
    const pivot = getByTestId("timeline-transform-pivot");
    fireEvent.pointerDown(pivot, { clientX: 100, clientY: 50, pointerId: 4 });
    // Drag toward the top-left corner (50,0) → anchor (0,1).
    fireEvent.pointerMove(svg, { clientX: 52, clientY: 2, pointerId: 4 });

    const [, next] = onChange.mock.calls.at(-1)!;
    expect(next.anchor.x).toBeCloseTo(0, 3);
    expect(next.anchor.y).toBeCloseTo(1, 3);
  });

  it("nudges with arrow keys and resets with '.'", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <TransformGizmoOverlay
        {...baseProps}
        transform={{
          position: { x: 5, y: 5 },
          scale: { x: 2, y: 2 },
          rotation: 1,
          anchor: { x: 0.5, y: 0.5 }
        }}
        onChange={onChange}
      />
    );
    const svg = getByTestId("timeline-transform-gizmo");

    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onChange.mock.calls.at(-1)![1].position.x).toBeCloseTo(6, 6);

    fireEvent.keyDown(svg, { key: "ArrowUp", shiftKey: true });
    expect(onChange.mock.calls.at(-1)![1].position.y).toBeCloseTo(-5, 6);

    fireEvent.keyDown(svg, { key: "." });
    const reset = onChange.mock.calls.at(-1)![1];
    expect(reset).toEqual({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    });
  });

  it("opens a context menu whose flip action negates scale", () => {
    const onChange = jest.fn();
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <TransformGizmoOverlay {...baseProps} onChange={onChange} />
      </ThemeProvider>
    );
    const polygon = container.querySelector("polygon")!;
    fireEvent.contextMenu(polygon, { clientX: 100, clientY: 50 });

    fireEvent.click(screen.getByText("Flip Horizontal"));
    const [, next] = onChange.mock.calls.at(-1)!;
    expect(next.scale.x).toBeCloseTo(-1, 6);
    expect(next.scale.y).toBeCloseTo(1, 6);
  });
});
