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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientProviderWrapper";
  return Wrapper;
};

const createMockResponse = <T,>(data: T, error?: undefined) => ({
  data,
  error,
  response: {} as Response,
});

describe("useJobReconnection", () => {
  const mockWorkflow = {
    id: "workflow-1",
    name: "Test Workflow",
    nodes: [],
    edges: [],
  };

  const mockJobs = [
    {
      id: "job-1",
      user_id: "user-1",
      job_type: "workflow",
      workflow_id: "workflow-1",
      status: "running" as const,
      started_at: "2026-01-22T10:00:00Z",
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
        setState: jest.fn(),
      }),
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  it("returns running jobs and reconnecting status", async () => {
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: mockJobs }));

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
      .mockResolvedValueOnce(createMockResponse({ jobs: mockJobs }))
      .mockResolvedValueOnce(createMockResponse(mockWorkflow));

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
  });

  it("handles workflow fetch error", async () => {
    mockClient.GET
      .mockResolvedValueOnce(createMockResponse({ jobs: mockJobs }))
      .mockResolvedValueOnce({
        data: undefined,
        error: undefined,
        response: {} as Response,
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
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: [] }));

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
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-1",
        status: "suspended" as const,
        started_at: "2026-01-22T10:00:00Z",
        run_state: {
          status: "suspended",
          suspension_reason: "User paused",
        },
      },
    ];

    mockClient.GET
      .mockResolvedValueOnce(createMockResponse({ jobs: suspendedJob }))
      .mockResolvedValueOnce(createMockResponse(mockWorkflow));

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
  });

  it("handles paused jobs with correct initial state", async () => {
    const pausedJob = [
      {
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-1",
        status: "paused" as const,
        started_at: "2026-01-22T10:00:00Z",
        run_state: { status: "paused" },
      },
    ];

    mockClient.GET
      .mockResolvedValueOnce(createMockResponse({ jobs: pausedJob }))
      .mockResolvedValueOnce(createMockResponse(mockWorkflow));

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
  });

  it("only reconnects once on multiple renders", async () => {
    mockClient.GET
      .mockResolvedValueOnce(createMockResponse({ jobs: mockJobs }))
      .mockResolvedValueOnce(createMockResponse(mockWorkflow));

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
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-1",
        status: "running" as const,
        started_at: "2026-01-22T10:00:00Z",
        run_state: { status: "running" },
      },
      {
        id: "job-2",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-2",
        status: "running" as const,
        started_at: "2026-01-22T10:05:00Z",
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
      .mockResolvedValueOnce(createMockResponse({ jobs: multipleJobs }))
      .mockResolvedValueOnce(createMockResponse(mockWorkflow))
      .mockResolvedValueOnce(createMockResponse(workflow2));

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(2);
    expect(mockClient.GET).toHaveBeenCalledTimes(3);
  });
});
