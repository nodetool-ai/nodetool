import { useDragDropStore } from "../store";

describe("useDragDropStore", () => {
  beforeEach(() => {
    useDragDropStore.getState().clearDrag();
  });

  it("starts with no active drag", () => {
    const state = useDragDropStore.getState();
    expect(state.activeDrag).toBeNull();
    expect(state.isDragging).toBe(false);
  });

  it("setActiveDrag sets drag data and isDragging flag", () => {
    const dragData = {
      type: "tab" as const,
      payload: "workflow-123",
    };

    useDragDropStore.getState().setActiveDrag(dragData);

    const state = useDragDropStore.getState();
    expect(state.activeDrag).toEqual(dragData);
    expect(state.isDragging).toBe(true);
  });

  it("setActiveDrag with null clears drag state", () => {
    useDragDropStore.getState().setActiveDrag({
      type: "tab" as const,
      payload: "workflow-123",
    });

    useDragDropStore.getState().setActiveDrag(null);

    const state = useDragDropStore.getState();
    expect(state.activeDrag).toBeNull();
    expect(state.isDragging).toBe(false);
  });

  it("clearDrag resets both activeDrag and isDragging", () => {
    useDragDropStore.getState().setActiveDrag({
      type: "assets-multiple" as const,
      payload: ["asset-1", "asset-2"],
    });

    useDragDropStore.getState().clearDrag();

    const state = useDragDropStore.getState();
    expect(state.activeDrag).toBeNull();
    expect(state.isDragging).toBe(false);
  });

  it("replaces previous drag data on a new setActiveDrag call", () => {
    useDragDropStore.getState().setActiveDrag({
      type: "tab" as const,
      payload: "workflow-1",
    });

    const newDrag = {
      type: "tab" as const,
      payload: "workflow-2",
    };
    useDragDropStore.getState().setActiveDrag(newDrag);

    expect(useDragDropStore.getState().activeDrag).toEqual(newDrag);
    expect(useDragDropStore.getState().isDragging).toBe(true);
  });
});
