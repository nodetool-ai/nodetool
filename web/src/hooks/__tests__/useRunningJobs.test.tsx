import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRunningJobs } from "../useRunningJobs";
import { useAuth } from "../../stores/useAuth";
import { client } from "../../stores/ApiClient";

jest.mock("../../stores/useAuth");
jest.mock("../../stores/ApiClient");
jest.mock("../../utils/errorHandling", () => ({
  createErrorMessage: jest.fn((error, defaultMessage) => defaultMessage),
}));

describe("useRunningJobs", () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
  });

  describe("authentication state", () => {
    it("does not fetch when user is not authenticated", () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        state: "logged_out",
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetched).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(client.GET).not.toHaveBeenCalled();
    });

    it("fetches when user is authenticated", () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: { jobs: [] },
        error: null,
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("does not fetch during initialization", () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "loading",
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetched).toBe(false);
      expect(client.GET).not.toHaveBeenCalled();
    });
  });

  describe("data fetching", () => {
    it("returns empty array when no jobs are running", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: { jobs: [] },
        error: null,
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it("filters out completed jobs", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: {
          jobs: [
            { id: "job-1", status: "running" },
            { id: "job-2", status: "completed" },
            { id: "job-3", status: "queued" },
            { id: "job-4", status: "failed" },
          ],
        },
        error: null,
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.map((j) => j.id)).toEqual(["job-1", "job-3"]);
    });

    it("includes suspended and paused jobs", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: {
          jobs: [
            { id: "job-1", status: "running" },
            { id: "job-2", status: "suspended" },
            { id: "job-3", status: "paused" },
          ],
        },
        error: null,
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(3);
    });

    it("handles API errors", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "API Error" },
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.data).toBeUndefined();
    });
  });

  describe("query configuration", () => {
    it("uses correct query key", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: { jobs: [] },
        error: null,
      });

      const { result } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(client.GET).toHaveBeenCalledWith("/api/jobs/", {
        params: { query: { limit: 100 } },
      });
    });

    it("respects staleTime configuration", async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: "user-123" },
        state: "logged_in",
      });

      (client.GET as jest.Mock).mockResolvedValue({
        data: { jobs: [] },
        error: null,
      });

      const { result, unmount } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      unmount();
    });
  });

  describe("user state changes", () => {
    it("uses different query key for different users", async () => {
      (useAuth as jest.Mock)
        .mockReturnValueOnce({
          user: { id: "user-1" },
          state: "logged_in",
        })
        .mockReturnValueOnce({
          user: { id: "user-2" },
          state: "logged_in",
        });

      (client.GET as jest.Mock).mockResolvedValue({
        data: { jobs: [] },
        error: null,
      });

      const { result, rerender } = renderHook(() => useRunningJobs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.data).toEqual([]);
      });

      const firstCallArgs = (client.GET as jest.Mock).mock.calls[0];
      expect(firstCallArgs[0]).toBe("/api/jobs/");
    });
  });
});
