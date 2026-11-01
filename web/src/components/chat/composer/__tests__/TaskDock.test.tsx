import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TaskDock, buildTaskDockList, currentTaskIndex } from "../TaskDock";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";
import type { TaskUpdate, TodoItem } from "../../../../stores/ApiTypes";

const TODOS: TodoItem[] = [
  { content: "Read the brief", status: "completed" },
  { content: "Render the hero shot", status: "in_progress" },
  { content: "Assemble the cut", status: "pending" }
];

const renderDock = (todos: TodoItem[], taskUpdate?: TaskUpdate | null) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TaskDock todos={todos} taskUpdate={taskUpdate} />
    </ThemeProvider>
  );

const bar = (): HTMLElement => screen.getByRole("button");

describe("TaskDock", () => {
  it("shows the running task and the done count while collapsed", () => {
    const { container } = renderDock(TODOS);

    expect(bar()).toHaveAttribute("aria-expanded", "false");
    expect(bar()).toHaveTextContent("Render the hero shot");
    expect(bar()).toHaveTextContent("1/3");
    expect(container.querySelector(".task-dock-fill")).toHaveStyle({
      width: "33%"
    });
    expect(container.querySelectorAll(".task-dock-item")).toHaveLength(0);
  });

  it("unfolds every task, marked with its status", () => {
    const { container } = renderDock(TODOS);

    fireEvent.click(bar());

    expect(bar()).toHaveAttribute("aria-expanded", "true");
    const rows = container.querySelectorAll(".task-dock-item");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass("completed");
    expect(rows[1]).toHaveClass("in_progress");
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    expect(rows[2]).toHaveClass("pending");
  });

  it("says when every task is done", () => {
    renderDock(TODOS.map((todo) => ({ ...todo, status: "completed" })));

    expect(bar()).toHaveTextContent("All tasks done");
    expect(bar()).toHaveTextContent("3/3");
  });

  it("renders nothing without tasks", () => {
    const { container } = renderDock([]);

    expect(container.querySelector(".task-dock")).toBeNull();
  });

  it("shows the running agent task's steps instead of the todos", () => {
    const taskUpdate: TaskUpdate = {
      type: "task_update",
      event: TaskUpdateEvent.StepStarted,
      task: {
        title: "Launch kit",
        steps: [
          { id: "a", instructions: "Draw the logo", completed: true },
          { id: "b", instructions: "Paint the poster" },
          { id: "c", instructions: "Write the caption" }
        ]
      },
      step: { id: "b", instructions: "Paint the poster" }
    };

    renderDock(TODOS, taskUpdate);

    expect(bar()).toHaveTextContent("Paint the poster");
    expect(bar()).toHaveTextContent("1/3");
    fireEvent.click(bar());
    expect(screen.getByText("Launch kit")).toBeInTheDocument();
  });
});

describe("currentTaskIndex", () => {
  it("prefers the running task, then the next pending one, then the last", () => {
    expect(currentTaskIndex(TODOS)).toBe(1);
    expect(
      currentTaskIndex([
        { content: "a", status: "completed" },
        { content: "b", status: "pending" }
      ])
    ).toBe(1);
    expect(
      currentTaskIndex([
        { content: "a", status: "completed" },
        { content: "b", status: "completed" }
      ])
    ).toBe(1);
  });
});

describe("buildTaskDockList", () => {
  it("adds the current step when the plan does not list it", () => {
    const list = buildTaskDockList([], {
      type: "task_update",
      event: TaskUpdateEvent.StepStarted,
      task: { title: "Ad hoc" },
      step: { instructions: "Look around" }
    });

    expect(list.items).toEqual([
      { content: "Look around", status: "in_progress" }
    ]);
  });
});
