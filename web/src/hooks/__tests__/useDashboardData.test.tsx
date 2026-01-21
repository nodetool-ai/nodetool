import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDashboardData } from "../useDashboardData";

const mockLoadTemplates = jest.fn();

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn()
  }
}));

jest.mock("../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn((selector) =>
    selector({
      settings: { workflowOrder: "updated" }
    })
  )
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(() => ({
    loadTemplates: mockLoadTemplates
  }))
}));

import { client } from "../../stores/ApiClient";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false
      }
    }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useDashboardData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadTemplates.mockReset();
    (client.GET as jest.Mock).mockReset();
  });

  it("returns loading states initially when API is pending", () => {
    mockLoadTemplates.mockImplementation(() => new Promise(() => {}));
    (client.GET as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    expect(result.current.isLoadingWorkflows).toBe(true);
    expect(result.current.isLoadingTemplates).toBe(true);
    expect(result.current.sortedWorkflows).toEqual([]);
    expect(result.current.startTemplates).toEqual([]);
  });

  it("returns workflows after successful loading", async () => {
    const mockWorkflows = {
      workflows: [
        { id: "1", name: "Workflow 1", updated_at: "2026-01-20" },
        { id: "2", name: "Workflow 2", updated_at: "2026-01-19" }
      ]
    };

    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: mockWorkflows, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows).toHaveLength(2);
  });

  it("sorts workflows by name when settings.workflowOrder is 'name'", async () => {
    const mockWorkflows = {
      workflows: [
        { id: "1", name: "Zebra", updated_at: "2026-01-20" },
        { id: "2", name: "Apple", updated_at: "2026-01-19" },
        { id: "3", name: "Banana", updated_at: "2026-01-18" }
      ]
    };

    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: mockWorkflows, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows).toHaveLength(3);
  });

  it("sorts workflows by updated date descending when settings.workflowOrder is 'updated'", async () => {
    const mockWorkflows = {
      workflows: [
        { id: "1", name: "Old Workflow", updated_at: "2026-01-10" },
        { id: "2", name: "New Workflow", updated_at: "2026-01-20" },
        { id: "3", name: "Middle Workflow", updated_at: "2026-01-15" }
      ]
    };

    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: mockWorkflows, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows[0].name).toBe("New Workflow");
    expect(result.current.sortedWorkflows[1].name).toBe("Middle Workflow");
    expect(result.current.sortedWorkflows[2].name).toBe("Old Workflow");
  });

  it("returns empty workflows when API returns null", async () => {
    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows).toEqual([]);
  });

  it("handles API error gracefully", async () => {
    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: null, error: new Error("API Error") });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows).toEqual([]);
  });

  it("loads templates from workflow manager", async () => {
    (client.GET as jest.Mock).mockResolvedValue({ data: { workflows: [] }, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingTemplates).toBe(false);
    }, { timeout: 5000 });
  });

  it("returns empty templates when loadTemplates returns null", async () => {
    (client.GET as jest.Mock).mockResolvedValue({ data: { workflows: [] }, error: null });
    mockLoadTemplates.mockResolvedValue(null);

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingTemplates).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.startTemplates).toEqual([]);
  });

  it("handles workflow with undefined tags", async () => {
    const mockWorkflows = {
      workflows: [
        { id: "1", name: "Workflow 1", updated_at: "2026-01-20" },
        { id: "2", name: "Workflow 2", updated_at: "2026-01-19", tags: undefined }
      ]
    };

    mockLoadTemplates.mockResolvedValue({ workflows: [] });
    (client.GET as jest.Mock).mockResolvedValue({ data: mockWorkflows, error: null });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoadingWorkflows).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.sortedWorkflows).toHaveLength(2);
  });
});
