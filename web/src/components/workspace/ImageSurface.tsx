import { useTranslation } from "react-i18next";

import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import ImageViewer from "../asset_viewer/ImageViewer";
import ImageSketchEditor from "./ImageSketchEditor";
import { useAssetById } from "../../serverState/useAssetById";
import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";

interface ImageSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
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
 *
 * The editor draws the tab's document bar with the sketch slots and "Save to
 * image"; the viewer and the load states get the bar with the title and
 * View/Edit.
 */
const ImageSurface = ({ refId, mode, active, tab }: ImageSurfaceProps) => {
  const { t } = useTranslation();
  const { data: asset, isLoading, error } = useAssetById(refId);

  if (isLoading) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <LoadingSpinner />
        </FlexColumn>
      </WithDocumentBar>
    );
  }

  if (error || !asset) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <Text size="normal" weight={600}>
            {error ? t("batch2_0.imageLoadFailed") : t("batch2_0.imageNotFound")}
          </Text>
        </FlexColumn>
      </WithDocumentBar>
    );
  }

  if (mode === "edit" && active) {
    return (
      <ImageSketchEditor asset={asset} documentBar={workspaceDocumentBar(tab)} />
    );
  }

  return (
    <WithDocumentBar tab={tab}>
      <ImageViewer asset={asset} />
    </WithDocumentBar>
  );
};

export default ImageSurface;
