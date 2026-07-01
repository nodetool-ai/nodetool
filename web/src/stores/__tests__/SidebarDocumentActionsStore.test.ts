import { act } from "@testing-library/react";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../SidebarDocumentActionsStore";

describe("SidebarDocumentActionsStore", () => {
  beforeEach(() => {
    act(() => {
      useSidebarDocumentActionsStore.getState().clearActions();
    });
  });

  it("starts with no actions", () => {
    const state = useSidebarDocumentActionsStore.getState();
    expect(state.onRename).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).toBeNull();
  });

  it("stores the handlers passed to setActions", () => {
    const item: SidebarDocumentItem = { id: "t1", name: "Clip" };
    const onRename = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .setActions({ onRename, onDuplicate, onDelete });
    });

    const state = useSidebarDocumentActionsStore.getState();
    state.onRename?.(item);
    state.onDuplicate?.(item);
    state.onDelete?.(item);

    expect(onRename).toHaveBeenCalledWith(item);
    expect(onDuplicate).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("nulls out handlers omitted from setActions", () => {
    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .setActions({ onDelete: jest.fn() });
    });

    const state = useSidebarDocumentActionsStore.getState();
    expect(state.onRename).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).not.toBeNull();
  });

  it("clearActions resets all handlers", () => {
    act(() => {
      useSidebarDocumentActionsStore.getState().setActions({
        onRename: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: jest.fn()
      });
      useSidebarDocumentActionsStore.getState().clearActions();
    });

    const state = useSidebarDocumentActionsStore.getState();
    expect(state.onRename).toBeNull();
    expect(state.onDuplicate).toBeNull();
    expect(state.onDelete).toBeNull();
  });
});
