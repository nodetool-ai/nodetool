import { renderHook, act } from "@testing-library/react";
import { asMock } from "../../../test-utils/doubles";
import { useReactFlow, type Node } from "@xyflow/react";
import { useCopyPaste } from "../useCopyPaste";
import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useSessionStateStore from "../../../stores/SessionStateStore";
import { useClipboardContentPaste } from "../useClipboardContentPaste";
import type { NodeData } from "../../../stores/NodeData";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn(() => ({ x: 1000, y: 1000 }))
  })),
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

describe("useCopyPaste positions of group children", () => {
  const group = makeNode("group-1", { position: { x: 500, y: 300 } });
  const child = makeNode("child-1", {
    parentId: "group-1",
    position: { x: 10, y: 20 }
  });
  const other = makeNode("other-1", { position: { x: 700, y: 300 } });
  const setNodes = jest.fn();
  const setEdges = jest.fn();
  let selected: Node<NodeData>[] = [];
  let clipboardText = "";

  beforeEach(() => {
    jest.clearAllMocks();
    asMock(useNodeStoreRef).mockReturnValue({
      getState: () => ({
        links: [],
        selectedLinkIds: [],
        nodes: [group, child, other],
        edges: [],
        workflow: { id: "w1" },
        getSelectedNodes: () => selected,
        generateNodeIds: (count: number) =>
          Array.from({ length: count }, (_, i) => `new-${i}`),
        setNodes,
        setEdges
      }),
      temporal: { getState: () => ({ beginGroup: jest.fn(), endGroup: jest.fn() }) }
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
      readClipboardText: jest.fn(async () => clipboardText)
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn(async (text: string) => {
          clipboardText = text;
        }),
        readText: jest.fn(async () => clipboardText)
      },
      configurable: true
    });
  });

  const copyAndPaste = async (): Promise<Node<NodeData>[]> => {
    const { result } = renderHook(() => useCopyPaste());
    await act(async () => {
      await result.current.handleCopy();
    });
    await act(async () => {
      await result.current.handlePaste();
    });
    const pasted: Node<NodeData>[] = setNodes.mock.calls[0][0];
    return pasted.filter((n) => n.id.startsWith("new-"));
  };

  it("keeps the canvas layout of a child copied without its group", async () => {
    selected = [child, other];
    const pasted = await copyAndPaste();

    expect(pasted.map((n) => n.parentId)).toEqual([undefined, undefined]);
    // On the canvas the child sits at (510, 320) and the other node at
    // (700, 300). The paste keeps that spacing.
    expect(pasted.map((n) => n.position)).toEqual([
      { x: 1000, y: 1000 },
      { x: 1190, y: 980 }
    ]);
  });

  it("keeps a child relative to its group when both are copied", async () => {
    selected = [child, group];
    const pasted = await copyAndPaste();

    const pastedGroup = pasted.find((n) => n.parentId === undefined);
    const pastedChild = pasted.find((n) => n.parentId !== undefined);
    expect(pastedGroup?.position).toEqual({ x: 1000, y: 1000 });
    expect(pastedChild?.parentId).toBe(pastedGroup?.id);
    expect(pastedChild?.position).toEqual({ x: 10, y: 20 });
  });

  it("keeps offsetting repeated pastes and resets when the pointer moves", async () => {
    selected = [other];
    const { result } = renderHook(() => useCopyPaste());
    await act(async () => {
      await result.current.handleCopy();
    });
    for (let paste = 0; paste < 5; paste += 1) {
      await act(async () => {
        await result.current.handlePaste();
      });
    }

    const pastedAt = (call: number) =>
      (setNodes.mock.calls[call][0] as Node<NodeData>[]).filter((n) =>
        n.id.startsWith("new-")
      )[0].position;
    expect(Array.from({ length: 5 }, (_, i) => pastedAt(i))).toEqual([
      { x: 1000, y: 1000 },
      { x: 1040, y: 1040 },
      { x: 1080, y: 1080 },
      { x: 1120, y: 1120 },
      { x: 1160, y: 1160 }
    ]);

    const flow = asMock(useReactFlow).mock.results.at(-1)?.value;
    flow.screenToFlowPosition.mockReturnValue({ x: 1160, y: 1160 });
    await act(async () => {
      await result.current.handlePaste({ x: 160, y: 160 });
    });
    await act(async () => {
      await result.current.handlePaste({ x: 160, y: 160 });
    });
    expect(pastedAt(5)).toEqual({ x: 1160, y: 1160 });
    expect(pastedAt(6)).toEqual({ x: 1200, y: 1200 });
  });

  it("pastes the in-app copy when the system clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true
    });
    let sessionClipboard: string | null = null;
    asMock(useSessionStateStore).mockImplementation(
      <T,>(
        selector: (state: {
          setClipboardData: (data: string | null) => void;
          setIsClipboardValid: jest.Mock;
        }) => T
      ) =>
        selector({
          setClipboardData: (data) => {
            sessionClipboard = data;
          },
          setIsClipboardValid: jest.fn()
        })
    );
    Object.assign(useSessionStateStore, {
      getState: () => ({ clipboardData: sessionClipboard })
    });
    selected = [other];

    const pasted = await copyAndPaste();

    expect(pasted).toHaveLength(1);
  });
});
