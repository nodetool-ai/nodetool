import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchWorkflowById = jest.fn(async (id: string) => ({
  id,
  name: `Workflow ${id}`,
  description: "",
  access: "private",
  created_at: "",
  updated_at: "",
  graph: { nodes: [], edges: [] }
}));

jest.mock("../../serverState/useWorkflow", () => ({
  workflowQueryKey: (id: string) => ["workflow", id],
  fetchWorkflowById: (id: string) => fetchWorkflowById(id)
}));

const operation = (id: string, name: string, workflowId: string) => ({
  id,
  name,
  workflowId,
  inputs: {},
  outputs: {},
  policy: "replace" as const
});

const application = {
  id: "app-1",
  projectId: "default",
  name: "Translator",
  description: "",
  document: {
    schemaVersion: 3,
    ui: { root: {}, content: [] },
    operations: [
      operation("draft", "Draft", "wf-1"),
      operation("refine", "Refine", "wf-1"),
      operation("caption", "Caption", "wf-2")
    ],
    resources: [],
    variables: []
  },
  createdAt: "",
  updatedAt: ""
};

const release: {
  value: { workflows: Array<{ workflowId: string; version: number | null; graph: unknown }> } | null;
} = { value: null };

jest.mock("../../trpc/client", () => ({
  trpc: {
    applications: {
      get: { useQuery: () => ({ data: application }) },
      releasedDocument: { useQuery: () => ({ data: release.value }) }
    }
  }
}));

import { useLinkedWorkflows } from "../useApplications";

const renderLinked = (enabled = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useLinkedWorkflows("app-1", enabled), {
    wrapper
  });
  return { ...view, queryClient };
};

beforeEach(() => {
  jest.clearAllMocks();
  release.value = null;
});

describe("useLinkedWorkflows", () => {
  it("caches each linked graph under the shared workflow query key", async () => {
    const { result, rerender, queryClient } = renderLinked();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(queryClient.getQueryData(["workflow", "wf-1"])).toMatchObject({
      id: "wf-1"
    });
    expect(queryClient.getQueryData(["workflow", "wf-2"])).toMatchObject({
      id: "wf-2"
    });

    // Two operations share wf-1: one fetch each, and none on a re-render.
    rerender();
    await waitFor(() =>
      expect(fetchWorkflowById.mock.calls.map(([id]) => id).sort()).toEqual([
        "wf-1",
        "wf-2"
      ])
    );
  });

  it("groups the operations that use each workflow", async () => {
    const { result } = renderLinked();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.links.map((link) => link.workflowId)).toEqual([
      "wf-1",
      "wf-2"
    ]);
    expect(result.current.links[0].name).toBe("Workflow wf-1");
    expect(result.current.links[0].operations.map((o) => o.name)).toEqual([
      "Draft",
      "Refine"
    ]);
    expect(result.current.links[1].operations.map((o) => o.name)).toEqual([
      "Caption"
    ]);
  });

  it("reports the graph a release pinned", async () => {
    release.value = {
      workflows: [
        { workflowId: "wf-1", version: 4, graph: { nodes: [], edges: [] } },
        { workflowId: "wf-2", version: null, graph: null }
      ]
    };
    const { result } = renderLinked();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.links[0]).toMatchObject({
      isPinned: true,
      pinnedVersion: 4
    });
    expect(result.current.links[1]).toMatchObject({
      isPinned: false,
      pinnedVersion: null
    });
  });

  it("fetches nothing while the app tab is not focused", () => {
    const { result } = renderLinked(false);

    expect(fetchWorkflowById).not.toHaveBeenCalled();
    expect(result.current.links).toHaveLength(2);
  });

  it("surfaces a deleted workflow as a broken link", async () => {
    fetchWorkflowById.mockImplementation(async (id: string) => {
      if (id === "wf-2") throw new Error("Workflow not found");
      return {
        id,
        name: `Workflow ${id}`,
        description: "",
        access: "private",
        created_at: "",
        updated_at: "",
        graph: { nodes: [], edges: [] }
      };
    });
    const { result } = renderLinked();

    await waitFor(() =>
      expect(result.current.links[1].error?.message).toBe("Workflow not found")
    );
    expect(result.current.links[0].error).toBeNull();
  });
});
