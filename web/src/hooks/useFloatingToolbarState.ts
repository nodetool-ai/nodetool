import { useState, useCallback } from "react";

/**
 * State for managing various menus and dialogs in the floating toolbar.
 */
export interface FloatingToolbarState {
  paneMenuOpen: boolean;
  actionsMenuAnchor: HTMLElement | null;
  advancedMenuAnchor: HTMLElement | null;
}

/**
 * Actions for managing toolbar state.
 */
export interface FloatingToolbarStateActions {
  handleOpenPaneMenu: () => void;
  handleClosePaneMenu: () => void;
  handleOpenActionsMenu: (e: React.MouseEvent<HTMLElement>) => void;
  handleCloseActionsMenu: () => void;
  handleOpenAdvancedMenu: (e: React.MouseEvent<HTMLElement>) => void;
  handleCloseAdvancedMenu: () => void;
}

/**
 * Hook to manage the state of the floating toolbar menus and modals.
 * Returns state and actions for managing menu visibility and anchors.
 *
 * @returns Toolbar state and actions
 */
export const useFloatingToolbarState = (): FloatingToolbarState &
  FloatingToolbarStateActions => {
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] =
    useState<HTMLElement | null>(null);

  const handleOpenPaneMenu = useCallback(() => {
    setPaneMenuOpen(true);
  }, []);

  const handleClosePaneMenu = useCallback(() => {
    setPaneMenuOpen(false);
  }, []);

  const handleOpenActionsMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      setActionsMenuAnchor(e.currentTarget);
    },
    []
  );

  const handleCloseActionsMenu = useCallback(() => {
    setActionsMenuAnchor(null);
  }, []);

  const handleOpenAdvancedMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      setAdvancedMenuAnchor(e.currentTarget);
    },
    []
  );

  const handleCloseAdvancedMenu = useCallback(() => {
    setAdvancedMenuAnchor(null);
  }, []);

  return {
    paneMenuOpen,
    actionsMenuAnchor,
    advancedMenuAnchor,
    handleOpenPaneMenu,
    handleClosePaneMenu,
    handleOpenActionsMenu,
    handleCloseActionsMenu,
    handleOpenAdvancedMenu,
    handleCloseAdvancedMenu
  };
};
