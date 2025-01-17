import { create } from "zustand";
import { TypeMetadata } from "./ApiTypes";
type MenuPosition = { x: number; y: number };
interface ContextMenuState {
  openMenuType: string | null;
  nodeId: string | null;
  menuPosition: MenuPosition | null;
  type: TypeMetadata | null;
  handleId: string | null;
  description?: string;
  isDynamicProperty?: boolean;

  openContextMenu: (
    contextMenuClass: string,
    nodeId: string,
    x: number,
    y: number,
    outsideClickIgnoreClass?: string,
    type?: TypeMetadata,
    handleId?: string,
    description?: string,
    isDynamicProperty?: boolean
  ) => void;
  closeContextMenu: () => void;
}
const useContextMenuStore = create<ContextMenuState>((set) => {
  let currentClickOutsideHandler: ((event: MouseEvent) => void) | null = null;

  const clickOutsideHandler = (className: string) => (event: MouseEvent) => {
    let element = event.target as HTMLElement;
    let shouldCloseMenu = true;
    while (element && element.parentElement) {
      if (element.classList.contains(className)) {
        shouldCloseMenu = false;
        break;
      }
      if (className && element.classList.contains(className)) {
        shouldCloseMenu = false;
        break;
      }
      element = element.parentElement;
    }

    if (shouldCloseMenu) {
      closeContextMenu();
    }
  };
  const openContextMenu = (
    contextMenuClass: string,
    nodeId: string,
    x: number,
    y: number,
    outsideClickIgnoreClass?: string,
    type?: TypeMetadata,
    handleId?: string,
    description?: string,
    isDynamicProperty?: boolean
  ) => {
    // Remove existing event listener if any
    if (currentClickOutsideHandler) {
      document.removeEventListener("mouseup", currentClickOutsideHandler);
    }

    // Only open the menu if the clicked element has the specified class
    let shouldOpenMenu = true;
    if (outsideClickIgnoreClass) {
      const element = document.elementFromPoint(x, y) as HTMLElement;
      const isClickInsideBoundary =
        element.closest(`.${outsideClickIgnoreClass}`) !== null;
      shouldOpenMenu = isClickInsideBoundary;
    }

    if (shouldOpenMenu) {
      set({
        openMenuType: contextMenuClass,
        nodeId: nodeId,
        menuPosition: { x, y },
        type: type,
        handleId: handleId,
        description: description,
        isDynamicProperty: isDynamicProperty
      });
      setTimeout(() => {
        currentClickOutsideHandler = clickOutsideHandler(
          outsideClickIgnoreClass ? outsideClickIgnoreClass : "body"
        );
        document.addEventListener("mouseup", currentClickOutsideHandler);
      }, 500);
    }
  };

  const closeContextMenu = () => {
    if (currentClickOutsideHandler) {
      document.removeEventListener("mouseup", currentClickOutsideHandler);
      currentClickOutsideHandler = null;
    }
    setTimeout(() => {
      set({
        openMenuType: null,
        nodeId: null,
        menuPosition: null,
        type: null,
        handleId: null,
        description: undefined,
        isDynamicProperty: undefined
      });
    }, 50);
  };

  return {
    openMenuType: null,
    nodeId: null,
    menuPosition: null,
    openContextMenu,
    closeContextMenu,
    type: null,
    handleId: null,
    description: undefined,
    isDynamicProperty: undefined
  };
});

export default useContextMenuStore;
