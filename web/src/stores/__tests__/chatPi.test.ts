/**
 * Tests for the chatPi store slice (Pi agent mode for unified chat).
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that pull in the mocked modules.
// ---------------------------------------------------------------------------

const mockAgentSocketClient = {
  on: jest.fn(),
  off: jest.fn(),
  createSession: jest.fn(),
  sendMessage: jest.fn(),
  stopExecution: jest.fn(),
  listModels: jest.fn()
};

jest.mock("../../lib/agent/AgentSocketClient", () => ({
  getAgentSocketClient: () => mockAgentSocketClient
}));

jest.mock("../../utils/agentMessageAdapter", () => ({
  agentMessageToNodeToolMessage: jest.fn()
}));

jest.mock("../../lib/tools/frontendToolsIpc", () => ({}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createChatPiSlice, ChatPiSlice } from "../chatPi";
import type { AgentModelDescriptor } from "../../lib/agent/agentTypes";

// ---------------------------------------------------------------------------
// Helpers — lightweight set/get that mirror a zustand store.
// ---------------------------------------------------------------------------

type SliceState = ChatPiSlice & Record<string, unknown>;

function makeStore() {
  let state: SliceState = {} as SliceState;

  const set: any = (
    partial:
      | Partial<SliceState>
      | ((s: SliceState) => Partial<SliceState>)
  ) => {
    const patch = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...patch };
  };

  const get: any = () => state;

  // Initialise the slice and merge its return into state.
  const slice = createChatPiSlice(set, get);
  state = { ...state, ...slice };

  return { set, get, state: () => state as SliceState };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chatPi slice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Initial state ---------------------------------------------------
  it("createChatPiSlice returns correct initial state", () => {
    const { state } = makeStore();

    expect(state().piModel).toBe("");
    expect(state().piModels).toEqual([]);
    expect(state().piModelsLoading).toBe(false);
    expect(state().piWorkspaceId).toBeNull();
    expect(state().piWorkspacePath).toBeNull();
    expect(state().piSessionByThread).toEqual({});
    expect(state().piThreadBySession).toEqual({});
    expect(state().piStreamUnsub).toBeNull();
  });

  // 2. setPiModel -------------------------------------------------------
  it("setPiModel updates piModel", () => {
    const { state } = makeStore();

    state().setPiModel("anthropic/claude-sonnet-4-6");

    expect(state().piModel).toBe("anthropic/claude-sonnet-4-6");
  });

  // 3. setPiWorkspace ---------------------------------------------------
  it("setPiWorkspace updates both piWorkspaceId and piWorkspacePath", () => {
    const { state } = makeStore();

    state().setPiWorkspace("ws-123", "/home/user/project");

    expect(state().piWorkspaceId).toBe("ws-123");
    expect(state().piWorkspacePath).toBe("/home/user/project");
  });

  it("setPiWorkspace clears values when null is passed", () => {
    const { state } = makeStore();

    state().setPiWorkspace("ws-123", "/home/user/project");
    state().setPiWorkspace(null, null);

    expect(state().piWorkspaceId).toBeNull();
    expect(state().piWorkspacePath).toBeNull();
  });

  // 4. sendPiMessage rejects empty text ---------------------------------
  it("sendPiMessage rejects empty/whitespace text without state change", async () => {
    const { state, set } = makeStore();

    // Pre-configure a workspace and model so only the text guard fires.
    set({ piWorkspacePath: "/some/path", piModel: "openai/gpt-4" });

    await state().sendPiMessage("thread-1", "");
    await state().sendPiMessage("thread-1", "   ");

    // No session creation, no message sent.
    expect(mockAgentSocketClient.createSession).not.toHaveBeenCalled();
    expect(mockAgentSocketClient.sendMessage).not.toHaveBeenCalled();
  });

  // 5. sendPiMessage errors when no workspace ---------------------------
  it("sendPiMessage sets error when no workspace is configured", async () => {
    const { state } = makeStore();

    // Model set, but workspace left null.
    state().setPiModel("openai/gpt-4");

    await state().sendPiMessage("thread-1", "hello");

    expect(state().status).toBe("error");
    expect(state().error).toMatch(/workspace/i);
  });

  // 6. sendPiMessage errors when no model selected ----------------------
  it("sendPiMessage sets error when no model is selected", async () => {
    const { state, set } = makeStore();

    // Workspace set, but piModel left as "".
    set({ piWorkspacePath: "/some/path" });

    await state().sendPiMessage("thread-1", "hello");

    expect(state().status).toBe("error");
    expect(state().error).toMatch(/model/i);
  });

  // 7. stopPi with no session ------------------------------------------
  it("stopPi sets status to connected when no session exists for thread", () => {
    const { state } = makeStore();

    state().stopPi("unknown-thread");

    expect(state().status).toBe("connected");
    expect(mockAgentSocketClient.stopExecution).not.toHaveBeenCalled();
  });

  // 8. loadPiModels -----------------------------------------------------
  it("loadPiModels fetches models and updates state", async () => {
    const models: AgentModelDescriptor[] = [
      {
        id: "anthropic/claude-sonnet-4-6",
        label: "Claude Sonnet",
        provider: "pi",
        isDefault: true
      },
      {
        id: "openai/gpt-4",
        label: "GPT-4",
        provider: "pi",
        isDefault: false
      }
    ];

    mockAgentSocketClient.listModels.mockResolvedValue(models);

    const { state } = makeStore();

    await state().loadPiModels();

    expect(mockAgentSocketClient.listModels).toHaveBeenCalledWith({
      provider: "pi",
      workspacePath: undefined
    });
    expect(state().piModels).toEqual(models);
    expect(state().piModelsLoading).toBe(false);
    // Default model should be selected since piModel was "".
    expect(state().piModel).toBe("anthropic/claude-sonnet-4-6");
  });

  it("loadPiModels keeps current model when it is in the fetched list", async () => {
    const models: AgentModelDescriptor[] = [
      {
        id: "anthropic/claude-sonnet-4-6",
        label: "Claude Sonnet",
        provider: "pi",
        isDefault: true
      },
      {
        id: "openai/gpt-4",
        label: "GPT-4",
        provider: "pi",
        isDefault: false
      }
    ];

    mockAgentSocketClient.listModels.mockResolvedValue(models);

    const { state } = makeStore();

    state().setPiModel("openai/gpt-4");

    await state().loadPiModels();

    // Should keep the previously selected model since it exists in the list.
    expect(state().piModel).toBe("openai/gpt-4");
  });

  it("loadPiModels sets piModelsLoading to false on error", async () => {
    mockAgentSocketClient.listModels.mockRejectedValue(new Error("network"));

    const { state } = makeStore();

    await state().loadPiModels();

    expect(state().piModelsLoading).toBe(false);
    expect(state().piModels).toEqual([]);
  });
});
