import useAnnotationDialogStore from "../../../stores/AnnotationDialogStore";

describe("AnnotationDialogStore", () => {
  beforeEach(() => {
    useAnnotationDialogStore.setState({ isOpen: false, nodeId: null });
  });

  it("has initial state", () => {
    const state = useAnnotationDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.nodeId).toBeNull();
  });

  it("can open annotation dialog", () => {
    const { openAnnotationDialog } = useAnnotationDialogStore.getState();
    openAnnotationDialog("test-node");
    
    const state = useAnnotationDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.nodeId).toBe("test-node");
  });

  it("can close annotation dialog", () => {
    const { openAnnotationDialog, closeAnnotationDialog } = useAnnotationDialogStore.getState();
    openAnnotationDialog("test-node");
    closeAnnotationDialog();
    
    const state = useAnnotationDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.nodeId).toBeNull();
  });
});
