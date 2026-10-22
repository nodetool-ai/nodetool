import { renderHook, act } from "@testing-library/react";
import { asMock } from "../../../test-utils/doubles";
import type { Node } from "@xyflow/react";
import { useCopyPaste } from "../useCopyPaste";
import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useSessionStateStore from "../../../stores/SessionStateStore";
import { useClipboardContentPaste } from "../useClipboardContentPaste";
import { isTextInputActive } from "../../../utils/browser";
import type { NodeData } from "../../../stores/NodeData";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({ screenToFlowPosition: jest.fn() })),
  useStoreApi: jest.fn(() => ({ getState: () => ({ domNode: null }) }))
}));
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/SessionStateStore");
jest.mock("../useClipboardContentPaste");
jest.mock("../../../utils/browser", () => ({
  isTextInputActive: jest.fn(() => false)
}));
jest.mock("../../../utils/MousePosition", () => ({
  getMousePosition: jest.fn(() => ({ x: 0, y: 0 }))
}));

const makeNode = (
  id: string,
  overrides: Partial<Node<NodeData>> = {}
): Node<NodeData> =>
  ({
    id,
    type: "test",
    position: { x: 0, y: 0 },
    data: { properties: {}, dynamic_properties: {}, workflow_id: "w1" },
    ...overrides
  }) as Node<NodeData>;

describe("useCopyPaste handleCut", () => {
  const deleteNodes = jest.fn();
  const setNodes = jest.fn();
  const setEdges = jest.fn();

  const group = makeNode("group-1", { selected: true });
  const child = makeNode("child-1", {
    parentId: "group-1",
    position: { x: 10, y: 20 }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    asMock(useNodeStoreRef).mockReturnValue({
      getState: () => ({
        links: [],
        selectedLinkIds: [],
        nodes: [group, child],
        edges: [],
        getSelectedNodes: () => [group],
        deleteNodes,
        setNodes,
        setEdges
      })
    });
    asMock(useSessionStateStore).mockImplementation(
      <T,>(
        selector: (state: {
          setClipboardData: jest.Mock;
          setIsClipboardValid: jest.Mock;
        }) => T
      ) =>
        selector({
          setClipboardData: jest.fn(),
          setIsClipboardValid: jest.fn()
        })
    );
    asMock(useClipboardContentPaste).mockReturnValue({
      handleContentPaste: jest.fn(),
      readClipboardContent: jest.fn(),
      readClipboardText: jest.fn()
    });
    jest.mocked(isTextInputActive).mockReturnValue(false);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true
    });
  });

  it("cuts a group together with the nodes inside it", async () => {
    const { result } = renderHook(() => useCopyPaste());

    await act(async () => {
      await result.current.handleCut();
    });

    expect(deleteNodes).toHaveBeenCalledWith(["group-1", "child-1"]);
    const copied = JSON.parse(
      jest.mocked(navigator.clipboard.writeText).mock.calls[0][0]
    ) as { nodes: Node<NodeData>[] };
    expect(copied.nodes.map((node) => node.id)).toEqual(["group-1", "child-1"]);
    // deleteNodes, not a raw setNodes/setEdges filter, so the cut is one
    // undo step and clears the nodes' errors.
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is selected", async () => {
    asMock(useNodeStoreRef).mockReturnValue({
      getState: () => ({
        links: [],
        selectedLinkIds: [],
        nodes: [group, child],
        edges: [],
        getSelectedNodes: () => [],
        deleteNodes,
        setNodes,
        setEdges
      })
    });

    const { result } = renderHook(() => useCopyPaste());

    await act(async () => {
      await result.current.handleCut();
    });

    expect(deleteNodes).not.toHaveBeenCalled();
  });
});
