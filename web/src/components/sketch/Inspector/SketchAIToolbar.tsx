/** @jsxImportSource @emotion/react */
/** Generate Layer + Re-generate Stale Layers toolbar. */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";

import {
  Dialog,
  EditorButton,
  FlexRow,
  Text,
  Tooltip
} from "../../ui_primitives";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useRegenerateStaleLayers } from "../../../hooks/sketch/useRegenerateStaleLayers";
import { CreateGeneratedLayerDialog } from "./CreateGeneratedLayerDialog";
import { useAlertNotifier } from "../../../hooks/useAlertNotifier";

const SketchAIToolbarInner: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  // Derive the counts directly via Zustand selectors so we don't iterate
  // every binding on every render of the toolbar.
  const staleCount = useSketchSessionStore((s) =>
    Object.values(s.bindings).reduce(
      (n, b) => n + (b.status === "stale" ? 1 : 0),
      0
    )
  );
  const lockedCount = useSketchSessionStore((s) =>
    Object.values(s.bindings).reduce(
      (n, b) => n + (b.status === "locked" ? 1 : 0),
      0
    )
  );

  const { regenerateStaleLayers, isBusy: regenBusy } =
    useRegenerateStaleLayers();

  const reportError = useAlertNotifier("warning");
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const handleConfirmRegen = useCallback(async () => {
    setConfirmRegenOpen(false);
    const summary = await regenerateStaleLayers();
    if (summary.failed > 0) {
      reportError(
        t("i18n-next52.sketch.ai.summary", { started: summary.started, failed: summary.failed })
      );
    }
  }, [regenerateStaleLayers, reportError, t]);

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
          title={t("i18n-next52.sketch.ai.generateTitle")}
          placement="bottom"
        >
          <span>
            <EditorButton
              onClick={() => setGenerateDialogOpen(true)}
              size="small"
              startIcon={<AddPhotoAlternateIcon />}
              data-testid="sketch-action-generate-layer"
            >
              {t("i18n-next52.sketch.ai.generate")}
            </EditorButton>
          </span>
        </Tooltip>

        <Tooltip
          title={
            staleCount === 0
              ? t("i18n-next52.sketch.ai.noStale")
              : t("i18n-next52.sketch.ai.stale", { count: staleCount })
          }
          placement="bottom"
        >
          <span>
            <EditorButton
              onClick={() => setConfirmRegenOpen(true)}
              disabled={staleCount === 0 || regenBusy}
              size="small"
              startIcon={<RefreshIcon />}
              data-testid="sketch-action-regenerate-stale"
            >
              {t("i18n-next52.sketch.ai.regenerate", { count: staleCount })}
            </EditorButton>
          </span>
        </Tooltip>
      </FlexRow>

      <CreateGeneratedLayerDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
      />

      <Dialog
        open={confirmRegenOpen}
        onClose={() => setConfirmRegenOpen(false)}
        title={t("i18n-next52.sketch.ai.confirmTitle")}
        onConfirm={() => void handleConfirmRegen()}
        confirmText={t("i18n-next52.sketch.ai.confirm")}
      >
        <Text size="small">
          {t("i18n-next52.sketch.ai.ready", { count: staleCount })}{" "}
          {lockedCount > 0 && (
            <>
              {t("i18n-next52.sketch.ai.skipped", { count: lockedCount })}{" "}
            </>
          )}
          {t("i18n-next52.sketch.ai.queue")}
        </Text>
      </Dialog>
    </>
  );
};

export const SketchAIToolbar = memo(SketchAIToolbarInner);
SketchAIToolbar.displayName = "SketchAIToolbar";

export default SketchAIToolbar;
