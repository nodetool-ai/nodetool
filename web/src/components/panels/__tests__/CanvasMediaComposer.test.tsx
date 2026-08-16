import { render } from "@testing-library/react";

import type { MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";

// Capture the props MediaChatComposer is rendered with so the test can drive
// its onSendMessage directly.
type ComposerProps = {
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    mediaGeneration?: MediaGenerationRequest
  ) => void;
};
let capturedProps: ComposerProps | null = null;
jest.mock("../../chat/composer/MediaChatComposer", () => ({
  __esModule: true,
  default: (props: ComposerProps) => {
    capturedProps = props;
    return null;
  }
}));

const sendMessage = jest.fn();
const connect = jest.fn();
const gcState = {
  status: "connected" as const,
  sendMessage,
  stopGeneration: jest.fn(),
  selectedModel: { id: "m1", provider: "openai" },
  setSelectedModel: jest.fn(),
  memoryEnabled: false,
  setMemoryEnabled: jest.fn(),
  connect
};
const useGlobalChatStore = (<T,>(selector: (s: typeof gcState) => T) =>
  selector(gcState)) as unknown as {
  <T,>(selector: (s: typeof gcState) => T): T;
  getState: () => typeof gcState;
};
useGlobalChatStore.getState = () => gcState;
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: useGlobalChatStore
}));

jest.mock("../../../contexts/NodeContext", () => {
  const actualReact = jest.requireActual("react");
  return {
    // A real context (defaulting to null) so useAddMediaToCanvas, pulled in via
    // the auto-add-to-canvas hook, resolves to "no canvas" instead of crashing.
    NodeContext: actualReact.createContext(null),
    useNodes: <T,>(selector: (s: { workflow: { id: string } }) => T) =>
      selector({ workflow: { id: "canvas-doc-id" } }),
    useNodeStoreRef: () => ({
      getState: () => ({
        workflow: { id: "canvas-doc-id", name: "My Graph" },
        getSelectedNodes: () => [{ id: "node-1" }, { id: "node-2" }]
      })
    })
  };
});

import CanvasMediaComposer from "../CanvasMediaComposer";

beforeEach(() => {
  capturedProps = null;
  sendMessage.mockClear();
});

describe("CanvasMediaComposer", () => {
  const mediaRequest: MediaGenerationRequest = {
    mode: "image",
    provider: "openai",
    model: "gpt-image-1"
  } as MediaGenerationRequest;

  it("does not send the canvas document id as a chat workflow_id for media generation", () => {
    render(<CanvasMediaComposer />);
    expect(capturedProps).not.toBeNull();

    capturedProps!.onSendMessage(
      [{ type: "text", text: "a cat" }] as MessageContent[],
      "a cat",
      mediaRequest
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const outgoing = sendMessage.mock.calls[0][0] as { workflow_id?: unknown };
    // A non-null workflow_id routes the backend into handleWorkflowMessage,
    // which tries to run the canvas document as a chat-responder workflow and
    // fails with "Workflow <id> not found". Media generation must not set it.
    expect(outgoing.workflow_id ?? null).toBeNull();
  });

  it("does not send the canvas document id as a chat workflow_id for plain chat", () => {
    render(<CanvasMediaComposer />);
    capturedProps!.onSendMessage(
      [{ type: "text", text: "hello" }] as MessageContent[],
      "hello",
      { mode: "chat" } as MediaGenerationRequest
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const outgoing = sendMessage.mock.calls[0][0] as { workflow_id?: unknown };
    expect(outgoing.workflow_id ?? null).toBeNull();
  });

  it("tells the agent which workflow the canvas is showing", () => {
    render(<CanvasMediaComposer />);
    capturedProps!.onSendMessage(
      [{ type: "text", text: "add a node" }] as MessageContent[],
      "add a node",
      { mode: "chat" } as MediaGenerationRequest
    );

    const outgoing = sendMessage.mock.calls[0][0] as {
      ui_context?: {
        focused?: { type: string; id: string; title?: string | null } | null;
        open?: { type: string; id: string }[] | null;
        selection?: { node_ids?: string[] | null } | null;
        source?: string | null;
      } | null;
    };
    expect(outgoing.ui_context?.source).toBe("workflow_canvas");
    expect(outgoing.ui_context?.focused).toEqual({
      type: "workflow",
      id: "canvas-doc-id",
      title: "My Graph"
    });
    expect(outgoing.ui_context?.open).toContainEqual(
      expect.objectContaining({ type: "workflow", id: "canvas-doc-id" })
    );
    expect(outgoing.ui_context?.selection?.node_ids).toEqual([
      "node-1",
      "node-2"
    ]);
  });
});
