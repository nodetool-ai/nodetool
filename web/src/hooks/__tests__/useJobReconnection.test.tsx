import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useJobReconnection } from "../useJobReconnection";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { trpcClient } from "../../trpc/client";

jest.mock("../../stores/WorkflowRunner");
jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceList: { query: jest.fn() },
      ollama: { query: jest.fn() },
      providers: { query: jest.fn() }
    }
  }
}));
jest.mock("../../lib/env", () => ({
  isLocalhost: true,
  isDevelopment: true,
  isProduction: false,
  isElectron: false,
  setForceLocalhost: jest.fn()
}));
jest.mock("../../lib/auth", () => ({
  authHeader: jest.fn(async () => ({}))
}));
jest.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    jobs: { list: { query: jest.fn() } },
    workflows: { get: { query: jest.fn() } }
  }
}));

// Mock useAuth as a Zustand-like store that applies selectors
let mockAuthState: Record<string, unknown> = {};
const mockUseAuthImpl = (selector?: (state: Record<string, unknown>) => unknown) =>
  selector ? selector(mockAuthState) : mockAuthState;
jest.mock("../../stores/useAuth", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseAuthImpl(args[0] as (state: Record<string, unknown>) => unknown),
  useAuth: (...args: unknown[]) => mockUseAuthImpl(args[0] as (state: Record<string, unknown>) => unknown),
}));

const mockJobsListQuery = trpcClient.jobs.list.query as unknown as jest.Mock;
const mockWorkflowGetQuery = trpcClient.workflows.get.query as unknown as jest.Mock;
const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.MockedFunction<
  typeof getWorkflowRunnerStore
>;

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
    mockAuthState = {
      user: { id: "test-user" },
      state: "logged_in",
    };
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
    mockJobsListQuery.mockResolvedValueOnce({ jobs: mockJobs } as never);

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
    mockJobsListQuery.mockResolvedValueOnce({ jobs: mockJobs } as never);
    mockWorkflowGetQuery.mockResolvedValueOnce(mockWorkflow as never);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(mockJobsListQuery).toHaveBeenCalled();
    expect(mockWorkflowGetQuery).toHaveBeenCalledWith({ id: "workflow-1" });

    // Check reconnection called
    const store = getWorkflowRunnerStore("workflow-1");
    await waitFor(() => {
        expect(store.getState().reconnectWithWorkflow).toHaveBeenCalledWith("job-1", mockWorkflow);
    });
  });

  it("handles workflow fetch error", async () => {
    mockJobsListQuery.mockResolvedValueOnce({ jobs: mockJobs } as never);
    mockWorkflowGetQuery.mockRejectedValueOnce(new Error("Workflow not found"));

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(mockJobsListQuery).toHaveBeenCalled();
    expect(mockWorkflowGetQuery).toHaveBeenCalledWith({ id: "workflow-1" });
  });

  it("does not reconnect when no running jobs", async () => {
    mockJobsListQuery.mockResolvedValueOnce({ jobs: [] } as never);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toEqual([]);
    });

    expect(result.current.isReconnecting).toBe(false);
    expect(mockJobsListQuery).toHaveBeenCalledTimes(1);
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

    mockJobsListQuery.mockResolvedValueOnce({ jobs: suspendedJob } as never);
    mockWorkflowGetQuery.mockResolvedValueOnce(mockWorkflow as never);

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

    mockJobsListQuery.mockResolvedValueOnce({ jobs: pausedJob } as never);
    mockWorkflowGetQuery.mockResolvedValueOnce(mockWorkflow as never);

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
    mockJobsListQuery.mockResolvedValueOnce({ jobs: mockJobs } as never);
    mockWorkflowGetQuery.mockResolvedValueOnce(mockWorkflow as never);

    const { result, rerender } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    const callCount = mockWorkflowGetQuery.mock.calls.length;

    rerender({});

    await waitFor(() => {});

    expect(mockWorkflowGetQuery.mock.calls.length).toBe(callCount);
  });

  it("does not reconnect when not authenticated", () => {
    mockAuthState = {
      user: null,
      state: "logged_out",
    };

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

    mockJobsListQuery.mockResolvedValueOnce({ jobs: multipleJobs } as never);
    mockWorkflowGetQuery
      .mockResolvedValueOnce(mockWorkflow as never)
      .mockResolvedValueOnce(workflow2 as never);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(2);
    expect(mockJobsListQuery).toHaveBeenCalledTimes(1);
    expect(mockWorkflowGetQuery).toHaveBeenCalledTimes(2);

    // Verify both reconnected
    const store = getWorkflowRunnerStore("workflow-1"); // mock returns same object for both calls in implementation
    await waitFor(() => {
        expect(store.getState().reconnectWithWorkflow).toHaveBeenCalledTimes(2);
    });
  });
});
