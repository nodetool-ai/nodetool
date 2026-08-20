import { render, screen, fireEvent } from "@testing-library/react";

import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import useContextMenu, {
  type ContextMenuContextType
} from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import {
  useSidebarDocumentMenu,
  type SidebarDocumentMenuHandlers
} from "../useSidebarDocumentMenu";

const item: SidebarDocumentItem = { id: "doc-1", name: "My doc" };

const noop = () => {};

const setup = (
  handlers: Partial<SidebarDocumentMenuHandlers> = {},
  onParentContextMenu = noop
) => {
  let menuState: ContextMenuContextType | undefined;

  const List = () => {
    menuState = useContextMenu<ContextMenuContextType>((state) => state);
    const onContextMenu = useSidebarDocumentMenu({
      onRename: noop,
      onDuplicate: noop,
      onDelete: noop,
      ...handlers
    });
    return (
      <div onContextMenu={onParentContextMenu}>
        <button onContextMenu={(event) => onContextMenu(event, item.id, item.name)}>
          {item.name}
        </button>
      </div>
    );
  };

  const view = render(
    <ContextMenuProvider active>
      <List />
    </ContextMenuProvider>
  );
  return { ...view, getMenuState: () => menuState as ContextMenuContextType };
};

describe("useSidebarDocumentMenu", () => {
  afterEach(() => {
    useSidebarDocumentActionsStore.getState().clearActions();
  });

  it("publishes the list's actions while mounted and clears them on unmount", () => {
    const onRename = jest.fn();
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();
    const { unmount } = setup({ onRename, onDuplicate, onDelete });

    const published = useSidebarDocumentActionsStore.getState();
    published.onRename?.(item);
    published.onDuplicate?.(item);
    published.onDelete?.(item);
    expect(onRename).toHaveBeenCalledWith(item);
    expect(onDuplicate).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);

    unmount();
    const cleared = useSidebarDocumentActionsStore.getState();
    expect(cleared.onRename).toBeNull();
    expect(cleared.onDuplicate).toBeNull();
    expect(cleared.onDelete).toBeNull();
  });

  it("swallows the promise an async duplicate handler returns", () => {
    const onDuplicate = jest.fn(async () => {});
    setup({ onDuplicate });

    expect(
      useSidebarDocumentActionsStore.getState().onDuplicate?.(item)
    ).toBeUndefined();
    expect(onDuplicate).toHaveBeenCalledWith(item);
  });

  it("opens the menu at the pointer with the item as payload", () => {
    const onParentContextMenu = jest.fn();
    const { getMenuState } = setup({}, onParentContextMenu);

    const notPrevented = fireEvent.contextMenu(
      screen.getByRole("button", { name: item.name }),
      { clientX: 120, clientY: 340 }
    );

    // The browser menu stays closed and the surrounding list gets no event.
    expect(notPrevented).toBe(false);
    expect(onParentContextMenu).not.toHaveBeenCalled();

    const menu = getMenuState();
    expect(menu.openMenuType).toBe("sidebar-document-context-menu");
    expect(menu.nodeId).toBe(item.id);
    expect(menu.menuPosition).toEqual({ x: 120, y: 340 });
    expect(menu.payload).toEqual(item);
  });
});
