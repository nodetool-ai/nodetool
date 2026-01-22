import { renderHook, waitFor } from "@testing-library/react";
import { useRunningJobs } from "../useRunningJobs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Job } from "../../stores/ApiTypes";
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

describe("useRunningJobs", () => {
  const mockJobs: Job[] = [
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
    {
      id: "job-2",
      user_id: "user-1",
      job_type: "workflow",
      status: "queued",
      workflow_id: "workflow-2",
      started_at: "2026-01-22T10:05:00Z",
      finished_at: null,
      error: null,
      cost: null,
      run_state: { status: "queued", is_resumable: true },
    },
    {
      id: "job-3",
      user_id: "user-1",
      job_type: "workflow",
      status: "completed",
      workflow_id: "workflow-3",
      started_at: "2026-01-22T10:10:00Z",
      finished_at: "2026-01-22T10:15:00Z",
      error: null,
      cost: 0.05,
      run_state: { status: "completed", is_resumable: false },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "test-user" },
      state: "logged_in",
    } as any);
  });

  it("does not fetch when not authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      state: "logged_out",
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("filters to only active jobs", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map((j) => j.id)).toEqual(["job-1", "job-2"]);
    expect(result.current.data?.find((j) => j.id === "job-3")).toBeUndefined();
  });

  it("returns all jobs when all are active", async () => {
    const allActiveJobs = mockJobs.filter((j) =>
      ["running", "queued", "starting", "suspended", "paused"].includes(j.status)
    );
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: allActiveJobs },
      error: null,
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(allActiveJobs.length);
  });

  it("handles empty job list", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: [] },
      error: null,
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it("handles API errors", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: null,
      error: { detail: "Failed to fetch jobs" },
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("filters jobs by status correctly", async () => {
    const runningOnly = mockJobs.filter((j) => j.status === "running");
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: runningOnly },
      error: null,
    } as any);

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe("job-1");
  });
});
