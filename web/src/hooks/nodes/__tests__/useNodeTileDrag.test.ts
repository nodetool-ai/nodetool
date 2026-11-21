import { renderHook } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { useNodeTileDrag } from "../useNodeTileDrag";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { useDragDropStore } from "../../../lib/dragdrop/store";

const metadata = stub<NodeMetadata>({ node_type: "test.Node" });

type DragEventDouble = React.DragEvent<HTMLDivElement> & {
  preventDefault: jest.Mock;
  stopPropagation: jest.Mock;
};

const dragEvent = (nodeType?: string): DragEventDouble => {
  const dataTransfer: Pick<DataTransfer, "setData" | "effectAllowed"> = {
    setData: jest.fn(),
    effectAllowed: "none"
  };
  return stub<DragEventDouble>({
    currentTarget: { dataset: nodeType ? { nodeType } : {} },
    dataTransfer,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  });
};

describe("useNodeTileDrag", () => {
  beforeEach(() => {
    useMetadataStore.setState({
      getMetadata: (type: string) => (type === "test.Node" ? metadata : undefined)
    });
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
