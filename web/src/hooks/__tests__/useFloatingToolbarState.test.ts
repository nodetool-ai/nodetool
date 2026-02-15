import { renderHook, act } from "@testing-library/react";
import { useFloatingToolbarState } from "../useFloatingToolbarState";

describe("useFloatingToolbarState", () => {
  it("initializes with all menus closed", () => {
    const { result } = renderHook(() => useFloatingToolbarState());

    expect(result.current.paneMenuOpen).toBe(false);
    expect(result.current.actionsMenuAnchor).toBe(null);
    expect(result.current.advancedMenuAnchor).toBe(null);
  });

  describe("pane menu", () => {
    it("opens pane menu", () => {
      const { result } = renderHook(() => useFloatingToolbarState());

      act(() => {
        result.current.handleOpenPaneMenu();
      });

      expect(result.current.paneMenuOpen).toBe(true);
    });

    it("closes pane menu", () => {
      const { result } = renderHook(() => useFloatingToolbarState());

      act(() => {
        result.current.handleOpenPaneMenu();
        result.current.handleClosePaneMenu();
      });

      expect(result.current.paneMenuOpen).toBe(false);
    });
  });

  describe("actions menu", () => {
    it("opens actions menu with anchor element", () => {
      const { result } = renderHook(() => useFloatingToolbarState());
      const mockElement = document.createElement("button");
      const mockEvent = {
        currentTarget: mockElement
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleOpenActionsMenu(mockEvent);
      });

      expect(result.current.actionsMenuAnchor).toBe(mockElement);
    });

    it("closes actions menu", () => {
      const { result } = renderHook(() => useFloatingToolbarState());
      const mockElement = document.createElement("button");
      const mockEvent = {
        currentTarget: mockElement
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleOpenActionsMenu(mockEvent);
        result.current.handleCloseActionsMenu();
      });

      expect(result.current.actionsMenuAnchor).toBe(null);
    });
  });

  describe("advanced menu", () => {
    it("opens advanced menu with anchor element", () => {
      const { result } = renderHook(() => useFloatingToolbarState());
      const mockElement = document.createElement("button");
      const mockEvent = {
        currentTarget: mockElement
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleOpenAdvancedMenu(mockEvent);
      });

      expect(result.current.advancedMenuAnchor).toBe(mockElement);
    });

    it("closes advanced menu", () => {
      const { result } = renderHook(() => useFloatingToolbarState());
      const mockElement = document.createElement("button");
      const mockEvent = {
        currentTarget: mockElement
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleOpenAdvancedMenu(mockEvent);
        result.current.handleCloseAdvancedMenu();
      });

      expect(result.current.advancedMenuAnchor).toBe(null);
    });
  });

  it("maintains independent state for each menu", () => {
    const { result } = renderHook(() => useFloatingToolbarState());
    const mockElement1 = document.createElement("button");
    const mockElement2 = document.createElement("div");
    const mockEvent1 = {
      currentTarget: mockElement1
    } as unknown as React.MouseEvent<HTMLElement>;
    const mockEvent2 = {
      currentTarget: mockElement2
    } as unknown as React.MouseEvent<HTMLElement>;

    act(() => {
      result.current.handleOpenPaneMenu();
      result.current.handleOpenActionsMenu(mockEvent1);
      result.current.handleOpenAdvancedMenu(mockEvent2);
    });

    expect(result.current.paneMenuOpen).toBe(true);
    expect(result.current.actionsMenuAnchor).toBe(mockElement1);
    expect(result.current.advancedMenuAnchor).toBe(mockElement2);

    act(() => {
      result.current.handleCloseActionsMenu();
    });

    expect(result.current.paneMenuOpen).toBe(true);
    expect(result.current.actionsMenuAnchor).toBe(null);
    expect(result.current.advancedMenuAnchor).toBe(mockElement2);
  });

  it("provides stable callback references", () => {
    const { result, rerender } = renderHook(() => useFloatingToolbarState());

    const initialCallbacks = {
      handleOpenPaneMenu: result.current.handleOpenPaneMenu,
      handleClosePaneMenu: result.current.handleClosePaneMenu,
      handleOpenActionsMenu: result.current.handleOpenActionsMenu,
      handleCloseActionsMenu: result.current.handleCloseActionsMenu,
      handleOpenAdvancedMenu: result.current.handleOpenAdvancedMenu,
      handleCloseAdvancedMenu: result.current.handleCloseAdvancedMenu
    };

    rerender();

    expect(result.current.handleOpenPaneMenu).toBe(
      initialCallbacks.handleOpenPaneMenu
    );
    expect(result.current.handleClosePaneMenu).toBe(
      initialCallbacks.handleClosePaneMenu
    );
    expect(result.current.handleOpenActionsMenu).toBe(
      initialCallbacks.handleOpenActionsMenu
    );
    expect(result.current.handleCloseActionsMenu).toBe(
      initialCallbacks.handleCloseActionsMenu
    );
    expect(result.current.handleOpenAdvancedMenu).toBe(
      initialCallbacks.handleOpenAdvancedMenu
    );
    expect(result.current.handleCloseAdvancedMenu).toBe(
      initialCallbacks.handleCloseAdvancedMenu
    );
  });
});
