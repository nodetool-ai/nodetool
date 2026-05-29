import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import QueuePanel from "../QueuePanel";
import { Job } from "../../../../stores/ApiTypes";
import { useRunningJobs } from "../../../../hooks/useRunningJobs";

jest.mock("../../../../hooks/useRunningJobs", () => ({
  useRunningJobs: jest.fn()
}));

// Render each job as a simple row so we test QueuePanel's filtering/sorting,
// not JobItem internals.
jest.mock("../JobItem", () => ({
  __esModule: true,
  default: ({ job }: { job: Job }) => (
    <div data-testid="job-row" data-status={job.status}>
      {job.id}
    </div>
  )
}));

const mockUseRunningJobs = useRunningJobs as unknown as jest.Mock;

const job = (id: string, status: string, startedAt: string): Job =>
  ({
    id,
    user_id: "u",
    job_type: "workflow",
    is_resumable: false,
    workflow_id: "wf",
    status,
    started_at: startedAt
  }) as Job;

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueuePanel />
    </ThemeProvider>
  );

const setJobs = (jobs: Job[]) =>
  mockUseRunningJobs.mockReturnValue({
    data: jobs,
    isLoading: false,
    error: null
  });

describe("QueuePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading spinner while jobs load", () => {
    mockUseRunningJobs.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });
    renderPanel();
    expect(screen.queryAllByTestId("job-row")).toHaveLength(0);
  });

  it("renders all jobs on the All tab with running/queued counts", () => {
    setJobs([
      job("a", "running", "2026-05-29T11:00:00Z"),
      job("b", "queued", "2026-05-29T11:01:00Z"),
      job("c", "completed", "2026-05-29T10:00:00Z")
    ]);
    renderPanel();
    expect(screen.getAllByTestId("job-row")).toHaveLength(3);
    expect(screen.getByText("1 running · 1 queued")).toBeInTheDocument();
  });

  it("filters to running jobs on the Running tab", () => {
    setJobs([
      job("a", "running", "2026-05-29T11:00:00Z"),
      job("b", "queued", "2026-05-29T11:01:00Z"),
      job("c", "completed", "2026-05-29T10:00:00Z")
    ]);
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Running" }));
    const rows = screen.getAllByTestId("job-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-status", "running");
  });

  it("filters to queued jobs on the Queued tab", () => {
    setJobs([
      job("a", "running", "2026-05-29T11:00:00Z"),
      job("b", "queued", "2026-05-29T11:01:00Z")
    ]);
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Queued" }));
    const rows = screen.getAllByTestId("job-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-status", "queued");
  });

  it("shows an empty message when no jobs match", () => {
    setJobs([job("c", "completed", "2026-05-29T10:00:00Z")]);
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Queued" }));
    expect(screen.getByText("No queued jobs")).toBeInTheDocument();
  });

  it("shows the empty-queue message with no jobs at all", () => {
    setJobs([]);
    renderPanel();
    expect(screen.getByText("No jobs in the queue")).toBeInTheDocument();
  });
});
