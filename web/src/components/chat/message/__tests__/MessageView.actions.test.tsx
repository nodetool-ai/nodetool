import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import { Message } from "../../../../stores/ApiTypes";
import useChatDraftStore from "../../../../stores/ChatDraftStore";

// GlobalChatStore is called with a selector; an empty state means no running
// tool and no current thread, so each test states its thread on the message.
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) => selector({}))
}));

jest.mock("../../../../contexts/EditorInsertionContext", () => ({
  useEditorInsertion: () => undefined
}));

jest.mock("../../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({ writeClipboard: jest.fn().mockResolvedValue(undefined) })
}));

jest.mock("../ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

const renderView = (message: Message) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  useChatDraftStore.setState({ drafts: {} });
});

describe("MessageView edit and resend", () => {
  it("seeds the message's thread with its own text", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m1",
      role: "user",
      thread_id: "thread-1",
      content: "make it blue"
    } as Message);

    await user.click(screen.getByRole("button", { name: "Edit and resend" }));

    expect(useChatDraftStore.getState().drafts).toEqual({
      "thread-1": "make it blue"
    });
  });

  it("is not offered on an assistant message", () => {
    renderView({
      id: "m2",
      role: "assistant",
      thread_id: "thread-1",
      content: "here you go"
    } as Message);

    expect(
      screen.queryByRole("button", { name: "Edit and resend" })
    ).not.toBeInTheDocument();
  });

  it("is not offered on a user message with no text", () => {
    renderView({
      id: "m3",
      role: "user",
      thread_id: "thread-1",
      content: ""
    } as Message);

    expect(
      screen.queryByRole("button", { name: "Edit and resend" })
    ).not.toBeInTheDocument();
  });

  it("is not offered when no thread id is known", () => {
    renderView({
      id: "m4",
      role: "user",
      content: "make it blue"
    } as Message);

    expect(
      screen.queryByRole("button", { name: "Edit and resend" })
    ).not.toBeInTheDocument();
  });
});

describe("MessageView timestamp", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows only the clock for a message sent today", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-04T18:30:00"));
    renderView({
      id: "m5",
      role: "user",
      thread_id: "thread-1",
      content: "today",
      created_at: "2026-09-04T14:05:00"
    } as Message);

    expect(screen.getByText("14:05")).toBeInTheDocument();
  });

  it("puts the day in front for a message from another day", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-04T18:30:00"));
    renderView({
      id: "m6",
      role: "user",
      thread_id: "thread-1",
      content: "earlier this week",
      created_at: "2026-09-01T14:05:00"
    } as Message);

    expect(screen.getByText("Sep 01 14:05")).toBeInTheDocument();
  });
});
