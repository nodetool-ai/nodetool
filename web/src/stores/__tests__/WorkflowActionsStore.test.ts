import { useWorkflowActionsStore } from "../WorkflowActionsStore";
import { Workflow } from "../ApiTypes";

describe("WorkflowActionsStore", () => {
  beforeEach(() => {
    useWorkflowActionsStore.setState({
      onEdit: null,
      onDuplicate: null,
      onDelete: null,
      onOpenAsApp: null,
    });
  });

  it("initializes with null action handlers", () => {
    const state = useWorkflowActionsStore.getState();
    expect(state.onEdit).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).toBeNull();
    expect(state.onOpenAsApp).toBeNull();
  });

  it("sets all action handlers at once", () => {
    const mockWorkflow: Workflow = {
      id: "test-id",
      name: "Test Workflow",
      graph: { nodes: [], edges: [] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const onEdit = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();
    const onOpenAsApp = jest.fn();

    useWorkflowActionsStore.getState().setActions({
      onEdit,
      onDuplicate,
      onDelete,
      onOpenAsApp,
    });

    const state = useWorkflowActionsStore.getState();
    expect(state.onEdit).toBe(onEdit);
    expect(state.onDuplicate).toBe(onDuplicate);
    expect(state.onDelete).toBe(onDelete);
    expect(state.onOpenAsApp).toBe(onOpenAsApp);
  });

  it("sets individual action handlers", () => {
    const mockWorkflow: Workflow = {
      id: "test-id",
      name: "Test Workflow",
      graph: { nodes: [], edges: [] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const onEdit = jest.fn();

    useWorkflowActionsStore.getState().setActions({ onEdit });

    expect(useWorkflowActionsStore.getState().onEdit).toBe(onEdit);
    expect(useWorkflowActionsStore.getState().onDuplicate).toBeNull();
    expect(useWorkflowActionsStore.getState().onDelete).toBeNull();
    expect(useWorkflowActionsStore.getState().onOpenAsApp).toBeNull();
  });

  it("handles undefined action handlers", () => {
    useWorkflowActionsStore.getState().setActions({
      onEdit: undefined,
      onDuplicate: undefined,
      onDelete: undefined,
      onOpenAsApp: undefined,
    });

    const state = useWorkflowActionsStore.getState();
    expect(state.onEdit).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).toBeNull();
    expect(state.onOpenAsApp).toBeNull();
  });

  it("clears all action handlers", () => {
    const onEdit = jest.fn();
    const onDuplicate = jest.fn();

    useWorkflowActionsStore.setState({
      onEdit,
      onDuplicate,
      onDelete: jest.fn(),
      onOpenAsApp: jest.fn(),
    });

    useWorkflowActionsStore.getState().clearActions();

    const state = useWorkflowActionsStore.getState();
    expect(state.onEdit).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).toBeNull();
    expect(state.onOpenAsApp).toBeNull();
  });

  it("replaces all handlers when setActions is called", () => {
    const onEdit = jest.fn();
    const onDuplicate = jest.fn();

    useWorkflowActionsStore.getState().setActions({ onEdit });
    expect(useWorkflowActionsStore.getState().onEdit).toBe(onEdit);
    expect(useWorkflowActionsStore.getState().onDuplicate).toBeNull();

    useWorkflowActionsStore.getState().setActions({ onDuplicate });
    expect(useWorkflowActionsStore.getState().onEdit).toBeNull();
    expect(useWorkflowActionsStore.getState().onDuplicate).toBe(onDuplicate);
  });
});
