import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import JobItem from "../JobItem";
import { Job } from "../../../../stores/ApiTypes";
import { useWorkflow } from "../../../../serverState/useWorkflow";
import { useJobAssets } from "../../../../serverState/useJobAssets";
import { getWorkflowRunnerStore } from "../../../../stores/WorkflowRunner";
import { trpcClient } from "../../../../trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

// Mock all external dependencies
jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn()
}));

jest.mock("../../../../serverState/useWorkflow", () => ({
  useWorkflow: jest.fn()
}));

jest.mock("../../../../serverState/useJobAssets", () => ({
  useJobAssets: jest.fn()
}));

jest.mock("../../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn()
}));

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    jobs: {
      cancel: { mutate: jest.fn() }
    }
  }
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn()
}));

jest.mock("../../../../components/assets/AssetGridContent", () => ({
  __esModule: true,
  default: () => null
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

// Test data
const mockWorkflow = {
  id: "workflow-123",
  name: "Test Workflow",
  description: "A test workflow",
  updated_at: "2023-01-01T00:00:00Z",
  graph: { nodes: [], edges: [] },
  thumbnail: "",
  thumbnail_url: "",
  access: "private" as const
};

const baseJob: Job = {
  user_id: "user-123",
  job_type: "workflow",
  is_resumable: false,
  id: "job-123",
  workflow_id: "workflow-123",
  status: "completed",
  started_at: "2023-01-01T12:00:00Z",
  finished_at: "2023-01-01T12:01:30Z",
  error: null
};

const mockNavigate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRunnerStore = {
  getState: jest.fn(() => ({ job_id: "job-123", cancel: jest.fn() }))
};

// Type casting for mocks
const mockUseWorkflow = useWorkflow as jest.MockedFunction<typeof useWorkflow>;
const mockUseJobAssets = useJobAssets as jest.MockedFunction<typeof useJobAssets>;
const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.MockedFunction<typeof getWorkflowRunnerStore>;
const mockCancelJob = trpcClient.jobs.cancel.mutate as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;

describe("JobItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup default mock implementations
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);

    mockUseWorkflow.mockReturnValue({ data: mockWorkflow } as any);
    mockUseJobAssets.mockReturnValue({ data: [], isLoading: false, error: null } as any);
    mockGetWorkflowRunnerStore.mockReturnValue(mockRunnerStore as any);
    mockCancelJob.mockResolvedValue({} as any);
    mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries } as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("formatDuration utility", () => {
    it("formats milliseconds correctly", () => {
      renderWithTheme(<JobItem job={{ ...baseJob, status: "completed", started_at: "2023-01-01T12:00:00Z", finished_at: "2023-01-01T12:00:00.500Z" }} />);
      expect(screen.getByText(/500ms/)).toBeInTheDocument();
    });

    it("formats seconds with milliseconds", () => {
      renderWithTheme(<JobItem job={{ ...baseJob, status: "completed", started_at: "2023-01-01T12:00:00Z", finished_at: "2023-01-01T12:00:01.250Z" }} />);
      expect(screen.getByText(/1\.25s/)).toBeInTheDocument();
    });

    it("formats minutes and seconds", () => {
      renderWithTheme(<JobItem job={{ ...baseJob, status: "completed", started_at: "2023-01-01T12:00:00Z", finished_at: "2023-01-01T12:02:30Z" }} />);
      expect(screen.getByText(/2m 30s/)).toBeInTheDocument();
    });

    it("formats hours and minutes", () => {
      renderWithTheme(<JobItem job={{ ...baseJob, status: "completed", started_at: "2023-01-01T12:00:00Z", finished_at: "2023-01-01T14:35:00Z" }} />);
      expect(screen.getByText(/2h 35m/)).toBeInTheDocument();
    });
  });

  describe("Job status display", () => {
    it("displays running status with elapsed time", () => {
      const runningJob = { ...baseJob, status: "running" as const, started_at: new Date(Date.now() - 5000).toISOString(), finished_at: null };
      renderWithTheme(<JobItem job={runningJob} />);
      expect(screen.getByText(/Running/)).toBeInTheDocument();
    });

    it("displays queued status", () => {
      const queuedJob = { ...baseJob, status: "queued" as const, started_at: null, finished_at: null };
      renderWithTheme(<JobItem job={queuedJob} />);
      expect(screen.getByText("Queued")).toBeInTheDocument();
    });

    it("displays starting status", () => {
      const startingJob = { ...baseJob, status: "starting" as const, started_at: null, finished_at: null };
      renderWithTheme(<JobItem job={startingJob} />);
      expect(screen.getByText("Starting...")).toBeInTheDocument();
    });

    it("displays cancelled status", () => {
      const cancelledJob = { ...baseJob, status: "cancelled" as const, started_at: "2023-01-01T12:00:00Z", finished_at: "2023-01-01T12:00:30Z" };
      renderWithTheme(<JobItem job={cancelledJob} />);
      expect(screen.getByText("Cancelled")).toBeInTheDocument();
    });

    it("displays error when present", () => {
      const errorJob = { ...baseJob, status: "failed" as const, error: "Something went wrong" };
      renderWithTheme(<JobItem job={errorJob} />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("displays workflow name", () => {
      renderWithTheme(<JobItem job={baseJob} />);
      expect(screen.getByText("Test Workflow")).toBeInTheDocument();
    });

    it("displays loading text when workflow is not loaded", () => {
      mockUseWorkflow.mockReturnValue({ data: null } as any);
      renderWithTheme(<JobItem job={baseJob} />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("Job interactions", () => {
    it("navigates to workflow when clicked", () => {
      renderWithTheme(<JobItem job={baseJob} />);
      fireEvent.click(screen.getByText("Test Workflow"));
      expect(mockNavigate).toHaveBeenCalledWith("/editor/workflow-123");
    });
  });

  describe("Job cancellation", () => {
    it("shows stop button for running jobs", () => {
      const runningJob = { ...baseJob, status: "running" as const, started_at: "2023-01-01T12:00:00Z", finished_at: null };
      renderWithTheme(<JobItem job={runningJob} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(1);
    });

    it("shows stop button for queued jobs", () => {
      const queuedJob = { ...baseJob, status: "queued" as const, started_at: null, finished_at: null };
      renderWithTheme(<JobItem job={queuedJob} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(1);
    });
  });

  describe("Elapsed time updates", () => {
    it("updates elapsed time for running jobs", () => {
      const runningJob = { ...baseJob, status: "running" as const, started_at: new Date(Date.now() - 1000).toISOString(), finished_at: null };
      renderWithTheme(<JobItem job={runningJob} />);

      expect(screen.getByText(/Running/)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByText(/Running/)).toBeInTheDocument();
    });

    it("does not update elapsed time for completed jobs", () => {
      renderWithTheme(<JobItem job={baseJob} />);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.getByText("completed")).toBeInTheDocument();
    });
  });

  describe("Status icons", () => {
    it("shows error icon when job has error", () => {
      const errorJob = { ...baseJob, status: "failed" as const, error: "Test error" };
      renderWithTheme(<JobItem job={errorJob} />);
      const errorIcon = document.querySelector("svg");
      expect(errorIcon).toBeTruthy();
    });

    it("shows progress icon for running jobs", () => {
      const runningJob = { ...baseJob, status: "running" as const };
      renderWithTheme(<JobItem job={runningJob} />);
      const icons = document.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe("Edge cases", () => {
    it("handles invalid start date gracefully", () => {
      const invalidJob = { ...baseJob, started_at: "invalid-date", finished_at: null };
      renderWithTheme(<JobItem job={invalidJob} />);
      expect(screen.getByText("Test Workflow")).toBeInTheDocument();
    });

    it("handles missing start date", () => {
      const noStartJob = { ...baseJob, started_at: null, finished_at: null };
      renderWithTheme(<JobItem job={noStartJob} />);
      expect(screen.getByText("Test Workflow")).toBeInTheDocument();
    });

    it("handles negative duration", () => {
      const negativeDurationJob = {
        ...baseJob,
        started_at: "2023-01-01T12:01:00Z",
        finished_at: "2023-01-01T12:00:00Z"
      };
      renderWithTheme(<JobItem job={negativeDurationJob} />);
      expect(screen.getByText("Test Workflow")).toBeInTheDocument();
    });
  });
});
