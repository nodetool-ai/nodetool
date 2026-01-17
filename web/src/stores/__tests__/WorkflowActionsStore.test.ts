import { useWorkflowActionsStore } from "../WorkflowActionsStore";

describe("WorkflowActionsStore", () => {
  beforeEach(() => {
    useWorkflowActionsStore.setState(useWorkflowActionsStore.getInitialState());
  });

  afterEach(() => {
    useWorkflowActionsStore.setState(useWorkflowActionsStore.getInitialState());
  });

  describe("initial state", () => {
    it("initializes with all actions as null", () => {
      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBeNull();
      expect(state.onDuplicate).toBeNull();
      expect(state.onDelete).toBeNull();
      expect(state.onOpenAsApp).toBeNull();
    });
  });

  describe("setActions", () => {
    it("sets all provided actions", () => {
      const mockOnEdit = jest.fn();
      const mockOnDuplicate = jest.fn();
      const mockOnDelete = jest.fn();
      const mockOnOpenAsApp = jest.fn();

      useWorkflowActionsStore.getState().setActions({
        onEdit: mockOnEdit,
        onDuplicate: mockOnDuplicate,
        onDelete: mockOnDelete,
        onOpenAsApp: mockOnOpenAsApp,
      });

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBe(mockOnEdit);
      expect(state.onDuplicate).toBe(mockOnDuplicate);
      expect(state.onDelete).toBe(mockOnDelete);
      expect(state.onOpenAsApp).toBe(mockOnOpenAsApp);
    });

    it("sets only onEdit action", () => {
      const mockOnEdit = jest.fn();

      useWorkflowActionsStore.getState().setActions({
        onEdit: mockOnEdit,
      });

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBe(mockOnEdit);
      expect(state.onDuplicate).toBeNull();
      expect(state.onDelete).toBeNull();
      expect(state.onOpenAsApp).toBeNull();
    });

    it("sets only onDuplicate action", () => {
      const mockOnDuplicate = jest.fn();

      useWorkflowActionsStore.getState().setActions({
        onDuplicate: mockOnDuplicate,
      });

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBeNull();
      expect(state.onDuplicate).toBe(mockOnDuplicate);
      expect(state.onDelete).toBeNull();
      expect(state.onOpenAsApp).toBeNull();
    });

    it("sets only onDelete action", () => {
      const mockOnDelete = jest.fn();

      useWorkflowActionsStore.getState().setActions({
        onDelete: mockOnDelete,
      });

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBeNull();
      expect(state.onDuplicate).toBeNull();
      expect(state.onDelete).toBe(mockOnDelete);
      expect(state.onOpenAsApp).toBeNull();
    });

    it("sets only onOpenAsApp action", () => {
      const mockOnOpenAsApp = jest.fn();

      useWorkflowActionsStore.getState().setActions({
        onOpenAsApp: mockOnOpenAsApp,
      });

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBeNull();
      expect(state.onDuplicate).toBeNull();
      expect(state.onDelete).toBeNull();
      expect(state.onOpenAsApp).toBe(mockOnOpenAsApp);
    });

    it("uses null for undefined actions", () => {
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

    it("can be called multiple times to update actions", () => {
      const mockOnEdit1 = jest.fn();
      const mockOnEdit2 = jest.fn();

      useWorkflowActionsStore.getState().setActions({ onEdit: mockOnEdit1 });
      expect(useWorkflowActionsStore.getState().onEdit).toBe(mockOnEdit1);

      useWorkflowActionsStore.getState().setActions({ onEdit: mockOnEdit2 });
      expect(useWorkflowActionsStore.getState().onEdit).toBe(mockOnEdit2);
    });
  });

  describe("clearActions", () => {
    it("clears all actions to null", () => {
      const mockOnEdit = jest.fn();
      const mockOnDuplicate = jest.fn();
      const mockOnDelete = jest.fn();
      const mockOnOpenAsApp = jest.fn();

      useWorkflowActionsStore.setState({
        onEdit: mockOnEdit,
        onDuplicate: mockOnDuplicate,
        onDelete: mockOnDelete,
        onOpenAsApp: mockOnOpenAsApp,
      });

      useWorkflowActionsStore.getState().clearActions();

      const state = useWorkflowActionsStore.getState();
      expect(state.onEdit).toBeNull();
      expect(state.onDuplicate).toBeNull();
      expect(state.onDelete).toBeNull();
      expect(state.onOpenAsApp).toBeNull();
    });

    it("clears actions even when already clear", () => {
      expect(() => {
        useWorkflowActionsStore.getState().clearActions();
      }).not.toThrow();
    });
  });
});
