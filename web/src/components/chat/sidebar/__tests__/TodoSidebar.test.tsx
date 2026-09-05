import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TodoSidebar } from "../TodoSidebar";
import type { TodoItem } from "../../../../stores/ApiTypes";

const TODOS: TodoItem[] = [
  { content: "Read the brief", status: "completed" },
  { content: "Render the hero shot", status: "in_progress" },
  { content: "Assemble the cut", status: "pending" }
];

const renderSidebar = (todos: TodoItem[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TodoSidebar todos={todos} />
    </ThemeProvider>
  );

/** The `.todo-item` row a given task's text sits in. */
const rowFor = (content: string): HTMLElement => {
  const row = screen.getByText(content).closest(".todo-item");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`No todo row rendered for "${content}"`);
  }
  return row;
};

describe("TodoSidebar", () => {
  it("counts the completed tasks against the total", () => {
    renderSidebar(TODOS);

    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("renders one row per task, marked with its status", () => {
    const { container } = renderSidebar(TODOS);

    expect(container.querySelectorAll(".todo-item")).toHaveLength(3);
    expect(rowFor("Read the brief")).toHaveClass("completed");
    expect(rowFor("Render the hero shot")).toHaveClass("in_progress");
    expect(rowFor("Assemble the cut")).toHaveClass("pending");
    // The status also reaches the icon, which is the only cue at a glance.
    expect(
      rowFor("Render the hero shot").querySelector(".todo-icon.in_progress")
    ).not.toBeNull();
  });

  it("explains the empty rail instead of showing a 0/0 count", () => {
    const { container } = renderSidebar([]);

    expect(
      screen.getByText(
        "No tasks yet. The agent will list its plan here as it works."
      )
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".todo-item")).toHaveLength(0);
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });
});
