import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useJobReconnection } from "../useJobReconnection";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import useAuth from "../../stores/useAuth";

jest.mock("../../stores/ApiClient");
jest.mock("../../stores/WorkflowRunner");
jest.mock("../../stores/useAuth");

const mockClient = client as jest.Mocked<typeof client>;
const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.MockedFunction<
  typeof getWorkflowRunnerStore
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

const createWrapper = () => TestWrapper;

describe("useJobReconnection", () => {
  const mockWorkflow = {
    id: "workflow-1",
    name: "Test Workflow",
    nodes: [],
    edges: [],
  };

  const mockJobs = [
    {
      type: "job" as const,
      id: "job-1",
      workflow_id: "workflow-1",
      status: "running" as const,
      created_at: "2026-01-22T10:00:00Z",
      run_state: { status: "running" },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseAuth.mockReturnValue({
      user: { id: "test-user" },
      state: "logged_in",
    } as any);
    mockGetWorkflowRunnerStore.mockReturnValue({
      getState: jest.fn().mockReturnValue({
        reconnectWithWorkflow: jest.fn().mockResolvedValue(undefined),
      }),
      setState: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  it("returns running jobs and reconnecting status", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
    expect(result.current.isReconnecting).toBe(true);
  });

  it("reconnects to running jobs on mount", async () => {
    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: mockJobs },
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockWorkflow,
        error: null,
      });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(mockClient.GET).toHaveBeenCalledTimes(2);
    expect(mockClient.GET).toHaveBeenCalledWith("/api/workflows/{id}", {
      params: { path: { id: "workflow-1" } },
    });

    // Check reconnection called
    const store = getWorkflowRunnerStore("workflow-1");
    await waitFor(() => {
        expect(store.getState().reconnectWithWorkflow).toHaveBeenCalledWith("job-1", mockWorkflow);
    });
  });

  it("handles workflow fetch error", async () => {
    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: mockJobs },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { detail: "Workflow not found" },
      });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(mockClient.GET).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect when no running jobs", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: [] },
      error: null,
    });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toEqual([]);
    });

    expect(result.current.isReconnecting).toBe(false);
    expect(mockClient.GET).toHaveBeenCalledTimes(1);
  });

  it("handles suspended jobs with correct initial state", async () => {
    const suspendedJob = [
      {
        type: "job" as const,
        id: "job-1",
        workflow_id: "workflow-1",
        status: "suspended" as const,
        created_at: "2026-01-22T10:00:00Z",
        run_state: {
          status: "suspended",
          suspension_reason: "User paused",
        },
      },
    ];

    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: suspendedJob },
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockWorkflow,
        error: null,
      });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);

    const store = getWorkflowRunnerStore("workflow-1");
    await waitFor(() => {
      expect(store.setState).toHaveBeenCalledWith({
        state: "suspended",
        statusMessage: "User paused",
      });
    });
  });

  it("handles paused jobs with correct initial state", async () => {
    const pausedJob = [
      {
        type: "job" as const,
        id: "job-1",
        workflow_id: "workflow-1",
        status: "paused" as const,
        created_at: "2026-01-22T10:00:00Z",
        run_state: { status: "paused" },
      },
    ];

    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: pausedJob },
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockWorkflow,
        error: null,
      });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);

    const store = getWorkflowRunnerStore("workflow-1");
    await waitFor(() => {
      expect(store.setState).toHaveBeenCalledWith({
        state: "paused",
        statusMessage: "Workflow paused",
      });
    });
  });

  it("only reconnects once on multiple renders", async () => {
    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: mockJobs },
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockWorkflow,
        error: null,
      });

    const { result, rerender } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    const callCount = mockClient.GET.mock.calls.length;

    rerender({});

    await waitFor(() => {});

    expect(mockClient.GET.mock.calls.length).toBe(callCount);
  });

  it("does not reconnect when not authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      state: "logged_out",
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    expect(result.current.runningJobs).toBeUndefined();
    expect(result.current.isReconnecting).toBe(false);
  });

  it("handles multiple running jobs", async () => {
    const multipleJobs = [
      {
        type: "job" as const,
        id: "job-1",
        workflow_id: "workflow-1",
        status: "running" as const,
        created_at: "2026-01-22T10:00:00Z",
        run_state: { status: "running" },
      },
      {
        type: "job" as const,
        id: "job-2",
        workflow_id: "workflow-2",
        status: "running" as const,
        created_at: "2026-01-22T10:05:00Z",
        run_state: { status: "running" },
      },
    ];

    const workflow2 = {
      id: "workflow-2",
      name: "Test Workflow 2",
      nodes: [],
      edges: [],
    };

    mockClient.GET
      .mockResolvedValueOnce({
        data: { jobs: multipleJobs },
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockWorkflow,
        error: null,
      })
      .mockResolvedValueOnce({
        data: workflow2,
        error: null,
      });

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(2);
    expect(mockClient.GET).toHaveBeenCalledTimes(3);

    // Verify both reconnected
    const store = getWorkflowRunnerStore("workflow-1"); // mock returns same object for both calls in implementation
    await waitFor(() => {
        expect(store.getState().reconnectWithWorkflow).toHaveBeenCalledTimes(2);
    });
  });
});
