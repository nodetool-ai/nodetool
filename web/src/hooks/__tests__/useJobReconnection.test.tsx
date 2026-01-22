import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useJobReconnection } from "../useJobReconnection";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import useAuth from "../../stores/useAuth";

jest.mock("../../stores/ApiClient");
jest.mock("../../stores/useAuth");

const mockClient = client as jest.Mocked<typeof client>;
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
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
};

describe("useJobReconnection", () => {
  const mockJobs = [
    {
      id: "job-1",
      user_id: "user-1",
      job_type: "workflow",
      status: "running",
      workflow_id: "workflow-1",
      started_at: "2026-01-22T10:00:00Z",
      finished_at: null,
      error: null,
      cost: null,
      run_state: { status: "running", is_resumable: true },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseAuth.mockReturnValue({
      user: { id: "test-user" },
      state: "logged_in",
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  it("returns running jobs when jobs are available", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
    expect(result.current.isReconnecting).toBe(true);
  });

  it("returns empty array when no running jobs", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: [] },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toEqual([]);
    });

    expect(result.current.isReconnecting).toBe(false);
  });

  it("filters suspended jobs", async () => {
    const suspendedJob = [
      {
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        status: "suspended",
        workflow_id: "workflow-1",
        started_at: "2026-01-22T10:00:00Z",
        finished_at: null,
        error: null,
        cost: null,
        run_state: {
          status: "suspended",
          suspension_reason: "User paused",
          is_resumable: true,
        },
      },
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: suspendedJob },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
  });

  it("filters paused jobs", async () => {
    const pausedJob = [
      {
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        status: "paused",
        workflow_id: "workflow-1",
        started_at: "2026-01-22T10:00:00Z",
        finished_at: null,
        error: null,
        cost: null,
        run_state: { status: "paused", is_resumable: true },
      },
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: pausedJob },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(1);
  });

  it("excludes completed jobs", async () => {
    const completedJob = [
      {
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        status: "completed",
        workflow_id: "workflow-1",
        started_at: "2026-01-22T10:00:00Z",
        finished_at: "2026-01-22T10:05:00Z",
        error: null,
        cost: 0.05,
        run_state: { status: "completed", is_resumable: false },
      },
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: completedJob },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(0);
    expect(result.current.isReconnecting).toBe(false);
  });

  it("excludes failed jobs", async () => {
    const failedJob = [
      {
        id: "job-1",
        user_id: "user-1",
        job_type: "workflow",
        status: "failed",
        workflow_id: "workflow-1",
        started_at: "2026-01-22T10:00:00Z",
        finished_at: "2026-01-22T10:01:00Z",
        error: "Execution failed",
        cost: null,
        run_state: { status: "failed", error_message: "Execution failed", is_resumable: false },
      },
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: failedJob },
      error: null,
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeDefined();
    });

    expect(result.current.runningJobs).toHaveLength(0);
    expect(result.current.isReconnecting).toBe(false);
  });

  it("handles API errors gracefully", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: null,
      error: { detail: "Failed to fetch jobs" },
    } as any);

    const { result } = renderHook(() => useJobReconnection(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runningJobs).toBeUndefined();
    });

    expect(result.current.isReconnecting).toBe(false);
  });
});
