import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "../ui_primitives";
import FolderTree from "./FolderTree";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";

interface AssetMoveToFolderConfirmationProps {
  assets: string[];
}

const AssetMoveToFolderConfirmation: React.FC<
  AssetMoveToFolderConfirmationProps
> = (props) => {
  const { assets } = props;
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next27" });
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const dialogOpen = useAssetGridStore((state) => state.moveToFolderDialogOpen);
  const setDialogOpen = useAssetGridStore(
    (state) => state.setMoveToFolderDialogOpen
  );
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const { mutation } = useAssetUpdate();
  const handleSelectFolder = useCallback(
    (folderId: string) => {
      const assetUpdates = selectedAssets.map((asset: Asset) => ({
        id: asset.id,
        parent_id: folderId
      }));
      // Close dialog immediately; optimistic update removes assets from view
      setDialogOpen(false);
      mutation.mutate(assetUpdates);
    },
    [selectedAssets, mutation, setDialogOpen]
  );

  const count = assets?.length ?? 0;
  return (
    <Dialog
      open={dialogOpen}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      title={t(count === 1 ? "assetMove.titleOne" : "assetMove.titleOther", { count })}
      actions={
        <Button
          className="button-cancel"
          variant="text"
          color="inherit"
          onClick={handleClose}
        >
          {t("assetMove.cancel")}
        </Button>
      }
    >
      <FolderTree onSelect={handleSelectFolder} />
    </Dialog>
  );
};

export default AssetMoveToFolderConfirmation;
