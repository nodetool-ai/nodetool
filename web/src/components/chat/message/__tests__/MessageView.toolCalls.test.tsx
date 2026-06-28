import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
  it("collapses multiple tool calls behind a single 'N tools called' line", () => {
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

    expect(screen.getByText("4 tools called")).toBeInTheDocument();
    // Collapsed by default: individual tool names are not shown yet.
    expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
  });

  it("unfolds to reveal the individual tool calls when toggled", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m2",
      role: "assistant",
      tool_calls: [toolCall("a", "search"), toolCall("b", "run_tests")]
    } as Message);

    await user.click(screen.getByRole("button", { name: /2 tools called/i }));

    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("renders a single tool call inline without the group wrapper", () => {
    renderView({
      id: "m3",
      role: "assistant",
      tool_calls: [toolCall("a", "search")]
    } as Message);

    expect(screen.queryByText(/tools called/i)).not.toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });
});
