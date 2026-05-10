/** @jsxImportSource @emotion/react */
/**
 * SketchAIToolbar
 *
 * Compact action row holding the document-scoped AI-layer controls:
 *
 *   - "Inpaint Here" — creates a new generated layer above the active
 *     layer, seeded with the current selection mask + a flattened
 *     context image, bound to the seeded Inpaint template.
 *   - "Re-generate Stale Layers" — runs every binding currently flagged
 *     `stale` in dependency order (sequential, single-job at a time).
 *
 * Both actions surface a confirmation Dialog so the user can review the
 * impact before kicking off potentially-expensive workflow runs.
 */

import React, { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import RefreshIcon from "@mui/icons-material/Refresh";

import {
  Dialog,
  EditorButton,
  FlexRow,
  Text,
  Toast,
  Tooltip
} from "../../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useSketchStore } from "../state/useSketchStore";
import { useInpaintHere } from "../../../hooks/sketch/useInpaintHere";
import { useRegenerateStaleLayers } from "../../../hooks/sketch/useRegenerateStaleLayers";

const SketchAIToolbarInner: React.FC = () => {
  const theme = useTheme();
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);

  const { inpaintHere, isBusy: inpaintBusy } = useInpaintHere();
  const { preflight, regenerateStaleLayers, isBusy: regenBusy } =
    useRegenerateStaleLayers();

  const [error, setError] = useState<string | null>(null);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);

  const handleInpaint = useCallback(async () => {
    const result = await inpaintHere();
    if (!result.ok) {
      switch (result.reason) {
        case "no-selection":
          setError("Make a selection first to inpaint here.");
          return;
        case "no-document":
          setError("No image document is open.");
          return;
        case "no-canvas":
          setError("Canvas is not ready yet.");
          return;
        case "error":
          setError(result.message ?? "Inpaint Here failed.");
          return;
      }
    }
  }, [inpaintHere]);

  const { staleLayerIds, lockedLayerIds } = preflight();
  const staleCount = staleLayerIds.length;

  const handleConfirmRegen = useCallback(async () => {
    setConfirmRegenOpen(false);
    const summary = await regenerateStaleLayers();
    if (summary.failed > 0) {
      setError(
        `Regenerated ${summary.started}, failed at ${summary.failed} layer(s).`
      );
    }
  }, [regenerateStaleLayers]);

  return (
    <>
      <FlexRow
        align="center"
        gap={0.5}
        sx={{
          padding: theme.spacing(0.5, 1),
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          flexWrap: "wrap"
        }}
      >
        <Tooltip
          title={
            hasActiveSelection
              ? "Inpaint Here — creates a new generated layer using the selection as a mask."
              : "Make a selection to enable Inpaint Here."
          }
          delay={TOOLTIP_ENTER_DELAY}
          placement="bottom"
        >
          <span>
            <EditorButton
              onClick={() => void handleInpaint()}
              disabled={!hasActiveSelection || inpaintBusy}
              size="small"
              startIcon={<AutoFixHighIcon fontSize="small" />}
              data-testid="sketch-action-inpaint-here"
            >
              Inpaint Here
            </EditorButton>
          </span>
        </Tooltip>

        <Tooltip
          title={
            staleCount === 0
              ? "No stale layers."
              : `Re-generate ${staleCount} stale layer${staleCount === 1 ? "" : "s"} in dependency order.`
          }
          delay={TOOLTIP_ENTER_DELAY}
          placement="bottom"
        >
          <span>
            <EditorButton
              onClick={() => setConfirmRegenOpen(true)}
              disabled={staleCount === 0 || regenBusy}
              size="small"
              startIcon={<RefreshIcon fontSize="small" />}
              data-testid="sketch-action-regenerate-stale"
            >
              Re-generate Stale ({staleCount})
            </EditorButton>
          </span>
        </Tooltip>
      </FlexRow>

      <Dialog
        open={confirmRegenOpen}
        onClose={() => setConfirmRegenOpen(false)}
        title="Re-generate stale layers?"
        onConfirm={() => void handleConfirmRegen()}
        onCancel={() => setConfirmRegenOpen(false)}
        confirmText="Re-generate"
        cancelText="Cancel"
        showActions
      >
        <Text size="small" sx={{ mb: 1 }}>
          {staleCount} stale layer{staleCount === 1 ? " is" : "s are"} ready to
          run.
          {lockedLayerIds.length > 0 && (
            <>
              {" "}
              {lockedLayerIds.length} locked layer
              {lockedLayerIds.length === 1 ? " is" : "s are"} skipped.
            </>
          )}{" "}
          Layers run sequentially; the queue stops at the first failure so you
          can address it before continuing.
        </Text>
      </Dialog>

      <Toast
        open={error !== null}
        message={error ?? ""}
        severity="warning"
        onClose={() => setError(null)}
        vertical="top"
        horizontal="center"
      />
    </>
  );
};

export const SketchAIToolbar = memo(SketchAIToolbarInner);
SketchAIToolbar.displayName = "SketchAIToolbar";

export default SketchAIToolbar;
