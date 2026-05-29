import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import QueuePanel from "../QueuePanel";
import { Job } from "../../../../stores/ApiTypes";
import { useRunningJobs } from "../../../../hooks/useRunningJobs";

jest.mock("../../../../hooks/useRunningJobs", () => ({
  useRunningJobs: jest.fn()
}));

// Render each job as a simple row so we test QueuePanel's bucketing into
// columns, not JobItem internals.
jest.mock("../JobItem", () => ({
  __esModule: true,
  default: ({ job }: { job: Job }) => (
    <div data-testid="job-row" data-status={job.status}>
      {job.id}
    </div>
  )
}));

const mockUseRunningJobs = useRunningJobs as unknown as jest.Mock;

const job = (id: string, status: string): Job =>
  ({
    id,
    user_id: "u",
    job_type: "workflow",
    workflow_id: "wf",
    status,
    started_at: null
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

const column = (name: string) =>
  within(screen.getByRole("region", { name }));

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

  it("renders four lifecycle columns", () => {
    setJobs([]);
    renderPanel();
    expect(screen.getByRole("region", { name: "Running" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Queued" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Completed" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Cancelled" })
    ).toBeInTheDocument();
  });

  it("places each job in its lifecycle column", () => {
    setJobs([
      job("a", "running"),
      job("b", "queued"),
      job("c", "completed"),
      job("d", "cancelled")
    ]);
    renderPanel();

    const running = column("Running").getAllByTestId("job-row");
    expect(running).toHaveLength(1);
    expect(running[0]).toHaveAttribute("data-status", "running");

    const queued = column("Queued").getAllByTestId("job-row");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toHaveAttribute("data-status", "queued");

    const completed = column("Completed").getAllByTestId("job-row");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toHaveAttribute("data-status", "completed");

    const cancelled = column("Cancelled").getAllByTestId("job-row");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toHaveAttribute("data-status", "cancelled");
  });

  it("groups starting/scheduled with queued, failed with completed, and cancelled on its own", () => {
    setJobs([
      job("a", "starting"),
      job("s", "scheduled"),
      job("b", "failed"),
      job("c", "cancelled")
    ]);
    renderPanel();

    expect(column("Queued").getAllByTestId("job-row")).toHaveLength(2);
    expect(column("Completed").getAllByTestId("job-row")).toHaveLength(1);
    expect(column("Cancelled").getAllByTestId("job-row")).toHaveLength(1);
    expect(column("Running").queryAllByTestId("job-row")).toHaveLength(0);
  });

  it("shows the empty text for columns with no jobs", () => {
    setJobs([job("a", "running")]);
    renderPanel();
    expect(column("Queued").getByText("Queue is empty")).toBeInTheDocument();
    expect(
      column("Completed").getByText("No completed jobs")
    ).toBeInTheDocument();
    expect(
      column("Cancelled").getByText("Nothing cancelled")
    ).toBeInTheDocument();
  });
});
