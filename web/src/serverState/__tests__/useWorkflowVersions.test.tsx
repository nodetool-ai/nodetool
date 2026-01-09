import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWorkflowVersions } from "../useWorkflowVersions";

const mockWorkflowId = "test-workflow-123";

const mockVersions = [
  {
    id: "v1",
    workflow_id: mockWorkflowId,
    version: 1,
    created_at: "2024-01-15T10:00:00Z",
    name: "Initial version",
    description: "First save",
    is_pinned: false,
    save_type: "manual",
    graph: {
      nodes: [{ id: "n1", type: "test.node" }],
      edges: []
    }
  },
  {
    id: "v2",
    workflow_id: mockWorkflowId,
    version: 2,
    created_at: "2024-01-15T11:00:00Z",
    name: "Updated version",
    description: "Second save",
    is_pinned: true,
    save_type: "autosave",
    graph: {
      nodes: [
        { id: "n1", type: "test.node" },
        { id: "n2", type: "test.node2" }
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }]
    }
  }
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useWorkflowVersions", () => {
  beforeEach(() => {
    global.fetch = jest.fn((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/versions") && !urlStr.includes("/pin") && !urlStr.includes("/unpin") && !urlStr.includes("/restore")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            versions: mockVersions,
            next: null
          })
        } as Response);
      }
      if (urlStr.includes("/pin")) {
        const version = parseInt(urlStr.split("/").slice(-2, -1)[0] || "0");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockVersions.find(v => v.version === version),
            is_pinned: true
          })
        } as Response);
      }
      if (urlStr.includes("/unpin")) {
        const version = parseInt(urlStr.split("/").slice(-2, -1)[0] || "0");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockVersions.find(v => v.version === version),
            is_pinned: false
          })
        } as Response);
      }
      if (urlStr.includes("/restore")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        } as Response);
      }
      return Promise.reject(new Error("Unknown endpoint"));
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("pin/unpin functionality", () => {
    it("should return pinVersion and unpinVersion functions", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(typeof result.current.pinVersion).toBe("function");
      expect(typeof result.current.unpinVersion).toBe("function");
    });

    it("should pin a version successfully", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await result.current.pinVersion(1);

      await waitFor(() => {
        expect(result.current.isPinningVersion).toBe(false);
      });
    });

    it("should unpin a version successfully", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await result.current.unpinVersion(2);

      await waitFor(() => {
        expect(result.current.isUnpinningVersion).toBe(false);
      });
    });

    it("should have pin and unpin loading states", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isPinningVersion).toBe(false);
      expect(result.current.isUnpinningVersion).toBe(false);
    });
  });

  describe("version fetching", () => {
    it("should fetch versions successfully", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.versions).toHaveLength(2);
      expect(result.current.data?.versions[0].version).toBe(1);
      expect(result.current.data?.versions[1].version).toBe(2);
    });

    it("should include is_pinned in version data", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const versions = result.current.data?.versions || [];
      expect(versions.find(v => v.version === 1)?.is_pinned).toBe(false);
      expect(versions.find(v => v.version === 2)?.is_pinned).toBe(true);
    });

    it("should handle disabled state when workflowId is null", () => {
      const { result } = renderHook(
        () => useWorkflowVersions(null),
        { wrapper: createWrapper() }
      );

      expect(result.current.fetchStatus).toBe("idle");
    });
  });

  describe("restore functionality", () => {
    it("should restore a version successfully", async () => {
      const { result } = renderHook(
        () => useWorkflowVersions(mockWorkflowId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      await result.current.restoreVersion(1);

      await waitFor(() => {
        expect(result.current.isRestoringVersion).toBe(false);
      });
    });
  });
});
