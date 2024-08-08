import { useState, useCallback } from "react";

export const useAssetDialog = () => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [moveToFolderDialogOpen, setMoveToFolderDialogOpen] = useState(false);

  const openDeleteDialog = useCallback(() => {
    console.log("openDeleteDialog called, setting deleteDialogOpen to true");
    setDeleteDialogOpen(true);
  }, []);
  const closeDeleteDialog = useCallback(() => {
    console.log("CLOSE called, setting deleteDialogOpen to true");
    setDeleteDialogOpen(false);
  }, []);
  // const closeDeleteDialog = useCallback(() => setDeleteDialogOpen(false), []);

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
