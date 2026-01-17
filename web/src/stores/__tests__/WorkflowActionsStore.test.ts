import { renderHook, act } from "@testing-library/react";
import { useWorkflowActionsStore, useWorkflowActions } from "../WorkflowActionsStore";

describe("WorkflowActionsStore", () => {
  beforeEach(() => {
    useWorkflowActionsStore.setState(useWorkflowActionsStore.getInitialState());
  });

  it("initializes with null actions", () => {
    const { result } = renderHook(() => useWorkflowActionsStore());
    expect(result.current.onEdit).toBeNull();
    expect(result.current.onDuplicate).toBeNull();
    expect(result.current.onDelete).toBeNull();
    expect(result.current.onOpenAsApp).toBeNull();
  });

  it("sets all actions at once", () => {
    const mockEdit = jest.fn();
    const mockDuplicate = jest.fn();
    const mockDelete = jest.fn();
    const mockOpenAsApp = jest.fn();

    const { result } = renderHook(() => useWorkflowActionsStore());

    act(() => {
      result.current.setActions({
        onEdit: mockEdit,
        onDuplicate: mockDuplicate,
        onDelete: mockDelete,
        onOpenAsApp: mockOpenAsApp
      });
    });

    expect(result.current.onEdit).toBe(mockEdit);
    expect(result.current.onDuplicate).toBe(mockDuplicate);
    expect(result.current.onDelete).toBe(mockDelete);
    expect(result.current.onOpenAsApp).toBe(mockOpenAsApp);
  });

  it("sets only provided actions, keeping others as null", () => {
    const mockEdit = jest.fn();

    const { result } = renderHook(() => useWorkflowActionsStore());

    act(() => {
      result.current.setActions({ onEdit: mockEdit });
    });

    expect(result.current.onEdit).toBe(mockEdit);
    expect(result.current.onDuplicate).toBeNull();
    expect(result.current.onDelete).toBeNull();
    expect(result.current.onOpenAsApp).toBeNull();
  });

  it("clears all actions", () => {
    const mockEdit = jest.fn();
    const mockDuplicate = jest.fn();

    const { result } = renderHook(() => useWorkflowActionsStore());

    act(() => {
      result.current.setActions({ onEdit: mockEdit, onDuplicate: mockDuplicate });
      result.current.clearActions();
    });

    expect(result.current.onEdit).toBeNull();
    expect(result.current.onDuplicate).toBeNull();
    expect(result.current.onDelete).toBeNull();
    expect(result.current.onOpenAsApp).toBeNull();
  });

  it("can set actions multiple times", () => {
    const mockEdit1 = jest.fn();
    const mockEdit2 = jest.fn();

    const { result } = renderHook(() => useWorkflowActionsStore());

    act(() => {
      result.current.setActions({ onEdit: mockEdit1 });
    });
    expect(result.current.onEdit).toBe(mockEdit1);

    act(() => {
      result.current.setActions({ onEdit: mockEdit2 });
    });
    expect(result.current.onEdit).toBe(mockEdit2);
  });

  it("useWorkflowActions hook returns same state slice", () => {
    const { result } = renderHook(() => useWorkflowActions());

    expect(result.current.onEdit).toBeNull();
    expect(typeof result.current.setActions).toBe("function");
    expect(typeof result.current.clearActions).toBe("function");
  });

  it("handles undefined actions gracefully", () => {
    const { result } = renderHook(() => useWorkflowActionsStore());

    act(() => {
      result.current.setActions({
        onEdit: undefined,
        onDuplicate: undefined
      } as any);
    });

    expect(result.current.onEdit).toBeNull();
    expect(result.current.onDuplicate).toBeNull();
  });
});
