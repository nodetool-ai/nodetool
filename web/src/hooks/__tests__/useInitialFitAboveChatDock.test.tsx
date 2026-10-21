/**
 * @jest-environment jsdom
 *
 * Study 4 C1-13: an example workflow opened at 100% from the origin, so after
 * the run the canvas chat bar covered the bottom of the Output preview at
 * 1440 × 900. A workflow that opens with nodes and no saved viewport is fitted
 * once into the area above the chat bar.
 */
import React from "react";
import { renderHook } from "@testing-library/react";

const fitView = jest.fn();
let nodesInitialized = true;
let flowState: { width: number; domNode: HTMLElement | null };

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ fitView }),
  useNodesInitialized: () => nodesInitialized,
  useStore: (selector: (s: typeof flowState) => unknown) => selector(flowState)
}));

import {
  chatDockFitPadding,
  useInitialFitAboveChatDock
} from "../useInitialFitAboveChatDock";

const rect = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect;

function mountDock(top: number, bottom: number): HTMLElement {
  const dock = document.createElement("div");
  dock.className = "canvas-chat-dock";
  dock.getBoundingClientRect = () => rect(top, bottom);
  document.body.appendChild(dock);
  return dock;
}

describe("chatDockFitPadding", () => {
  it("reserves the part of the canvas the chat bar covers", () => {
    expect(chatDockFitPadding(rect(40, 870), rect(660, 850))).toEqual({
      top: "24px",
      right: "24px",
      left: "24px",
      bottom: "234px"
    });
  });

  it("reserves the part of the canvas the open chat window covers", () => {
    const canvas = { bottom: 870, right: 1440 };
    expect(chatDockFitPadding(canvas, null, { left: 1004 }).right).toBe(
      "460px"
    );
  });

  it("keeps the normal margin when there is no chat bar", () => {
    expect(chatDockFitPadding(rect(40, 870), null).bottom).toBe("24px");
  });
});

describe("useInitialFitAboveChatDock", () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    fitView.mockClear();
    nodesInitialized = true;
    canvas = document.createElement("div");
    canvas.getBoundingClientRect = () => rect(40, 870);
    flowState = { width: 1390, domNode: canvas };
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = () => jest.runOnlyPendingTimers();

  it("fits a workflow that opens with nodes above the chat bar, at most 100%", () => {
    mountDock(660, 850);
    renderHook(() => useInitialFitAboveChatDock(true, null, 4), {
      wrapper: React.StrictMode
    });
    run();
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith(
      expect.objectContaining({
        maxZoom: 1,
        padding: expect.objectContaining({ bottom: "234px" })
      })
    );
  });

  it("measures the visible chat bar, not one in a hidden tab", () => {
    mountDock(0, 0);
    mountDock(660, 850);
    renderHook(() => useInitialFitAboveChatDock(true, null, 4));
    run();
    expect(fitView).toHaveBeenCalledWith(
      expect.objectContaining({
        padding: expect.objectContaining({ bottom: "234px" })
      })
    );
  });

  it("fits only once", () => {
    const { rerender } = renderHook(
      ({ count }) => useInitialFitAboveChatDock(true, null, count),
      { initialProps: { count: 4 } }
    );
    run();
    rerender({ count: 5 });
    run();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("keeps a saved viewport", () => {
    renderHook(() =>
      useInitialFitAboveChatDock(true, { x: 10, y: 20, zoom: 0.5 }, 4)
    );
    run();
    expect(fitView).not.toHaveBeenCalled();
  });

  // QA round 7 guard: the first node added to a blank workflow must not zoom.
  it("does not fit a workflow that opened blank when its first node arrives", () => {
    const { rerender } = renderHook(
      ({ count }) => useInitialFitAboveChatDock(true, null, count),
      { initialProps: { count: 0 } }
    );
    run();
    rerender({ count: 1 });
    run();
    expect(fitView).not.toHaveBeenCalled();
  });

  it("waits until a hidden tab is shown", () => {
    flowState = { width: 0, domNode: canvas };
    const { rerender } = renderHook(
      ({ active }) => useInitialFitAboveChatDock(active, null, 4),
      { initialProps: { active: false } }
    );
    run();
    expect(fitView).not.toHaveBeenCalled();
    flowState = { width: 1390, domNode: canvas };
    rerender({ active: true });
    run();
    expect(fitView).toHaveBeenCalledTimes(1);
  });
});
