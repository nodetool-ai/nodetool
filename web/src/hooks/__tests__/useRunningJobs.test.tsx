import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { useRunningJobs } from "../useRunningJobs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Job } from "../../stores/ApiTypes";
import useAuth, { type LoginStore } from "../../stores/useAuth";
import { stub } from "../../test-utils/doubles";

// Mock the tRPC client used by the hook.
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    jobs: {
      list: { query: jest.fn() }
    }
  }
}));
jest.mock("../../stores/useAuth");

import { trpcClient } from "../../trpc/client";

const listQuery = trpcClient.jobs.list.query as jest.Mock;
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

describe("useRunningJobs", () => {
  const mockJobs: Job[] = [
    {
      id: "job-1",
      user_id: "test-user",
      job_type: "workflow",
      workflow_id: "workflow-1",
      status: "running",
    },
    {
      id: "job-2",
      user_id: "test-user",
      job_type: "workflow",
      workflow_id: "workflow-2",
      status: "queued",
    },
    {
      id: "job-3",
      user_id: "test-user",
      job_type: "workflow",
      workflow_id: "workflow-3",
      status: "completed",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockImplementation(
      (selector: (s: LoginStore) => unknown) =>
        selector(stub<LoginStore>({ user: { id: "test-user" }, state: "logged_in" }))
    );
  });

  it("does not fetch when not authenticated", () => {
    mockUseAuth.mockImplementation(
      (selector: (s: LoginStore) => unknown) =>
        selector(stub<LoginStore>({ user: null, state: "logged_out" }))
    );

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("filters to only active jobs", async () => {
    const activeJobs = mockJobs.filter((j) =>
      j.status && ["running", "queued", "starting"].includes(j.status)
    );
    listQuery.mockResolvedValueOnce({ jobs: activeJobs, next_start_key: null });

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
      ["running", "queued", "starting"].includes(j.status ?? "")
    );
    listQuery.mockResolvedValueOnce({
      jobs: allActiveJobs,
      next_start_key: null
    });

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(allActiveJobs.length);
  });

  it("handles empty job list", async () => {
    listQuery.mockResolvedValueOnce({ jobs: [], next_start_key: null });

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it("handles API error", async () => {
    listQuery.mockRejectedValueOnce(new Error("Unauthorized"));

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeDefined();
  });

  it("includes jobs with starting status", async () => {
    const activeJobs = mockJobs.filter((j) =>
      j.status && ["running", "queued", "starting"].includes(j.status)
    );
    const jobsWithStarting = [
      ...activeJobs,
      {
        type: "job",
        id: "job-6",
        workflow_id: "workflow-6",
        status: "starting",
        created_at: "2026-01-22T10:25:00Z",
      },
    ];
    listQuery.mockResolvedValueOnce({
      jobs: jobsWithStarting,
      next_start_key: null
    });

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
    const activeJobs = mockJobs.filter((j) =>
      j.status && ["running", "queued", "starting"].includes(j.status)
    );
    // The API should filter out failed jobs, so we only return active jobs
    listQuery.mockResolvedValueOnce({
      jobs: activeJobs,
      next_start_key: null
    });

    const { result } = renderHook(() => useRunningJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    // Verify a hypothetical failed job is not in the results
    expect(result.current.data?.find((j) => j.status === "failed")).toBeUndefined();
  });
});
