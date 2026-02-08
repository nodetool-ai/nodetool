import useWorkflowErrorPanelStore from "../WorkflowErrorPanelStore";

describe("WorkflowErrorPanelStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useWorkflowErrorPanelStore.getState().closePanel();
  });

  it("should initialize with closed state", () => {
    const isOpen = useWorkflowErrorPanelStore.getState().isOpen;
    expect(isOpen).toBe(false);
  });

  it("should toggle panel visibility", () => {
    const { togglePanel } = useWorkflowErrorPanelStore.getState();

    // Open panel
    togglePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);

    // Close panel
    togglePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(false);
  });

  it("should open panel", () => {
    const { openPanel } = useWorkflowErrorPanelStore.getState();

    openPanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);
  });

  it("should close panel", () => {
    const { openPanel, closePanel } = useWorkflowErrorPanelStore.getState();

    // First open the panel
    openPanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);

    // Then close it
    closePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(false);
  });

  it("should handle multiple toggle operations", () => {
    const { togglePanel } = useWorkflowErrorPanelStore.getState();

    togglePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);

    togglePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(false);

    togglePanel();
    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);
  });

  it("should not throw errors when closing already closed panel", () => {
    const { closePanel } = useWorkflowErrorPanelStore.getState();

    expect(() => {
      closePanel();
      closePanel(); // Close again
    }).not.toThrow();

    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(false);
  });

  it("should not throw errors when opening already open panel", () => {
    const { openPanel } = useWorkflowErrorPanelStore.getState();

    expect(() => {
      openPanel();
      openPanel(); // Open again
    }).not.toThrow();

    expect(useWorkflowErrorPanelStore.getState().isOpen).toBe(true);
  });
});
