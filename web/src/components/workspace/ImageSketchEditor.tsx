import { useEffect, useMemo, useState } from "react";

import { EmptyState, FlexColumn, FlexRow, LoadingSpinner } from "../ui_primitives";
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
  onClose: () => void;
}

/**
 * Edit-mode body for the workspace image tab: the sketch editor embedded inline
 * on the asset's backing sketch document (created and linked on first edit).
 * "Save to image" renders the composite back into the asset; "Done" returns the
 * tab to view mode. Both live in the editor's top mode bar. The sketch document
 * autosaves independently.
 */
const ImageSketchEditor = ({ asset, onClose }: ImageSketchEditorProps) => {
  const updateAsset = useAssetStore((state) => state.update);
  const [documentId, setDocumentId] = useState<string | null>(() =>
    readSketchDocumentId(asset)
  );
  const [error, setError] = useState<string | null>(null);
  const { save, saving } = useSaveSketchToAsset(asset.id);

  const headerActions = useMemo(
    () => (
      <FlexRow
        align="center"
        gap={1}
        sx={{
          flexShrink: 0,
          pl: 1,
          borderLeft: "1px solid var(--palette-divider)"
        }}
      >
        <EditorButton
          variant="contained"
          size="small"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save to image"}
        </EditorButton>
        <EditorButton variant="text" size="small" onClick={onClose}>
          Done
        </EditorButton>
      </FlexRow>
    ),
    [save, saving, onClose]
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
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <EmptyState
          variant="error"
          title="Could not open editor"
          description={error}
        />
      </FlexColumn>
    );
  }

  if (!documentId) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  return (
    <StandaloneSketchEditor
      documentId={documentId}
      headerActions={headerActions}
    />
  );
};

export default ImageSketchEditor;
