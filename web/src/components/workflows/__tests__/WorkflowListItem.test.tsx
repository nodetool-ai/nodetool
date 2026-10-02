import React from "react";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";
import WorkflowListItem from "../WorkflowListItem";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";

jest.mock("../../version/WorkflowMiniPreview", () => ({ WorkflowMiniPreview: () => null }));
jest.mock("../WorkflowTriggerIndicator", () => ({ WorkflowTriggerIndicator: () => null }));

const workflow = {
  id: "0123456789abcdef0123456789abcdef", name: "UX scan fixture", description: "",
  graph: { nodes: [], edges: [] }, tags: [], access: "private" as const,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
};
const wrap = (child: React.ReactNode) => render(
  <ThemeProvider theme={mockTheme}><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><ContextMenuProvider>{child}</ContextMenuProvider></MemoryRouter>
  </QueryClientProvider></ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

test.each(["{Enter}", " "])("bulk selection uses %s to select the workflow", async (key) => {
  const user = userEvent.setup();
  const onOpenWorkflow = jest.fn();
  const onSelect = jest.fn();
  wrap(<WorkflowListItem workflow={workflow} isSelected={false} isCurrent={false}
    showCheckboxes onOpenWorkflow={onOpenWorkflow} onSelect={onSelect}
    onDuplicateWorkflow={jest.fn()} onDelete={jest.fn()} onEdit={jest.fn()} onRename={jest.fn()} />);
  const row = screen.getByRole("button", { name: /workflow UX scan fixture/ });
  act(() => row.focus());
  await user.keyboard(key);
  expect(onSelect).toHaveBeenCalledWith(workflow);
  expect(onOpenWorkflow).not.toHaveBeenCalled();
});

test("keyboard activation of the checkbox does not activate the row twice", async () => {
  const user = userEvent.setup();
  const onSelect = jest.fn();
  const onOpenWorkflow = jest.fn();
  wrap(<WorkflowListItem workflow={workflow} isSelected={false} isCurrent={false}
    showCheckboxes onOpenWorkflow={onOpenWorkflow} onSelect={onSelect}
    onDuplicateWorkflow={jest.fn()} onDelete={jest.fn()} onEdit={jest.fn()} onRename={jest.fn()} />);
  act(() => screen.getByRole("checkbox").focus());
  await user.keyboard(" ");
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onOpenWorkflow).not.toHaveBeenCalled();
});

test.each(["{Enter}", " "])("normal browsing uses %s to open the workflow", async (key) => {
  const user = userEvent.setup();
  const onOpenWorkflow = jest.fn();
  const onSelect = jest.fn();
  wrap(<WorkflowListItem workflow={workflow} isSelected={false} isCurrent={false}
    showCheckboxes={false} onOpenWorkflow={onOpenWorkflow} onSelect={onSelect}
    onDuplicateWorkflow={jest.fn()} onDelete={jest.fn()} onEdit={jest.fn()} onRename={jest.fn()} />);
  act(() => screen.getByRole("button", { name: "Open workflow UX scan fixture" }).focus());
  await user.keyboard(key);
  expect(onOpenWorkflow).toHaveBeenCalledWith(workflow);
  expect(onSelect).not.toHaveBeenCalled();
});
