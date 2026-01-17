import { renderHook, waitFor, act } from "@testing-library/react";
import { useWorkflowActions } from "../useWorkflowActions";
import { Workflow } from "../../stores/ApiTypes";
import * as ReactRouterDom from "react-router-dom";

const mockNavigate = jest.fn();
const mockCreateNew = jest.fn();
const mockCreate = jest.fn();

const mockCreateNewWorkflow = jest.fn();
const mockCreateWorkflow = jest.fn();

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn((selector: (state: any) => any) => {
    const state = {
      createNew: mockCreateNewWorkflow,
      create: mockCreateWorkflow
    };
    return selector(state);
  })
}));

// Get typed access to the mocked function
type UseNavigateMock = () => jest.Mock;
const mockUseNavigate = (ReactRouterDom as unknown as { useNavigate: UseNavigateMock }).useNavigate;

describe("useWorkflowActions", () => {
  const mockNavigate = jest.fn();

  const mockWorkflow: Workflow = {
    id: "test-workflow-123",
    name: "Test Workflow",
    package_name: "test-package",
    description: "A test workflow",
    tags: [],
    access: "private",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    graph: { nodes: [], edges: [] }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNewWorkflow.mockResolvedValue(mockWorkflow);
    mockCreateWorkflow.mockResolvedValue(mockWorkflow);
    mockNavigate.mockClear();
    mockUseNavigate().mockReturnValue(mockNavigate);
  });

  it("returns loadingExampleId and all handler functions", () => {
    const { result } = renderHook(() => useWorkflowActions());

    expect(result.current).toHaveProperty("loadingExampleId");
    expect(typeof result.current.handleCreateNewWorkflow).toBe("function");
    expect(typeof result.current.handleWorkflowClick).toBe("function");
    expect(typeof result.current.handleExampleClick).toBe("function");
    expect(typeof result.current.handleViewAllTemplates).toBe("function");
  });

  describe("handleCreateNewWorkflow", () => {
    it("creates new workflow and navigates to editor", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleCreateNewWorkflow();

      expect(mockCreateNew).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("navigates with correct workflow ID", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleCreateNewWorkflow();

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining("test-workflow-123")
      );
    });
  });

  describe("handleWorkflowClick", () => {
    it("navigates to workflow editor", () => {
      const { result } = renderHook(() => useWorkflowActions());

      result.current.handleWorkflowClick(mockWorkflow);

      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("navigates using workflow ID from object", () => {
      const { result } = renderHook(() => useWorkflowActions());
      const workflow: Workflow = { ...mockWorkflow, id: "another-workflow" };

      result.current.handleWorkflowClick(workflow);

      expect(mockNavigate).toHaveBeenCalledWith("/editor/another-workflow");
    });
  });

  describe("handleExampleClick", () => {
    it("sets loading state during workflow creation", async () => {
      // Make the mock return a promise that we control
      let resolveWorkflow: (workflow: Workflow) => void;
      const workflowPromise = new Promise<Workflow>((resolve) => {
        resolveWorkflow = resolve;
      });
      mockCreateWorkflow.mockReturnValueOnce(workflowPromise);

      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: ["example"]
      };

      // Start the click handler
      let clickPromise: Promise<void>;
      act(() => {
        clickPromise = result.current.handleExampleClick(exampleWorkflow);
      });

      // Now the loading state should be set
      await waitFor(() => {
        expect(result.current.loadingExampleId).toBe("test-workflow-123");
      });

      // Resolve the workflow creation
      act(() => {
        resolveWorkflow!(mockWorkflow);
      });

      await act(async () => {
        await clickPromise!;
      });

      // Note: The loading state is NOT cleared on success, only on error
      // This is the expected behavior based on the current implementation
    });

    it("creates workflow with example tag added", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: []
      };

      await result.current.handleExampleClick(exampleWorkflow);

      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["example"])
        }),
        "test-package",
        "Test Workflow"
      );
    });

    it("preserves existing example tag", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: ["example", "featured"]
      };

      await result.current.handleExampleClick(exampleWorkflow);

      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["example", "featured"])
        }),
        "test-package",
        "Test Workflow"
      );
    });

    it("navigates to new workflow after creation", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleExampleClick(mockWorkflow);

      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("clears loading state on error", async () => {
      mockCreate.mockRejectedValueOnce(new Error("Creation failed"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleExampleClick(mockWorkflow);

      expect(result.current.loadingExampleId).toBeNull();
      consoleSpy.mockRestore();
    });

    it("does nothing if already loading", async () => {
      // Make the first call take time
      let resolveFirst: (workflow: Workflow) => void;
      const firstPromise = new Promise<Workflow>((resolve) => {
        resolveFirst = resolve;
      });
      mockCreateWorkflow.mockReturnValueOnce(firstPromise);

      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow = { ...mockWorkflow };

      // Start first click and wait for loading state to be set
      let clickPromise1: Promise<void>;
      act(() => {
        clickPromise1 = result.current.handleExampleClick(exampleWorkflow);
      });

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.loadingExampleId).toBe("test-workflow-123");
      });

      // Try second click - should be blocked due to loadingExampleId being set
      act(() => {
        result.current.handleExampleClick(exampleWorkflow);
      });

      // Resolve the first call
      act(() => {
        resolveFirst!(mockWorkflow);
      });

      await act(async () => {
        await clickPromise1!;
      });

      // Only the first createWorkflow should have been called
      expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
    });

    it("uses package_name from example when provided", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        package_name: "example-package",
        name: "Example Name"
      };

      await result.current.handleExampleClick(exampleWorkflow);

      expect(mockCreate).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("creates workflow with correct properties", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleExampleClick(mockWorkflow);

      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Workflow",
          package_name: "test-package",
          description: "A test workflow",
          access: "private"
        }),
        "test-package",
        "Test Workflow"
      );
    });
  });

  describe("handleViewAllTemplates", () => {
    it("navigates to templates page", () => {
      const { result } = renderHook(() => useWorkflowActions());

      result.current.handleViewAllTemplates();

      expect(mockNavigate).toHaveBeenCalledWith("/templates");
    });
  });

  it("uses stable navigate function", () => {
    const { result, rerender } = renderHook(() => useWorkflowActions());
    const firstNavigate = result.current.handleWorkflowClick;

    rerender();
    const secondNavigate = result.current.handleWorkflowClick;

    expect(firstNavigate).toBe(secondNavigate);
  });
});
