import { memo } from "react";
import SaveIcon from "@mui/icons-material/Save";

import { EditorButton } from "../editor_ui";
import { Tooltip } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { trpc } from "../../trpc/client";
import { useSaveSketchToAsset } from "../../hooks/sketch/useSaveSketchToAsset";

interface SaveImageEditPillProps {
  documentId: string;
}

/**
 * "Save to image" — shown in the header while editing an image asset in the
 * sketch editor. Flattens the composite and writes it back into the linked
 * image asset (the document's `thumbnailAssetId`). The sketch itself autosaves
 * separately; this button is the explicit "render into the asset" action.
 *
 * Renders nothing for sketch documents not linked to an asset.
 */
const SaveImageEditPill = memo(function SaveImageEditPill({
  documentId
}: SaveImageEditPillProps) {
  // Same query key/options as SketchEditorPage, so this is a cache hit — no
  // extra request — and surfaces the asset this document renders into.
  const { data } = trpc.sketch.get.useQuery(
    { id: documentId },
    {
      enabled: !!documentId,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false
    }
  );
  const assetId = data?.thumbnailAssetId;
  const { save, saving } = useSaveSketchToAsset(assetId);

  if (!assetId) return null;

  return (
    <Tooltip
      title="Render and save into the image asset"
      delay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <EditorButton
        variant="outlined"
        size="small"
        onClick={save}
        disabled={saving}
        aria-label="Save to image"
        data-testid="save-image-edit-pill"
        sx={{
          height: "1.75em",
          minWidth: "auto",
          borderRadius: "var(--rounded-md)",
          color: "var(--palette-primary-main)",
          border: "1px solid var(--palette-primary-main)",
          gap: "4px",
          "&:hover": {
            backgroundColor: "var(--palette-action-hover)"
          }
        }}
      >
        <SaveIcon sx={{ fontSize: "14px" }} />
        <span>{saving ? "Saving…" : "Save to image"}</span>
      </EditorButton>
    </Tooltip>
  );
});

SaveImageEditPill.displayName = "SaveImageEditPill";

export default SaveImageEditPill;
