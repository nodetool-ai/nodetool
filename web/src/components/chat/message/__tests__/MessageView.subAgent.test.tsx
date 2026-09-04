import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import { Message } from "../../../../stores/ApiTypes";

const storeState = {
  subAgentMessages: {
    "thread-1": {
      "call-1": [
        {
          id: "child-1",
          role: "assistant",
          type: "message",
          content: "Checked three files.",
          parent_tool_call_id: "call-1"
        },
        {
          id: "child-2",
          role: "assistant",
          type: "message",
          content: null,
          parent_tool_call_id: "call-1",
          tool_calls: [{ id: "grep-1", name: "search", args: { query: "todo" } }]
        }
      ]
    }
  }
};

jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) => selector(storeState))
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

const subtaskMessage = {
  id: "m1",
  role: "assistant",
  thread_id: "thread-1",
  tool_calls: [
    {
      id: "call-1",
      name: "run_subtask",
      args: {
        description: "Audit the config loader",
        prompt: "Read every config file and report unused keys."
      }
    }
  ]
} as Message;

const renderView = (message: Message) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        threadId="thread-1"
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
      />
    </ThemeProvider>
  );

describe("MessageView sub-agent card", () => {
  it("shows the goal and message count while folded", () => {
    renderView(subtaskMessage);

    expect(screen.getByText("Audit the config loader")).toBeInTheDocument();
    expect(screen.getByText("2 messages")).toBeInTheDocument();
    expect(screen.queryByText("Checked three files.")).not.toBeInTheDocument();
  });

  it("renders the child's own messages when unfolded", async () => {
    renderView(subtaskMessage);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Checked three files.")).toBeInTheDocument();
    // The child's tool call renders as a row of its own, same as in the thread.
    expect(
      document.querySelectorAll(".subagent-transcript .tool-row")
    ).toHaveLength(1);
    expect(
      screen.getByText("Read every config file and report unused keys.")
    ).toBeInTheDocument();
  });

  it("stays a plain row when the child has said nothing yet", () => {
    renderView({
      id: "m2",
      role: "assistant",
      thread_id: "thread-1",
      tool_calls: [
        { id: "call-2", name: "run_search", args: { description: "Find it" } }
      ]
    } as Message);

    expect(screen.queryByText(/messages/)).not.toBeInTheDocument();
  });
});
