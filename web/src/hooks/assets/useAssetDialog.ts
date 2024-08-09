import { useState, useCallback } from "react";

export const useAssetDialog = () => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveToFolderDialogOpen, setMoveToFolderDialogOpen] = useState(false);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);
  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const openRenameDialog = useCallback(() => setRenameDialogOpen(true), []);
  const closeRenameDialog = useCallback(() => setRenameDialogOpen(false), []);

  const openMoveToFolderDialog = useCallback(
    () => setMoveToFolderDialogOpen(true),
    []
  );
  const closeMoveToFolderDialog = useCallback(
    () => setMoveToFolderDialogOpen(false),
    []
  );

  return {
    deleteDialogOpen,
    renameDialogOpen,
    moveToFolderDialogOpen,
    openDeleteDialog,
    closeDeleteDialog,
    openRenameDialog,
    closeRenameDialog,
    openMoveToFolderDialog,
    closeMoveToFolderDialog,
  };
};
