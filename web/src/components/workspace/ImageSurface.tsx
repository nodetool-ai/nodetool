import { useCallback } from "react";

import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import ImageViewer from "../asset_viewer/ImageViewer";
import ImageSketchEditor from "./ImageSketchEditor";
import { useAssetById } from "../../serverState/useAssetById";
import {
  tabId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";

interface ImageSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * The document surface for an image asset tab. View mode renders the zoomable
 * ImageViewer; edit mode embeds the sketch editor on the asset's backing sketch
 * document. Saving inside the editor renders back into the asset.
 *
 * The embedded editor is mounted only while the tab is `active`: the sketch
 * editor drives global singleton stores (session/autosave + canvas ref), so two
 * concurrently-mounted editors (all tabs stay mounted in the shell) would
 * cross-contaminate. Inactive edit tabs fall back to the viewer (hidden anyway).
 */
const ImageSurface = ({ refId, mode, active }: ImageSurfaceProps) => {
  const { data: asset, isLoading, error } = useAssetById(refId);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const returnToView = useCallback(() => {
    setMode(tabId("image", refId), "view");
  }, [setMode, refId]);

  if (isLoading) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (error || !asset) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Text size="normal" weight={600}>
          {error ? "Failed to load image" : "Image not found"}
        </Text>
      </FlexColumn>
    );
  }

  if (mode === "edit" && active) {
    return <ImageSketchEditor asset={asset} onClose={returnToView} />;
  }

  return <ImageViewer asset={asset} />;
};

export default ImageSurface;
