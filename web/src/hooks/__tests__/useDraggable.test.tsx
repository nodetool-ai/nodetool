import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { useDraggable } from "../useDraggable";

// Polyfill PointerEvent for jsdom (which doesn't support it natively).
// PointerEvent extends MouseEvent so clientX/clientY work correctly.
if (typeof window !== "undefined" && !window.PointerEvent) {
  (window as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  };
}

if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {
    /* noop – jsdom stub */
  };
  Element.prototype.releasePointerCapture = function () {
    /* noop – jsdom stub */
  };
}

const DraggableBox: React.FC<{ handle?: string }> = ({ handle }) => {
  const nodeRef = useDraggable<HTMLDivElement>({
    handle,
    defaultPosition: { x: 10, y: 20 }
  });
  return (
    <div ref={nodeRef} data-testid="node">
      <div className="handle" data-testid="handle" />
      <div className="body" data-testid="body" />
    </div>
  );
};

describe("useDraggable", () => {
  it("applies the default position as a translate transform", () => {
    const { getByTestId } = render(<DraggableBox handle=".handle" />);
    expect(getByTestId("node").style.transform).toBe("translate(10px, 20px)");
  });

  it("drags by the handle, updating the transform by the pointer delta", () => {
    const { getByTestId } = render(<DraggableBox handle=".handle" />);
    const node = getByTestId("node");
    const handle = getByTestId("handle");

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(node, { clientX: 130, clientY: 150, pointerId: 1 });
    expect(node.style.transform).toBe("translate(40px, 70px)");

    fireEvent.pointerUp(node, { clientX: 130, clientY: 150, pointerId: 1 });
    expect(node.style.transform).toBe("translate(40px, 70px)");
  });

  it("does not drag when the pointer goes down outside the handle", () => {
    const { getByTestId } = render(<DraggableBox handle=".handle" />);
    const node = getByTestId("node");
    const body = getByTestId("body");

    fireEvent.pointerDown(body, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(node, { clientX: 130, clientY: 150, pointerId: 1 });
    expect(node.style.transform).toBe("translate(10px, 20px)");
  });
});
