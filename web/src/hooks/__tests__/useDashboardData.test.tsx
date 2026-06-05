/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      list: { query: jest.fn() },
    },
  },
}));

jest.mock("../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn((selector: Function) =>
    selector({
      settings: { workflowOrder: "date" },
    })
  ),
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn((selector: Function) =>
    selector({
      loadTemplates: jest.fn(),
    })
  ),
}));

import { trpcClient } from "../../trpc/client";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useDashboardData } from "../useDashboardData";

const mockListQuery = trpcClient.workflows.list.query as jest.Mock;
const mockUseSettings = useSettingsStore as unknown as jest.Mock;
const mockUseWorkflowManager = useWorkflowManager as unknown as jest.Mock;

const makeWorkflow = (overrides: Record<string, unknown>) => ({
  id: "wf-1",
  name: "Test",
  description: "",
  access: "private",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  tags: [] as string[],
  graph: { nodes: [], edges: [] },
  ...overrides,
});

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

describe("useDashboardData", () => {
  const loadTemplates = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSettings.mockImplementation((selector: Function) =>
      selector({ settings: { workflowOrder: "date" } })
    );
    mockUseWorkflowManager.mockImplementation((selector: Function) =>
      selector({ loadTemplates })
    );
  });

  it("returns loading states initially", () => {
    mockListQuery.mockReturnValue(new Promise(() => {}));
    loadTemplates.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoadingWorkflows).toBe(true);
    expect(result.current.sortedWorkflows).toEqual([]);
  });

  it("sorts workflows by date (updated_at descending) by default", async () => {
    const workflows = {
      workflows: [
        makeWorkflow({ id: "old", name: "Old", updated_at: "2024-01-01T00:00:00Z" }),
        makeWorkflow({ id: "new", name: "New", updated_at: "2024-06-01T00:00:00Z" }),
        makeWorkflow({ id: "mid", name: "Mid", updated_at: "2024-03-01T00:00:00Z" }),
      ],
      next: null,
    };
    mockListQuery.mockResolvedValue(workflows);
    loadTemplates.mockResolvedValue({ workflows: [], next: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    });

    expect(result.current.sortedWorkflows.map((w) => w.id)).toEqual(["new", "mid", "old"]);
  });

  it("sorts workflows by name when setting is 'name'", async () => {
    mockUseSettings.mockImplementation((selector: Function) =>
      selector({ settings: { workflowOrder: "name" } })
    );

    const workflows = {
      workflows: [
        makeWorkflow({ id: "c", name: "Charlie", updated_at: "2024-01-01T00:00:00Z" }),
        makeWorkflow({ id: "a", name: "Alpha", updated_at: "2024-06-01T00:00:00Z" }),
        makeWorkflow({ id: "b", name: "Bravo", updated_at: "2024-03-01T00:00:00Z" }),
      ],
      next: null,
    };
    mockListQuery.mockResolvedValue(workflows);
    loadTemplates.mockResolvedValue({ workflows: [], next: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    });

    expect(result.current.sortedWorkflows.map((w) => w.name)).toEqual([
      "Alpha", "Bravo", "Charlie",
    ]);
  });

  it("filters templates by start/getting-started tags", async () => {
    mockListQuery.mockResolvedValue({ workflows: [], next: null });

    const templates = {
      workflows: [
        makeWorkflow({ id: "t1", name: "Getting Started", tags: ["start"] }),
        makeWorkflow({ id: "t2", name: "Advanced", tags: ["advanced"] }),
        makeWorkflow({ id: "t3", name: "Intro", tags: ["getting-started"] }),
      ],
      next: null,
    };
    loadTemplates.mockResolvedValue(templates);

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingTemplates).toBe(false);
    });

    expect(result.current.startTemplates.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("deduplicates templates by id", async () => {
    mockListQuery.mockResolvedValue({ workflows: [], next: null });

    const templates = {
      workflows: [
        makeWorkflow({ id: "t1", name: "Duplicate A", tags: ["start"] }),
        makeWorkflow({ id: "t1", name: "Duplicate B", tags: ["getting-started"] }),
        makeWorkflow({ id: "t2", name: "Unique", tags: ["start"] }),
      ],
      next: null,
    };
    loadTemplates.mockResolvedValue(templates);

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingTemplates).toBe(false);
    });

    expect(result.current.startTemplates).toHaveLength(2);
    expect(result.current.startTemplates[0].id).toBe("t1");
    expect(result.current.startTemplates[1].id).toBe("t2");
  });
});
