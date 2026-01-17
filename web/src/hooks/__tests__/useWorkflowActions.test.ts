import { renderHook } from "@testing-library/react";
import { useWorkflowActions } from "../useWorkflowActions";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

// Mock before imports
jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(() => jest.fn())
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(() => ({
    createNew: jest.fn(),
    create: jest.fn()
  }))
}));

// Re-import with mocks in place
const mockUseNavigate = require("react-router-dom").useNavigate;
const mockUseWorkflowManager = require("../../contexts/WorkflowManagerContext").useWorkflowManager;

describe("useWorkflowActions", () => {
  const mockCreateNewWorkflow = jest.fn();
  const mockCreateWorkflow = jest.fn();
  const mockNavigate = jest.fn();

  const mockWorkflow: Workflow = {
    id: "test-workflow-123",
    name: "Test Workflow",
    package_name: "test-package",
    description: "A test workflow",
    tags: [],
    access: "private",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNewWorkflow.mockResolvedValue(mockWorkflow);
    mockCreateWorkflow.mockResolvedValue(mockWorkflow);
    mockNavigate.mockClear();
    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseWorkflowManager.mockReturnValue({
      createNew: mockCreateNewWorkflow,
      create: mockCreateWorkflow
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

      expect(mockCreateNewWorkflow).toHaveBeenCalled();
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

      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["example"])
        }),
        undefined,
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
        undefined,
        "Test Workflow"
      );
    });

    it("navigates to new workflow after creation", async () => {
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleExampleClick(mockWorkflow);

      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-123");
    });

    it("clears loading state on error", async () => {
      mockCreateWorkflow.mockRejectedValueOnce(new Error("Creation failed"));
      const { result } = renderHook(() => useWorkflowActions());

      await result.current.handleExampleClick(mockWorkflow);

      expect(result.current.loadingExampleId).toBeNull();
    });

    it("does nothing if already loading", async () => {
      mockCreateWorkflow.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockWorkflow), 100))
      );
      const { result } = renderHook(() => useWorkflowActions());

      const exampleWorkflow = { ...mockWorkflow };

      // Start first click
      const firstPromise = result.current.handleExampleClick(exampleWorkflow);

      // Try second click immediately
      result.current.handleExampleClick(exampleWorkflow);

      await firstPromise;

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

      expect(mockCreateWorkflow).toHaveBeenCalledWith(
        expect.any(Object),
        "example-package",
        "Example Name"
      );
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
        undefined,
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
