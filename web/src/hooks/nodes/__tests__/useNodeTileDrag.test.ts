import { renderHook } from "@testing-library/react";
import { useNodeTileDrag } from "../useNodeTileDrag";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { useDragDropStore } from "../../../lib/dragdrop/store";

const metadata = { node_type: "test.Node" } as never;

const dragEvent = (nodeType?: string) => {
  const dataTransfer = {
    setData: jest.fn(),
    effectAllowed: "none"
  };
  return {
    currentTarget: { dataset: nodeType ? { nodeType } : {} },
    dataTransfer,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  } as never as React.DragEvent<HTMLDivElement> & {
    preventDefault: jest.Mock;
    stopPropagation: jest.Mock;
  };
};

describe("useNodeTileDrag", () => {
  beforeEach(() => {
    useMetadataStore.setState({
      getMetadata: (type: string) => (type === "test.Node" ? metadata : undefined)
    } as never);
  });

  it("cancels the drag when the tile has no node type", () => {
    const { result } = renderHook(() => useNodeTileDrag());
    const event = dragEvent();
    result.current.handleDragStart(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("cancels the drag when metadata is unknown", () => {
    const { result } = renderHook(() => useNodeTileDrag());
    const event = dragEvent("missing.Node");
    result.current.handleDragStart(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("starts and ends a create-node drag", () => {
    const { result } = renderHook(() => useNodeTileDrag());
    const event = dragEvent("test.Node");
    result.current.handleDragStart(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.effectAllowed).toBe("copyMove");
    expect(useNodeMenuStore.getState().dragToCreate).toBe(true);
    expect(useDragDropStore.getState().activeDrag).toEqual({
      type: "create-node",
      payload: metadata
    });

    result.current.handleDragEnd();
    expect(useNodeMenuStore.getState().dragToCreate).toBe(false);
    expect(useDragDropStore.getState().activeDrag).toBeNull();
  });
});
