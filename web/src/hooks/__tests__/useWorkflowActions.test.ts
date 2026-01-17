import { renderHook } from "@testing-library/react";
import { useWorkflowActions } from "../useWorkflowActions";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";

const mockNavigate = jest.fn();
const mockCreateNew = jest.fn();
const mockCreate = jest.fn();

jest.mock("react-router-dom");
jest.mock("../../contexts/WorkflowManagerContext");

describe("useWorkflowActions", () => {
  const mockGraph = {
    nodes: [],
    edges: []
  };

  const mockWorkflow: Workflow = {
    id: "test-workflow-123",
    name: "Test Workflow",
    package_name: "test-package",
    description: "A test workflow",
    tags: [],
    access: "private",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    graph: mockGraph as any
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNew.mockResolvedValue(mockWorkflow);
    mockCreate.mockResolvedValue(mockWorkflow);
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useWorkflowManager as jest.Mock).mockReturnValue({
      createNew: mockCreateNew,
      create: mockCreate
    });
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
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: ["example"]
      };

      const promise = result.current.handleExampleClick(exampleWorkflow);

      expect(result.current.loadingExampleId).toBe("test-workflow-123");
      await promise;
      expect(result.current.loadingExampleId).toBeNull();
    });

    it("creates workflow with example tag added", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: []
      };

      await result.current.handleExampleClick(exampleWorkflow);

      expect(mockCreate).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("preserves existing example tag", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow: Workflow = {
        ...mockWorkflow,
        tags: ["example", "featured"]
      };

      await result.current.handleExampleClick(exampleWorkflow);

      expect(mockCreate).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
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
      mockCreate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockWorkflow), 100))
      );
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow = { ...mockWorkflow };

      const firstPromise = result.current.handleExampleClick(exampleWorkflow);

      result.current.handleExampleClick(exampleWorkflow);

      await firstPromise;

      expect(mockCreate).toHaveBeenCalledTimes(1);
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

      expect(mockCreate).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
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
