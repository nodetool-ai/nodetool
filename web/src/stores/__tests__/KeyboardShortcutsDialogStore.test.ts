import { useKeyboardShortcutsDialogStore } from "../KeyboardShortcutsDialogStore";

describe("KeyboardShortcutsDialogStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useKeyboardShortcutsDialogStore.setState({
      isOpen: false,
      initialCategory: "all"
    });
  });

  it("has correct initial state", () => {
    const state = useKeyboardShortcutsDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.initialCategory).toBe("all");
  });

  it("opens the dialog with default category", () => {
    const { open } = useKeyboardShortcutsDialogStore.getState();
    open();
    const state = useKeyboardShortcutsDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.initialCategory).toBe("all");
  });

  it("opens the dialog with specific category", () => {
    const { open } = useKeyboardShortcutsDialogStore.getState();
    open("editor");
    const state = useKeyboardShortcutsDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.initialCategory).toBe("editor");
  });

  it("closes the dialog", () => {
    const { open, close } = useKeyboardShortcutsDialogStore.getState();
    open();
    expect(useKeyboardShortcutsDialogStore.getState().isOpen).toBe(true);
    close();
    expect(useKeyboardShortcutsDialogStore.getState().isOpen).toBe(false);
  });

  it("toggles the dialog state", () => {
    const { toggle } = useKeyboardShortcutsDialogStore.getState();
    expect(useKeyboardShortcutsDialogStore.getState().isOpen).toBe(false);
    toggle();
    expect(useKeyboardShortcutsDialogStore.getState().isOpen).toBe(true);
    toggle();
    expect(useKeyboardShortcutsDialogStore.getState().isOpen).toBe(false);
  });

  it("supports all valid category types", () => {
    const { open } = useKeyboardShortcutsDialogStore.getState();
    const categories: Array<"all" | "editor" | "panel" | "assets" | "workflow"> = [
      "all",
      "editor",
      "panel",
      "assets",
      "workflow"
    ];

    categories.forEach((category) => {
      open(category);
      const state = useKeyboardShortcutsDialogStore.getState();
      expect(state.initialCategory).toBe(category);
    });
  });
});
