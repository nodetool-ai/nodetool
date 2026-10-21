import { act } from "@testing-library/react";
import type { Node } from "@xyflow/react";

import useCanvasChatDockStore from "../../../stores/CanvasChatDockStore";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import type { NodeMetadata, Workflow } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";
import { nodeStoreRenderers } from "../../../test-utils/nodeStore";
import {
  MAX_ERROR_DRAFT_LENGTH,
  useChatAboutNodes
} from "../useChatAboutNodes";

const chatState = {
  currentThreadId: null as string | null,
  openWorkflowThread: jest.fn(),
  createNewThread: jest.fn()
};
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: { getState: () => chatState }
}));

const makeNode = (id: string, type: string, title?: string): Node<NodeData> => {
  const data: NodeData = {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf1"
  };
  if (title) {
    data.title = title;
  }
  return { id, type, position: { x: 0, y: 0 }, data };
};

const setup = () => {
  const store = createNodeStore(undefined, {
    nodes: [
      makeNode("n1", "test.TextToImage"),
      makeNode("n2", "test.Blur", "My blur"),
      makeNode("n3", "test.Unknown")
    ]
  });
  const { renderHook } = nodeStoreRenderers(store);
  const { result } = renderHook(() => useChatAboutNodes());
  return { store, chatAboutNodes: result.current };
};

beforeEach(() => {
  jest.clearAllMocks();
  chatState.currentThreadId = "thread-1";
  useChatDraftStore.setState({ drafts: {}, runReferences: {} });
  useCanvasChatDockStore.setState({ conversationCollapsed: true });
  useMediaGenerationStore.getState().setMode("image");
  useMetadataStore.setState({
    metadata: {
      "test.TextToImage": stub<NodeMetadata>({
        node_type: "test.TextToImage",
        title: "Text To Image"
      })
    }
  });
});

describe("useChatAboutNodes", () => {
  it("opens the chat in chat mode with a draft naming the node, and selects it", async () => {
    const { store, chatAboutNodes } = setup();
    await act(() => chatAboutNodes(["n1"]));

    expect(useChatDraftStore.getState().drafts["thread-1"]).toBe(
      'About the "Text To Image" node (id n1): '
    );
    expect(useCanvasChatDockStore.getState().conversationCollapsed).toBe(false);
    expect(useMediaGenerationStore.getState().mode).toBe("chat");
    expect(
      store.getState().nodes.filter((n) => n.selected).map((n) => n.id)
    ).toEqual(["n1"]);
  });

  it("names every node of a selection, preferring the custom title", async () => {
    const { chatAboutNodes } = setup();
    await act(() => chatAboutNodes(["n1", "n2", "n3"]));

    expect(useChatDraftStore.getState().drafts["thread-1"]).toBe(
      'About these nodes: "Text To Image" (id n1), "My blur" (id n2), "Unknown" (id n3). '
    );
  });

  it("puts a node error in the draft and cuts a long one", async () => {
    const { chatAboutNodes } = setup();
    const error = "x".repeat(MAX_ERROR_DRAFT_LENGTH + 50);
    await act(() => chatAboutNodes(["n1"], { error }));

    const draft = useChatDraftStore.getState().drafts["thread-1"];
    expect(draft).toContain('The "Text To Image" node (id n1) failed');
    expect(draft).toContain(`${"x".repeat(MAX_ERROR_DRAFT_LENGTH)}…`);
    expect(draft).not.toContain("x".repeat(MAX_ERROR_DRAFT_LENGTH + 1));
  });

  it("opens the workflow's thread when none is current", async () => {
    chatState.currentThreadId = null;
    chatState.openWorkflowThread.mockResolvedValue("thread-wf");
    const store = createNodeStore(stub<Workflow>({ id: "wf1", name: "Flow" }), {
      nodes: [makeNode("n1", "test.TextToImage")]
    });
    const { renderHook } = nodeStoreRenderers(store);
    const { result } = renderHook(() => useChatAboutNodes());
    await act(() => result.current(["n1"]));

    expect(chatState.openWorkflowThread).toHaveBeenCalledWith("wf1");
    expect(useChatDraftStore.getState().drafts["thread-wf"]).toBeDefined();
  });

  it("does nothing for unknown nodes", async () => {
    const { chatAboutNodes } = setup();
    await act(() => chatAboutNodes(["missing"]));

    expect(useChatDraftStore.getState().drafts).toEqual({});
    expect(useCanvasChatDockStore.getState().conversationCollapsed).toBe(true);
  });
});
