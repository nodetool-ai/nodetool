import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmptyState, FlexColumn, LoadingSpinner } from "../ui_primitives";
import type { DocumentBarRender } from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import StandaloneSketchEditor from "../sketch/StandaloneSketchEditor";
import { useAssetStore } from "../../stores/AssetStore";
import {
  ensureSketchDocumentForAsset,
  readSketchDocumentId
} from "../../hooks/sketch/ensureSketchDocumentForAsset";
import { useSaveSketchToAsset } from "../../hooks/sketch/useSaveSketchToAsset";
import type { Asset } from "../../stores/ApiTypes";

interface ImageSketchEditorProps {
  asset: Asset;
  /** Draws the tab's document bar. */
  documentBar?: DocumentBarRender;
}

/**
 * Edit-mode body for the workspace image tab: the sketch editor embedded inline
 * on the asset's backing sketch document (created and linked on first edit).
 * "Save to image", the primary action of the document bar, renders the
 * composite back into the asset. The sketch document autosaves independently.
 * View/Edit in the bar returns to the viewer.
 */
const ImageSketchEditor = ({ asset, documentBar }: ImageSketchEditorProps) => {
  const { t } = useTranslation();
  const updateAsset = useAssetStore((state) => state.update);
  const [documentId, setDocumentId] = useState<string | null>(() =>
    readSketchDocumentId(asset)
  );
  const [error, setError] = useState<string | null>(null);
  const { save, saving } = useSaveSketchToAsset(asset.id);

  const headerActions = useMemo(
    () => (
      <EditorButton
        variant="contained"
        density="normal"
        onClick={save}
        loading={saving}
      >
        {saving ? t("i18n-next51.imageSketch.saving") : t("i18n-next51.imageSketch.saveToImage")}
      </EditorButton>
    ),
    [save, saving, t]
  );

  useEffect(() => {
    if (documentId) return;
    let cancelled = false;
    ensureSketchDocumentForAsset(asset, updateAsset)
      .then((id) => {
        if (!cancelled) setDocumentId(id);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset, documentId, updateAsset]);

  if (error) {
    return (
      <>
        {documentBar?.({})}
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <EmptyState
            variant="error"
            title={t("i18n-next51.imageSketch.openErrorTitle")}
            description={error}
          />
        </FlexColumn>
      </>
    );
  }

  if (!documentId) {
    return (
      <>
        {documentBar?.({})}
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <LoadingSpinner />
        </FlexColumn>
      </>
    );
  }

  return (
    <StandaloneSketchEditor
      documentId={documentId}
      headerActions={headerActions}
      documentBar={documentBar}
    />
  );
};

export default ImageSketchEditor;
