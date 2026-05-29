import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import QueueOverlay from "../QueueOverlay";
import { Job } from "../../../stores/ApiTypes";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { trpcClient } from "../../../trpc/client";

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

const mockUseRunningJobs = useRunningJobs as unknown as jest.Mock;
const mockCancel = trpcClient.jobs.cancel.mutate as jest.Mock;

const job = (id: string, status: string): Job =>
  ({
    id,
    user_id: "u",
    job_type: "workflow",
    workflow_id: `wf-${id}`,
    status,
    started_at: "2026-05-29T12:00:00Z"
  }) as Job;

const setJobs = (jobs: Job[]) =>
  mockUseRunningJobs.mockReturnValue({ data: jobs, isLoading: false, error: null });

const renderOverlay = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueueOverlay />
    </ThemeProvider>
  );

describe("QueueOverlay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when there are no running or queued jobs", () => {
    setJobs([job("a", "completed")]);
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed: summarizes a single running job", () => {
    setJobs([job("a", "running")]);
    renderOverlay();
    expect(screen.getByText("WF")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand queue/i })
    ).toBeInTheDocument();
  });

  it("collapsed: shows count of many running jobs and queued total", () => {
    setJobs([
      job("a", "running"),
      job("b", "running"),
      job("c", "queued"),
      job("d", "scheduled")
    ]);
    renderOverlay();
    expect(screen.getByText("2 jobs running")).toBeInTheDocument();
    expect(screen.getByText("2 queued")).toBeInTheDocument();
  });

  it("expands into Running and Enqueued sections", () => {
    setJobs([job("a", "running"), job("c", "queued")]);
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: /expand queue/i }));

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Enqueued")).toBeInTheDocument();
    // collapse control is now available
    expect(
      screen.getByRole("button", { name: /collapse queue/i })
    ).toBeInTheDocument();
  });

  it("shows cancelled jobs in a Cancelled section alongside active work", () => {
    setJobs([job("a", "running"), job("x", "cancelled")]);
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: /expand queue/i }));

    // The section label and the per-card status tag both read "Cancelled".
    expect(screen.getAllByText("Cancelled")).toHaveLength(2);
  });

  it("stays hidden when only cancelled jobs exist (no active work)", () => {
    setJobs([job("x", "cancelled")]);
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("cancels a running job from the expanded view", async () => {
    setJobs([job("a", "running")]);
    renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: /expand queue/i }));

    fireEvent.click(screen.getByRole("button", { name: /stop run/i }));

    expect(mockCancel).toHaveBeenCalledWith({ id: "a" });
  });

  it("removes a queued job from the expanded view", () => {
    setJobs([job("a", "running"), job("c", "queued")]);
    renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: /expand queue/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /remove from queue/i })
    );

    expect(mockCancel).toHaveBeenCalledWith({ id: "c" });
  });
});
