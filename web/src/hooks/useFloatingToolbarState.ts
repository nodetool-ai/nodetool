import { useState, useCallback } from "react";

interface FloatingToolbarState {
  paneMenuOpen: boolean;
  actionsMenuAnchor: HTMLElement | null;
  advancedMenuAnchor: HTMLElement | null;
}

interface FloatingToolbarStateActions {
  handleOpenPaneMenu: () => void;
  handleClosePaneMenu: () => void;
  handleOpenActionsMenu: (e: React.MouseEvent<HTMLElement>) => void;
  handleCloseActionsMenu: () => void;
  handleOpenAdvancedMenu: (e: React.MouseEvent<HTMLElement>) => void;
  handleCloseAdvancedMenu: () => void;
}

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
