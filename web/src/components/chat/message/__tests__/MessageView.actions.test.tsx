import "@testing-library/jest-dom";
import type React from "react";
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

const renderView = (
  message: Message,
  extra: Partial<React.ComponentProps<typeof MessageView>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
        {...extra}
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

describe("MessageView action row", () => {
  it("is offered on a reply that also made tool calls", () => {
    renderView({
      id: "m7",
      role: "assistant",
      thread_id: "thread-1",
      content: "I searched and found three results.",
      tool_calls: [{ id: "call-1", name: "web_search", args: { query: "x" } }]
    } as Message);

    expect(
      screen.getByRole("button", { name: "Copy to clipboard" })
    ).toBeInTheDocument();
  });

  it("is offered on a reply whose tool_calls array is empty", () => {
    renderView({
      id: "m8",
      role: "assistant",
      thread_id: "thread-1",
      content: "Plain answer.",
      tool_calls: []
    } as unknown as Message);

    expect(
      screen.getByRole("button", { name: "Copy to clipboard" })
    ).toBeInTheDocument();
  });

  it("is not offered on a message that only carries tool calls", () => {
    renderView({
      id: "m9",
      role: "assistant",
      thread_id: "thread-1",
      content: "",
      tool_calls: [{ id: "call-2", name: "web_search", args: { query: "x" } }]
    } as Message);

    expect(
      screen.queryByRole("button", { name: "Copy to clipboard" })
    ).not.toBeInTheDocument();
  });
});

describe("MessageView edit in place", () => {
  const sent = {
    id: "0123456789abcdef0123456789abcdef",
    role: "user",
    thread_id: "thread-1",
    content: "make it blue"
  } as Message;

  it("sends the edited text for the message", async () => {
    const user = userEvent.setup();
    const onResend = jest.fn();
    renderView(sent, { onResend });

    await user.click(screen.getByRole("button", { name: "Edit and resend" }));
    const field = screen.getByRole("textbox", { name: "Edit message" });
    await user.clear(field);
    await user.type(field, "make it red");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onResend).toHaveBeenCalledWith(sent, "make it red");
    expect(useChatDraftStore.getState().drafts).toEqual({});
  });

  it("sends with Enter and leaves the message alone on Escape", async () => {
    const user = userEvent.setup();
    const onResend = jest.fn();
    renderView(sent, { onResend });

    await user.click(screen.getByRole("button", { name: "Edit and resend" }));
    await user.keyboard("{Escape}");
    expect(onResend).not.toHaveBeenCalled();
    expect(screen.getByText("make it blue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit and resend" }));
    await user.keyboard(" now{Enter}");
    expect(onResend).toHaveBeenCalledWith(sent, "make it blue now");
  });

  it("warns when later turns will be replaced", async () => {
    const user = userEvent.setup();
    renderView(sent, { onResend: jest.fn(), editRemovesLaterTurns: true });

    await user.click(screen.getByRole("button", { name: "Edit and resend" }));

    expect(
      screen.getByText("Sending replaces everything after this message.")
    ).toBeInTheDocument();
  });
});

describe("MessageView regenerate", () => {
  it("is offered on a reply that has the action", async () => {
    const user = userEvent.setup();
    const onRegenerate = jest.fn();
    renderView(
      { id: "r1", role: "assistant", thread_id: "thread-1", content: "Blue." } as Message,
      { onRegenerate, isLatestReply: true }
    );

    await user.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(onRegenerate).toHaveBeenCalled();
  });

  it("is not offered otherwise", () => {
    renderView({
      id: "r2",
      role: "assistant",
      thread_id: "thread-1",
      content: "Blue."
    } as Message);

    expect(
      screen.queryByRole("button", { name: "Regenerate" })
    ).not.toBeInTheDocument();
  });
});

describe("MessageView inside a longer reply", () => {
  const segment = {
    id: "s1",
    role: "assistant",
    thread_id: "thread-1",
    content: "Starting."
  } as Message;

  it("renders no action row when the reply ends later", () => {
    renderView(segment, { hideActions: true });

    expect(
      screen.queryByRole("button", { name: "Copy to clipboard" })
    ).not.toBeInTheDocument();
  });
});
