import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCombo } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";

/**
 * File-manager keyboard shortcuts for the fullscreen Assets page:
 *   - Cmd/Ctrl+A      select every visible asset
 *   - Delete/Backspace delete the current selection (opens the confirm dialog)
 *   - Escape          clear the selection
 *
 * Combos register on the global key bus but the default "canvas" scope keeps
 * them suppressed while the user is typing (search box, rename field). They are
 * also disabled whenever a dialog or the asset viewer is open, so they never
 * fight the confirmation dialogs, and Escape only fires while something is
 * selected so it stays free for closing overlays. Pass `enabled = false` on
 * surfaces that share the screen with the workflow canvas (the in-editor
 * sidebar), where Delete/Cmd+A would collide with node shortcuts.
 *
 * Enter is deliberately not bound: a global Enter handler would hijack the
 * native activation of focused toolbar buttons and Selects (which are not
 * "editable elements"). Double-click still opens an asset in the viewer.
 */
export const useAssetGridShortcuts = (assets: Asset[], enabled: boolean) => {
  const {
    selectedAssetIds,
    setSelectedAssetIds,
    setSelectedAssets,
    setDeleteDialogOpen,
    openAsset,
    deleteDialogOpen,
    renameDialogOpen,
    moveToFolderDialogOpen,
    createFolderDialogOpen
  } = useAssetGridStore(
    useShallow((state) => ({
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      setSelectedAssets: state.setSelectedAssets,
      setDeleteDialogOpen: state.setDeleteDialogOpen,
      openAsset: state.openAsset,
      deleteDialogOpen: state.deleteDialogOpen,
      renameDialogOpen: state.renameDialogOpen,
      moveToFolderDialogOpen: state.moveToFolderDialogOpen,
      createFolderDialogOpen: state.createFolderDialogOpen
    }))
  );

  const overlayOpen =
    !!openAsset ||
    deleteDialogOpen ||
    renameDialogOpen ||
    moveToFolderDialogOpen ||
    createFolderDialogOpen;

  const active = enabled && !overlayOpen;
  const hasSelection = selectedAssetIds.length > 0;

  const selectAll = useCallback(() => {
    // Set the resolved assets first so the store's setSelectedAssetIds can
    // resolve every id against a populated list (the fullscreen page never
    // populates the store's `filteredAssets`).
    setSelectedAssets(assets);
    setSelectedAssetIds(assets.map((asset) => asset.id));
  }, [assets, setSelectedAssets, setSelectedAssetIds]);

  const deleteSelected = useCallback(() => {
    if (selectedAssetIds.length > 0) {
      setDeleteDialogOpen(true);
    }
  }, [selectedAssetIds, setDeleteDialogOpen]);

  const deselect = useCallback(() => {
    setSelectedAssetIds([]);
    setSelectedAssets([]);
  }, [setSelectedAssetIds, setSelectedAssets]);

  useCombo(["meta", "a"], selectAll, true, active);
  useCombo(["control", "a"], selectAll, true, active);
  useCombo(["delete"], deleteSelected, true, active && hasSelection);
  useCombo(["backspace"], deleteSelected, true, active && hasSelection);
  useCombo(["escape"], deselect, true, active && hasSelection);
};
