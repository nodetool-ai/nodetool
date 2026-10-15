import { act, renderHook } from "@testing-library/react";
import {
  inspectorClearancePan,
  useClearInspectorOverlap
} from "../useClearInspectorOverlap";
import { useRightPanelStore } from "../../stores/RightPanelStore";

const setViewport = jest.fn();
let flowNodes: Array<{
  id: string;
  selected?: boolean;
  measured: { width: number };
  x: number;
}> = [];

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getNodes: () => flowNodes,
    getInternalNode: (id: string) => {
      const node = flowNodes.find((n) => n.id === id);
      return node
        ? {
            internals: { positionAbsolute: { x: node.x, y: 0 } },
            measured: node.measured
          }
        : undefined;
    },
    setViewport
  }),
  useStore: (selector: (s: { width: number }) => unknown) =>
    selector({ width: 1280 })
}));

describe("inspectorClearancePan", () => {
  it("does not pan when every node is left of the inspector", () => {
    expect(
      inspectorClearancePan([{ left: 50, right: 800 }], [], 1280, 350)
    ).toBe(0);
  });

  it("pans left so the rightmost node clears the inspector", () => {
    // Output node 910..1190 under a 350px inspector (starts at 930).
    const pan = inspectorClearancePan(
      [
        { left: 50, right: 370 },
        { left: 470, right: 830 },
        { left: 910, right: 1190 }
      ],
      [{ left: 470, right: 830 }],
      1280,
      350
    );
    expect(1190 + pan).toBeLessThanOrEqual(1280 - 350);
  });

  it("never pans a protected node out of the canvas", () => {
    const pan = inspectorClearancePan(
      [
        { left: 100, right: 500 },
        { left: 600, right: 1250 }
      ],
      [{ left: 100, right: 500 }],
      1280,
      350
    );
    expect(100 + pan).toBeGreaterThanOrEqual(0);
  });
});

describe("useClearInspectorOverlap", () => {
  beforeEach(() => {
    setViewport.mockReset();
    useRightPanelStore.getState().setVisibility(false);
    useRightPanelStore.getState().setSize(350);
    flowNodes = [
      { id: "agent", selected: true, x: 470, measured: { width: 360 } },
      { id: "output", x: 910, measured: { width: 280 } }
    ];
  });

  it("pans the canvas when the inspector opens over a node", () => {
    renderHook(() => useClearInspectorOverlap(true));
    expect(setViewport).not.toHaveBeenCalled();
    act(() => useRightPanelStore.getState().revealForSelection());
    expect(setViewport).toHaveBeenCalledTimes(1);
    const viewport = setViewport.mock.calls[0][0];
    expect(910 + 280 + viewport.x).toBeLessThanOrEqual(1280 - 350);
  });

  it("leaves a tab that is not shown alone", () => {
    renderHook(() => useClearInspectorOverlap(false));
    act(() => useRightPanelStore.getState().revealForSelection());
    expect(setViewport).not.toHaveBeenCalled();
  });
});
