/**
 * Dragging a guide with the Move tool: a click leaves it in place, and a drag
 * keeps the offset between the pointer and the guide.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { SketchRulersAndGuides } from "../guides/SketchRulersAndGuides";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultDocument } from "../types";

const VIEWPORT = { width: 400, height: 400 };

beforeAll(() => {
  // jsdom has no PointerEvent, so fireEvent would drop clientX/clientY.
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
  // Doc 400×400 at zoom 1 and no pan fills the viewport, so doc = viewport.
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: VIEWPORT.width,
      bottom: VIEWPORT.height,
      ...VIEWPORT,
      toJSON: () => ({})
    } as DOMRect);
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.hasPointerCapture = jest.fn(() => true);
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  const store = useSketchStore.getState();
  store.setDocument(createDefaultDocument(400, 400));
  useSketchStore.setState({
    zoom: 1,
    pan: { x: 0, y: 0 },
    activeTool: "move",
    rulersVisible: false,
    guidesVisible: true,
    snapEnabled: false
  });
  useSketchStore.getState().addGuide("vertical", 200);
});

function renderGuides(): HTMLElement {
  render(
    <ThemeProvider theme={mockTheme}>
      <SketchRulersAndGuides />
    </ThemeProvider>
  );
  return screen.getByTestId("sketch-guide");
}

function guidePosition(): number | undefined {
  return useSketchStore.getState().document.guides?.[0]?.position;
}

describe("guide drag", () => {
  it("leaves the guide in place when it is clicked off-center", () => {
    const guide = renderGuides();
    fireEvent.pointerDown(guide, { button: 0, pointerId: 1, clientX: 203, clientY: 50 });
    fireEvent.pointerUp(guide, { button: 0, pointerId: 1, clientX: 203, clientY: 50 });
    expect(guidePosition()).toBe(200);
  });

  it("moves the guide by the pointer travel, not to the pointer", () => {
    const guide = renderGuides();
    fireEvent.pointerDown(guide, { button: 0, pointerId: 1, clientX: 203, clientY: 50 });
    fireEvent.pointerMove(guide, { pointerId: 1, clientX: 253, clientY: 50 });
    fireEvent.pointerUp(guide, { button: 0, pointerId: 1, clientX: 253, clientY: 50 });
    expect(guidePosition()).toBe(250);
  });
});
