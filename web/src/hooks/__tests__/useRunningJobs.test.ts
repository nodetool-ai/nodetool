import { renderHook, waitFor } from "@testing-library/react";
import { useRunningJobs } from "../useRunningJobs";
import { Job } from "../stores/ApiTypes";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn(),
  },
}));

jest.mock("../../stores/useAuth", () => ({
  useAuth: jest.fn((selector) =>
    selector({
      user: { id: "user-1" },
      state: "logged_in",
    })
  ),
}));

jest.mock("../../utils/errorHandling", () => ({
  createErrorMessage: jest.fn((error, defaultMessage) => defaultMessage),
}));

const mockClient = jest.requireMock("../../stores/ApiClient").client;

const createMockJob = (id: string, status: string): Job => ({
  id,
  status,
  workflow_id: "workflow-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe("useRunningJobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches running jobs on mount when authenticated", async () => {
    const mockJobs: Job[] = [
      createMockJob("job-1", "running"),
      createMockJob("job-2", "queued"),
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].status).toBe("running");
    expect(result.current.data?.[1].status).toBe("queued");
  });

  it("filters out completed jobs", async () => {
    const mockJobs: Job[] = [
      createMockJob("job-1", "running"),
      createMockJob("job-2", "completed"),
      createMockJob("job-3", "queued"),
      createMockJob("job-4", "failed"),
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.find((j) => j.id === "job-2")).toBeUndefined();
    expect(result.current.data?.find((j) => j.id === "job-4")).toBeUndefined();
  });

  it("includes suspended and paused jobs", async () => {
    const mockJobs: Job[] = [
      createMockJob("job-1", "suspended"),
      createMockJob("job-2", "paused"),
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].status).toBe("suspended");
    expect(result.current.data?.[1].status).toBe("paused");
  });

  it("returns empty array when no active jobs", async () => {
    const mockJobs: Job[] = [
      createMockJob("job-1", "completed"),
      createMockJob("job-2", "failed"),
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it("handles API error", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: null,
      error: { detail: "API Error" },
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeDefined();
  });

  it("does not fetch when not authenticated", () => {
    jest.mock("../stores/useAuth", () => ({
      useAuth: jest.fn((selector) =>
        selector({
          user: null,
          state: "logged_out",
        })
      ),
    }));

    const { result } = renderHook(() => useRunningJobs());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockClient.GET).not.toHaveBeenCalled();
  });

  it("uses correct query key", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: [] },
      error: null,
    });

    renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(mockClient.GET).toHaveBeenCalledWith("/api/jobs/", {
        params: { query: { limit: 100 } },
      });
    });
  });

  it("refetches on mount", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: [createMockJob("job-1", "running")] },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(mockClient.GET).toHaveBeenCalledTimes(1);
  });

  it("returns correct data structure", async () => {
    const mockJobs: Job[] = [
      createMockJob("job-1", "running"),
    ];

    mockClient.GET.mockResolvedValueOnce({
      data: { jobs: mockJobs },
      error: null,
    });

    const { result } = renderHook(() => useRunningJobs());

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(Array.isArray(result.current.data)).toBe(true);
  });
});
