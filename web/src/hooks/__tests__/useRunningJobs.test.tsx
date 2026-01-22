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
  Wrapper.displayName = "QueryClientProviderWrapper";
  return Wrapper;
};

const createMockResponse = <T,>(data: T, error?: undefined) => ({
  data,
  error,
  response: {} as Response,
});

describe("useRunningJobs", () => {
  const mockJobs: Job[] = [
    {
      id: "job-1",
      user_id: "user-1",
      job_type: "workflow",
      workflow_id: "workflow-1",
      status: "running",
      started_at: "2026-01-22T10:00:00Z",
    },
    {
      id: "job-2",
      user_id: "user-1",
      job_type: "workflow",
      workflow_id: "workflow-2",
      status: "queued",
      started_at: "2026-01-22T10:05:00Z",
    },
    {
      id: "job-3",
      user_id: "user-1",
      job_type: "workflow",
      workflow_id: "workflow-3",
      status: "completed",
      started_at: "2026-01-22T10:10:00Z",
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
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: mockJobs }));

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
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: allActiveJobs }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(allActiveJobs.length);
  });

  it("handles empty job list", async () => {
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: [] }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it("handles API error", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: undefined,
      response: new Response(),
    });

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeDefined();
  });

  it("includes jobs with suspended status", async () => {
    const jobsWithSuspended = [
      ...mockJobs,
      {
        id: "job-4",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-4",
        status: "suspended",
        started_at: "2026-01-22T10:15:00Z",
      },
    ];
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: jobsWithSuspended }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.find((j) => j.id === "job-4")).toBeDefined();
  });

  it("includes jobs with paused status", async () => {
    const jobsWithPaused = [
      ...mockJobs,
      {
        id: "job-5",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-5",
        status: "paused",
        started_at: "2026-01-22T10:20:00Z",
      },
    ];
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: jobsWithPaused }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.find((j) => j.id === "job-5")).toBeDefined();
  });

  it("includes jobs with starting status", async () => {
    const jobsWithStarting = [
      ...mockJobs,
      {
        id: "job-6",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-6",
        status: "starting",
        started_at: "2026-01-22T10:25:00Z",
      },
    ];
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: jobsWithStarting }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.find((j) => j.id === "job-6")).toBeDefined();
  });

  it("filters out failed jobs", async () => {
    const jobsWithFailed = [
      ...mockJobs,
      {
        id: "job-7",
        user_id: "user-1",
        job_type: "workflow",
        workflow_id: "workflow-7",
        status: "failed",
        started_at: "2026-01-22T10:30:00Z",
      },
    ];
    mockClient.GET.mockResolvedValueOnce(createMockResponse({ jobs: jobsWithFailed }));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.find((j) => j.id === "job-7")).toBeUndefined();
  });
});
