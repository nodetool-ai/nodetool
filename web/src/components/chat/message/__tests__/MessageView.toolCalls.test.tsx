import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import { Message, ToolCall } from "../../../../stores/ApiTypes";

// The store hook is called with a selector; return undefined for every slice
// (no tool is "running") so ToolCallGroup renders its static collapsed state.
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) => selector({})
}));

jest.mock("../../../../contexts/EditorInsertionContext", () => ({
  useEditorInsertion: () => undefined
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

const toolCall = (id: string, name: string): ToolCall => ({
  id,
  name,
  args: {}
});

describe("MessageView tool-call grouping", () => {
  it("renders multiple tool calls as an expanded execution chain with a summary", () => {
    renderView({
      id: "m1",
      role: "assistant",
      tool_calls: [
        toolCall("a", "search"),
        toolCall("b", "read_file"),
        toolCall("c", "write_file"),
        toolCall("d", "run_tests")
      ]
    } as Message);

    expect(screen.getByText("Tool execution chain")).toBeInTheDocument();
    // Expanded by default: every card is visible along with the summary bar.
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("0/4 completed")).toBeInTheDocument();
  });

  it("rerenders only the active message when a thought is toggled", async () => {
    const user = userEvent.setup();
    let expanded = false;
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "thought-message",
              role: "assistant",
              content: "<think>Private reasoning</think>Final answer"
            } as Message
          }
          isThoughtExpanded={() => expanded}
          onToggleThought={() => {
            expanded = !expanded;
          }}
        />
      </ThemeProvider>
    );

    expect(screen.queryByText("Private reasoning")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show thought/i }));
    expect(screen.getByText("Private reasoning")).toBeInTheDocument();
  });

  it("collapses the chain when the section header is toggled", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m2",
      role: "assistant",
      tool_calls: [toolCall("a", "search"), toolCall("b", "run_tests")]
    } as Message);

    expect(screen.getByText("Run Tests")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /tool execution chain/i })
    );

    // Collapse unmounts its children once the exit transition finishes.
    await waitFor(() => {
      expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Search")).not.toBeInTheDocument();
  });

  it("counts a call with an empty result as completed in the summary", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "m4",
              role: "assistant",
              tool_calls: [toolCall("a", "search"), toolCall("b", "run_tests")]
            } as Message
          }
          isThoughtExpanded={() => false}
          onToggleThought={() => {}}
          toolResultsByCallId={{
            // Empty-string content still means the tool responded.
            a: { name: "search", content: "" }
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("1/2 completed")).toBeInTheDocument();
  });

  it("renders a single tool call inline without the group wrapper", () => {
    renderView({
      id: "m3",
      role: "assistant",
      tool_calls: [toolCall("a", "search")]
    } as Message);

    expect(
      screen.queryByText(/tool execution chain/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });
});
