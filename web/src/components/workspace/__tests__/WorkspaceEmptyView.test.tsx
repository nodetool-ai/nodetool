import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import WorkspaceEmptyView from "../WorkspaceEmptyView";
import mockTheme from "../../../__mocks__/themeMock";
import useOnboardingStore from "../../../stores/OnboardingStore";
import type { MessageContent } from "../../../stores/ApiTypes";

const openTab = jest.fn();
const createNewThread = jest.fn().mockResolvedValue("thread-1");
const sendMessage = jest.fn().mockResolvedValue(undefined);
const connect = jest.fn().mockResolvedValue(undefined);
const stopGeneration = jest.fn();
const setSelectedModel = jest.fn();

const chatState = {
  status: "connected",
  selectedModel: { type: "language_model", provider: "openai", id: "gpt-5" },
  setSelectedModel,
  stopGeneration,
  createNewThread,
  sendMessage,
  connect
};

jest.mock("../../../stores/GlobalChatStore", () => {
  const useStore = <T,>(selector: (state: unknown) => T) =>
    selector(chatState);
  useStore.getState = () => chatState;
  return { __esModule: true, default: useStore };
});

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  useWorkspaceTabsStore: <T,>(selector: (state: unknown) => T) =>
    selector({ openTab })
}));

const createNew = jest
  .fn()
  .mockResolvedValue({ id: "wf-1", name: "Untitled workflow" });

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({ createNew })
}));

const fetchSecrets = jest.fn().mockResolvedValue([]);
const secretsState = { fetchSecrets, secrets: [] as unknown[] };

jest.mock("../../../stores/SecretsStore", () => {
  const useStore = <T,>(selector: (state: unknown) => T) =>
    selector(secretsState);
  useStore.getState = () => secretsState;
  return { __esModule: true, default: useStore };
});

const showProviderOnboarding = jest.fn();

jest.mock("../../../stores/ProviderOnboardingStore", () => ({
  __esModule: true,
  openProviderOnboarding: (options?: unknown) =>
    showProviderOnboarding(options)
}));

jest.mock("../../chat/containers/ChatInputSection", () => ({
  __esModule: true,
  default: ({
    onSendMessage
  }: {
    onSendMessage: (content: MessageContent[], prompt: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSendMessage([{ type: "text", text: "hello" }], "hello")}
    >
      send
    </button>
  )
}));

// The provider signal reads OAuth connection state through TanStack Query.
const renderEmptyView = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <WorkspaceEmptyView />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("WorkspaceEmptyView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  });

  it("renders the composer with the agent-building hint", () => {
    renderEmptyView();
    expect(
      screen.getByText(/Describe a workflow in plain language/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send" })).toBeInTheDocument();
  });

  it("sends a sample prompt into a new chat tab", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    const prompt = "Build a workflow that turns a prompt into an image";
    await user.click(screen.getByRole("button", { name: prompt }));

    await waitFor(() => expect(createNewThread).toHaveBeenCalled());
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: [{ type: "text", text: prompt }]
        }),
        "thread-1"
      )
    );
  });

  it("opens a chat tab for the new thread and sends the message to it", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    await user.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => expect(createNewThread).toHaveBeenCalled());
    expect(openTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "thread-1",
      mode: "view",
      title: "New chat"
    });
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          thread_id: "thread-1",
          content: [{ type: "text", text: "hello" }]
        }),
        "thread-1"
      )
    );
  });

  it("shows the getting started checklist while steps are open", () => {
    renderEmptyView();
    expect(screen.getByText(/getting started · 0\/4/i)).toBeInTheDocument();
  });

  it("hides the checklist once onboarding is dismissed", () => {
    useOnboardingStore.setState({ dismissed: true });
    renderEmptyView();
    expect(screen.queryByText(/getting started/i)).not.toBeInTheDocument();
  });

  it("opens the provider dialog from the connect step", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    await user.click(screen.getByText("Connect an AI provider"));

    expect(showProviderOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "generate_message" })
    );
  });

  it("opens the examples page as a tab from the template step", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    await user.click(screen.getByText("Open a starter or template"));

    expect(openTab).toHaveBeenCalledWith({
      type: "page",
      ref: "examples",
      mode: "view",
      title: "Examples"
    });
  });

  it("creates a workflow tab from the build-your-own step", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    await user.click(screen.getByText("Build your own"));

    await waitFor(() => expect(createNew).toHaveBeenCalled());
    expect(openTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "wf-1",
      mode: "edit",
      title: "Untitled workflow"
    });
    expect(useOnboardingStore.getState().completedSteps).toContain(
      "create-workflow"
    );
  });
});
