import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import QueueOverlay from "../QueueOverlay";
import { Job } from "../../../stores/ApiTypes";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";

jest.mock("../../../hooks/useRunningJobs", () => ({
  useRunningJobs: jest.fn()
}));

jest.mock("../../../serverState/useWorkflow", () => ({
  useWorkflow: jest.fn(() => ({ data: { name: "WF" } }))
}));

const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate })
}));

jest.mock("../../../trpc/client", () => ({
  trpcClient: { jobs: { cancel: { mutate: jest.fn().mockResolvedValue({}) } } }
}));

// Mock useWorkflowManager to return currentWorkflowId "wf"
const mockCurrentWorkflowId = { value: "wf" as string | null };
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (s: { currentWorkflowId: string | null }) => unknown) =>
    selector({ currentWorkflowId: mockCurrentWorkflowId.value })
}));

const mockUseRunningJobs = useRunningJobs as unknown as jest.Mock;

const job = (id: string, status: string, workflowId = "wf"): Job =>
  ({
    id,
    user_id: "u",
    job_type: "workflow",
    workflow_id: workflowId,
    status,
    started_at: "2026-05-29T12:00:00Z"
  }) as Job;

const setJobs = (jobs: Job[]) =>
  mockUseRunningJobs.mockReturnValue({ data: jobs, isLoading: false, error: null });

const renderExpanded = () => {
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <QueueOverlay />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /expand queue/i }));
  return result;
};

describe("QueueOverlay — focus behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the WorkflowRunsStore before each test
    useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
    mockCurrentWorkflowId.value = "wf";
  });

  it("running card for current workflow has the focus aria-label", () => {
    setJobs([job("job-1", "running", "wf")]);
    renderExpanded();

    expect(
      screen.getByRole("button", { name: /show run on canvas/i })
    ).toBeInTheDocument();
  });

  it("clicking the card calls setFocusedJob with the workflow + job id", () => {
    setJobs([job("job-1", "running", "wf")]);
    renderExpanded();

    fireEvent.click(screen.getByRole("button", { name: /show run on canvas/i }));

    expect(useWorkflowRunsStore.getState().focusedJob["wf"]).toBe("job-1");
  });

  it("shows 'On canvas' indicator when the card is focused", () => {
    setJobs([job("job-1", "running", "wf")]);
    // Pre-focus job-1
    useWorkflowRunsStore.getState().setFocusedJob("wf", "job-1");

    renderExpanded();

    expect(screen.getByText(/on canvas/i)).toBeInTheDocument();
  });

  it("aria-pressed is true when the card is the focused job", () => {
    setJobs([job("job-1", "running", "wf")]);
    useWorkflowRunsStore.getState().setFocusedJob("wf", "job-1");

    renderExpanded();

    const btn = screen.getByRole("button", { name: /show run on canvas/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("running card for a DIFFERENT workflow has no focus aria-label", () => {
    setJobs([job("job-2", "running", "other")]);
    renderExpanded();

    expect(
      screen.queryByRole("button", { name: /show run on canvas/i })
    ).toBeNull();
  });

  it("clicking focus button does not also trigger stop-run", () => {
    setJobs([job("job-1", "running", "wf")]);
    const { trpcClient } = jest.requireMock("../../../trpc/client");
    renderExpanded();

    fireEvent.click(screen.getByRole("button", { name: /show run on canvas/i }));

    expect(trpcClient.jobs.cancel.mutate).not.toHaveBeenCalled();
  });
});
