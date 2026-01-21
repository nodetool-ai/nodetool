import { renderHook, waitFor } from "@testing-library/react";
import { useJobReconnection } from "../useJobReconnection";
import { useRunningJobs } from "../useRunningJobs";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { client } from "../../stores/ApiClient";
import loglevel from "loglevel";

jest.mock("../useRunningJobs");
jest.mock("../../stores/WorkflowRunner");
jest.mock("../../stores/ApiClient");
jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe("useJobReconnection", () => {
  const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as unknown as jest.Mock;

  let mockRunnerStore: { getState: jest.Mock; setState: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRunnerStore = {
      getState: jest.fn().mockReturnValue({
        reconnectWithWorkflow: jest.fn().mockResolvedValue(undefined),
      }),
      setState: jest.fn(),
    };

    mockGetWorkflowRunnerStore.mockReturnValue(mockRunnerStore);
  });

  describe("initial state", () => {
    it("returns empty runningJobs when no jobs", () => {
      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [],
        isSuccess: true,
      });

      const { result } = renderHook(() => useJobReconnection());

      expect(result.current.runningJobs).toEqual([]);
      expect(result.current.isReconnecting).toBe(false);
    });

    it("returns isReconnecting false when no jobs", () => {
      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [],
        isSuccess: true,
      });

      const { result } = renderHook(() => useJobReconnection());

      expect(result.current.isReconnecting).toBe(false);
    });
  });

  describe("reconnection behavior", () => {
    it("does not reconnect when isSuccess is false", () => {
      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [{ id: "job-1" }],
        isSuccess: false,
      });

      renderHook(() => useJobReconnection());

      expect(mockGetWorkflowRunnerStore).not.toHaveBeenCalled();
      expect(loglevel.info).not.toHaveBeenCalled();
    });

    it("does not reconnect when runningJobs is empty", () => {
      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      expect(mockGetWorkflowRunnerStore).not.toHaveBeenCalled();
    });

    it("reconnects to running jobs when jobs exist", async () => {
      const mockWorkflow = {
        id: "wf-1",
        name: "Test Workflow",
        nodes: [],
        edges: [],
      };

      (client.GET as jest.Mock).mockResolvedValue({
        data: mockWorkflow,
        error: null,
      });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [
          {
            id: "job-1",
            workflow_id: "wf-1",
            status: "running",
          },
        ],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(client.GET).toHaveBeenCalledWith("/api/workflows/{id}", {
          params: { path: { id: "wf-1" } },
        });
      });

      await waitFor(() => {
        expect(mockGetWorkflowRunnerStore).toHaveBeenCalledWith("wf-1");
      });

      await waitFor(() => {
        expect(loglevel.info).toHaveBeenCalledWith(
          expect.stringContaining("Found 1 running job(s), reconnecting..."),
          expect.any(Array)
        );
      });
    });

    it("handles multiple running jobs", async () => {
      const mockWorkflow1 = { id: "wf-1", name: "Workflow 1", nodes: [], edges: [] };
      const mockWorkflow2 = { id: "wf-2", name: "Workflow 2", nodes: [], edges: [] };

      (client.GET as jest.Mock).mockResolvedValueOnce({ data: mockWorkflow1, error: null });
      (client.GET as jest.Mock).mockResolvedValueOnce({ data: mockWorkflow2, error: null });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [
          { id: "job-1", workflow_id: "wf-1", status: "running" },
          { id: "job-2", workflow_id: "wf-2", status: "queued" },
        ],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(client.GET).toHaveBeenCalledTimes(2);
      });
    });

    it("logs error when workflow fetch fails", async () => {
      (client.GET as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [{ id: "job-1", workflow_id: "wf-1", status: "running" }],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(loglevel.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to fetch workflow"),
          expect.any(Object)
        );
      });
    });

    it("logs error on reconnection failure", async () => {
      const mockWorkflow = { id: "wf-1", name: "Test Workflow", nodes: [], edges: [] };

      (client.GET as jest.Mock).mockResolvedValue({
        data: mockWorkflow,
        error: null,
      });

      mockRunnerStore.getState.mockReturnValue({
        reconnectWithWorkflow: jest.fn().mockRejectedValue(new Error("Connection failed")),
      });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [{ id: "job-1", workflow_id: "wf-1", status: "running" }],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(loglevel.error).toHaveBeenCalledWith(
          expect.stringContaining("Error reconnecting to job"),
          expect.any(Error)
        );
      });
    });

    it("handles suspended state correctly", async () => {
      const mockWorkflow = { id: "wf-1", name: "Test Workflow", nodes: [], edges: [] };

      (client.GET as jest.Mock).mockResolvedValue({
        data: mockWorkflow,
        error: null,
      });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [
          {
            id: "job-1",
            workflow_id: "wf-1",
            status: "running",
            run_state: { status: "suspended", suspension_reason: "User paused" },
          },
        ],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(mockRunnerStore.setState).toHaveBeenCalledWith({
          state: "suspended",
          statusMessage: "User paused",
        });
      });
    });

    it("handles paused state correctly", async () => {
      const mockWorkflow = { id: "wf-1", name: "Test Workflow", nodes: [], edges: [] };

      (client.GET as jest.Mock).mockResolvedValue({
        data: mockWorkflow,
        error: null,
      });

      (useRunningJobs as unknown as jest.Mock).mockReturnValue({
        data: [
          {
            id: "job-1",
            workflow_id: "wf-1",
            status: "running",
            run_state: { status: "paused" },
          },
        ],
        isSuccess: true,
      });

      renderHook(() => useJobReconnection());

      await waitFor(() => {
        expect(mockRunnerStore.setState).toHaveBeenCalledWith({
          state: "paused",
          statusMessage: "Workflow paused",
        });
      });
    });
  });
});
