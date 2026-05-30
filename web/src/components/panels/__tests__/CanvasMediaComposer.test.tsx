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
const useGlobalChatStore = ((selector: (s: typeof gcState) => unknown) =>
  selector(gcState)) as unknown as {
  (selector: (s: typeof gcState) => unknown): unknown;
  getState: () => typeof gcState;
};
useGlobalChatStore.getState = () => gcState;
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: useGlobalChatStore
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (s: { workflow: { id: string } }) => unknown) =>
    selector({ workflow: { id: "canvas-doc-id" } })
}));

const markGenerationStarted = jest.fn();
jest.mock("../../../hooks/handlers/useGenerationToCanvas", () => ({
  useGenerationToCanvas: () => ({ markGenerationStarted })
}));

import CanvasMediaComposer from "../CanvasMediaComposer";

beforeEach(() => {
  capturedProps = null;
  sendMessage.mockClear();
  markGenerationStarted.mockClear();
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
    expect(markGenerationStarted).toHaveBeenCalledTimes(1);
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
});
