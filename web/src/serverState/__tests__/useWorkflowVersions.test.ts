import { renderHook } from "@testing-library/react";
import { workflowVersionsQueryKey } from "../useWorkflowVersions";

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false
  })),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn()
  }))
}));

import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkflowVersions } from "../useWorkflowVersions";

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

describe("useWorkflowVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null
    } as any);
    mockUseMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false
    } as any);
  });

  describe("workflowVersionsQueryKey", () => {
    it("returns a tuple with workflow id", () => {
      expect(workflowVersionsQueryKey("wf-1")).toEqual([
        "workflow",
        "wf-1",
        "versions"
      ]);
    });

    it("returns different keys for different ids", () => {
      const key1 = workflowVersionsQueryKey("a");
      const key2 = workflowVersionsQueryKey("b");
      expect(key1).not.toEqual(key2);
    });
  });

  describe("useWorkflowVersions hook", () => {
    it("disables the query when workflowId is null", () => {
      renderHook(() => useWorkflowVersions(null));
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it("disables the query when workflowId is undefined", () => {
      renderHook(() => useWorkflowVersions(undefined));
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it("enables the query when workflowId is provided", () => {
      renderHook(() => useWorkflowVersions("wf-123"));
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it("uses the correct query key when workflowId is set", () => {
      renderHook(() => useWorkflowVersions("wf-123"));
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["workflow", "wf-123", "versions"]
        })
      );
    });

    it("uses a placeholder query key when workflowId is null", () => {
      renderHook(() => useWorkflowVersions(null));
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["workflow", "none", "versions"]
        })
      );
    });

    it("creates three mutations (create, restore, delete)", () => {
      renderHook(() => useWorkflowVersions("wf-123"));
      expect(mockUseMutation).toHaveBeenCalledTimes(3);
    });

    it("exposes createVersion, restoreVersion, deleteVersion functions", () => {
      const mutateAsync = jest.fn();
      mockUseMutation.mockReturnValue({
        mutateAsync,
        isPending: false
      } as any);

      const { result } = renderHook(() => useWorkflowVersions("wf-123"));
      expect(result.current.createVersion).toBeDefined();
      expect(result.current.restoreVersion).toBeDefined();
      expect(result.current.deleteVersion).toBeDefined();
    });

    it("exposes pending state for all mutations", () => {
      mockUseMutation.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: true
      } as any);

      const { result } = renderHook(() => useWorkflowVersions("wf-123"));
      expect(result.current.isCreatingVersion).toBe(true);
      expect(result.current.isRestoringVersion).toBe(true);
      expect(result.current.isDeletingVersion).toBe(true);
    });
  });
});
