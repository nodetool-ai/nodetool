/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { workflowQueryKey, fetchWorkflowById, useWorkflow } from "../useWorkflow";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      get: {
        query: jest.fn(),
      },
    },
  },
}));

import { trpcClient } from "../../trpc/client";

const mockQuery = trpcClient.workflows.get.query as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("workflowQueryKey", () => {
  it("returns a tuple with 'workflow' and the id", () => {
    expect(workflowQueryKey("abc-123")).toEqual(["workflow", "abc-123"]);
  });

  it("returns a readonly tuple", () => {
    const key = workflowQueryKey("test");
    expect(key[0]).toBe("workflow");
    expect(key[1]).toBe("test");
  });
});

describe("fetchWorkflowById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls trpcClient.workflows.get.query with the id", async () => {
    const mockWorkflow = { id: "wf-1", name: "Test Workflow" };
    mockQuery.mockResolvedValue(mockWorkflow);

    const result = await fetchWorkflowById("wf-1");

    expect(mockQuery).toHaveBeenCalledWith({ id: "wf-1" });
    expect(result).toEqual(mockWorkflow);
  });

  it("propagates errors", async () => {
    mockQuery.mockRejectedValue(new Error("Not found"));

    await expect(fetchWorkflowById("bad-id")).rejects.toThrow("Not found");
  });
});

describe("useWorkflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch when id is null", () => {
    const { result } = renderHook(() => useWorkflow(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does not fetch when id is undefined", () => {
    const { result } = renderHook(() => useWorkflow(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("fetches workflow when id is provided", async () => {
    const mockWorkflow = { id: "wf-1", name: "Test" };
    mockQuery.mockResolvedValue(mockWorkflow);

    const { result } = renderHook(() => useWorkflow("wf-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockWorkflow);
    });
  });

  it("exposes setWorkflowCache and prefetchWorkflow helpers", () => {
    const { result } = renderHook(() => useWorkflow("wf-1"), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.setWorkflowCache).toBe("function");
    expect(typeof result.current.prefetchWorkflow).toBe("function");
  });
});
