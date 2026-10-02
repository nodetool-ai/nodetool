import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";
import WorkflowDeleteDialog from "../WorkflowDeleteDialog";
import { useNotificationStore } from "../../../stores/NotificationStore";

const mockDelete = jest.fn();
const mockManager = { delete: mockDelete, removeWorkflow: jest.fn(), openWorkflows: [], currentWorkflowId: null };
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: typeof mockManager) => unknown) => selector(mockManager)
}));

const workflow = {
  id: "0123456789abcdef0123456789abcdef", name: "UX scan fixture", description: "",
  graph: { nodes: [], edges: [] }, tags: [], access: "private" as const,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
};
const wrap = (child: React.ReactNode) => render(
  <ThemeProvider theme={mockTheme}><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{child}</MemoryRouter>
  </QueryClientProvider></ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationStore.getState().clearNotifications();
});

test("failed deletion stays open and offers retry without reporting success", async () => {
  const user = userEvent.setup();
  const onClose = jest.fn();
  mockDelete.mockRejectedValueOnce(new Error("Server unavailable"));
  wrap(<WorkflowDeleteDialog open onClose={onClose} workflowsToDelete={[workflow]} />);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  expect(onClose).not.toHaveBeenCalled();
  expect(mockManager.removeWorkflow).not.toHaveBeenCalled();
  expect(useNotificationStore.getState().notifications).toEqual([
    expect.objectContaining({ type: "error", content: expect.stringContaining("Server unavailable") })
  ]);
  mockDelete.mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(mockManager.removeWorkflow).toHaveBeenCalledWith(workflow.id);
});

test("deletion waits for acceptance and disables duplicate submissions", async () => {
  const user = userEvent.setup();
  const onClose = jest.fn();
  let accept = () => {};
  mockDelete.mockReturnValueOnce(new Promise<void>((resolve) => { accept = resolve; }));
  wrap(<WorkflowDeleteDialog open onClose={onClose} workflowsToDelete={[workflow]} />);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(useNotificationStore.getState().notifications).toEqual([]);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await act(async () => accept());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(useNotificationStore.getState().notifications).toEqual([
    expect.objectContaining({ type: "success", content: "Workflows deleted" })
  ]);
});

test("partial failure removes successful workflows and retries only the failure", async () => {
  const user = userEvent.setup();
  const onClose = jest.fn();
  const secondWorkflow = { ...workflow, id: "fedcba9876543210fedcba9876543210", name: "Second workflow" };
  mockDelete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Server unavailable"));
  wrap(<WorkflowDeleteDialog open onClose={onClose} workflowsToDelete={[workflow, secondWorkflow]} />);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(mockManager.removeWorkflow).toHaveBeenCalledWith(workflow.id));
  expect(screen.queryByText(workflow.name)).not.toBeInTheDocument();
  expect(screen.getByText(secondWorkflow.name)).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  mockDelete.mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(mockDelete).toHaveBeenCalledTimes(3);
  expect(mockDelete).toHaveBeenLastCalledWith(secondWorkflow);
});
