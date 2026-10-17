import { renderHook } from "@testing-library/react";
import { asMock, stub } from "../../test-utils/doubles";

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useMutation: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() }))
}));

const mockSetData = jest.fn();
const mockInvalidateGet = jest.fn();
const mockListQuery = jest.fn();
const mockCreate = jest.fn();
const mockRestore = jest.fn();
const mockDelete = jest.fn();

jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      timeline: { get: { setData: mockSetData, invalidate: mockInvalidateGet } }
    })
  },
  trpcClient: {
    timeline: {
      versions: {
        list: { query: (...args: unknown[]) => mockListQuery(...args) },
        create: { mutate: (...args: unknown[]) => mockCreate(...args) },
        restore: { mutate: (...args: unknown[]) => mockRestore(...args) },
        delete: { mutate: (...args: unknown[]) => mockDelete(...args) }
      }
    }
  }
}));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  timelineVersionsQueryKey,
  useTimelineVersions
} from "../useTimelineVersions";

const mockUseQuery = jest.mocked(useQuery);
const mockUseMutation = jest.mocked(useMutation);
const mockUseQueryClient = jest.mocked(useQueryClient);

const invalidateQueries = jest.fn();

describe("useTimelineVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(
      stub<ReturnType<typeof useQuery>>({
        data: undefined,
        isLoading: false,
        error: null
      })
    );
    mockUseMutation.mockReturnValue(
      stub<ReturnType<typeof useMutation>>({
        mutateAsync: jest.fn(),
        isPending: false
      })
    );
    mockUseQueryClient.mockReturnValue(
      stub<ReturnType<typeof useQueryClient>>({ invalidateQueries })
    );
  });

  describe("timelineVersionsQueryKey", () => {
    it("keys on timeline id, limit, and save type", () => {
      expect(timelineVersionsQueryKey("t-1")).toEqual([
        "timeline",
        "t-1",
        "versions",
        100,
        "all"
      ]);
      expect(timelineVersionsQueryKey("t-1", 20, "manual")).toEqual([
        "timeline",
        "t-1",
        "versions",
        20,
        "manual"
      ]);
    });

    it("differs per timeline", () => {
      expect(timelineVersionsQueryKey("a")).not.toEqual(
        timelineVersionsQueryKey("b")
      );
    });
  });

  it("disables the query without a timeline id", () => {
    renderHook(() => useTimelineVersions(null));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        queryKey: ["timeline", "none", "versions", 100, "all"]
      })
    );
  });

  it("enables the query and keys it on the id", () => {
    renderHook(() => useTimelineVersions("t-1"));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        staleTime: 30_000,
        queryKey: ["timeline", "t-1", "versions", 100, "all"]
      })
    );
  });

  it("fetches the list through trpc with limit and saveType", async () => {
    renderHook(() => useTimelineVersions("t-1", { limit: 5, saveType: "manual" }));
    const { queryFn } = asMock(useQuery).mock.calls[0][0];
    await queryFn();
    expect(mockListQuery).toHaveBeenCalledWith({
      id: "t-1",
      limit: 5,
      saveType: "manual"
    });
  });

  it("creates three mutations", () => {
    renderHook(() => useTimelineVersions("t-1"));
    expect(mockUseMutation).toHaveBeenCalledTimes(3);
  });

  it("exposes the mutation wrappers and pending flags", () => {
    mockUseMutation.mockReturnValue(
      stub<ReturnType<typeof useMutation>>({
        mutateAsync: jest.fn(),
        isPending: true
      })
    );
    const { result } = renderHook(() => useTimelineVersions("t-1"));
    expect(result.current.createVersion).toBeDefined();
    expect(result.current.restoreVersion).toBeDefined();
    expect(result.current.deleteVersion).toBeDefined();
    expect(result.current.isCreatingVersion).toBe(true);
    expect(result.current.isRestoringVersion).toBe(true);
    expect(result.current.isDeletingVersion).toBe(true);
    expect(result.current.versions).toEqual([]);
  });

  it("trims a blank version name to undefined on create", async () => {
    renderHook(() => useTimelineVersions("t-1"));
    const createOptions = asMock(useMutation).mock.calls[0][0];
    await createOptions.mutationFn("   ");
    expect(mockCreate).toHaveBeenCalledWith({ id: "t-1", name: undefined });
    await createOptions.mutationFn("  before the cut  ");
    expect(mockCreate).toHaveBeenLastCalledWith({
      id: "t-1",
      name: "before the cut"
    });
  });

  it("invalidates the versions prefix after create", () => {
    renderHook(() => useTimelineVersions("t-1"));
    const createOptions = asMock(useMutation).mock.calls[0][0];
    createOptions.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["timeline", "t-1", "versions"]
    });
  });

  it("restore seeds the timeline.get cache and invalidates both", async () => {
    renderHook(() => useTimelineVersions("t-1"));
    const restoreOptions = asMock(useMutation).mock.calls[1][0];
    await restoreOptions.mutationFn(3);
    expect(mockRestore).toHaveBeenCalledWith({ id: "t-1", version: 3 });

    const restored = { id: "t-1", name: "seq", updatedAt: "2026-01-01" };
    restoreOptions.onSuccess(restored);
    expect(mockSetData).toHaveBeenCalledWith({ id: "t-1" }, restored);
    expect(mockInvalidateGet).toHaveBeenCalledWith({ id: "t-1" });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["timeline", "t-1", "versions"]
    });
  });

  it("deletes by version number and invalidates", async () => {
    renderHook(() => useTimelineVersions("t-1"));
    const deleteOptions = asMock(useMutation).mock.calls[2][0];
    await deleteOptions.mutationFn(2);
    expect(mockDelete).toHaveBeenCalledWith({ id: "t-1", version: 2 });
    deleteOptions.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["timeline", "t-1", "versions"]
    });
  });
});
