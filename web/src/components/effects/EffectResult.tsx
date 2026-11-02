/**
 * EffectResult
 *
 * Where the effect's result appears, in place: a running state, the finished
 * video or picture, or the reason it failed with the next step. With nothing
 * to show it still offers the next step (UX Guidelines 4.1).
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  MagicGenerationFill,
  MediaThumbnail,
  SPACING
} from "../ui_primitives";
import type { EffectRun } from "../../stores/EffectsGalleryStore";
import type { EffectResultKind } from "./effectsRun";

interface EffectResultProps {
  run: EffectRun;
  /** The name of the effect the run applied. */
  effectName: string | null;
  kind: EffectResultKind;
  /** Whether a picture and an effect are ready, so the empty state can say what is left. */
  hasPicture: boolean;
  onRetry: () => void;
  canRetry: boolean;
}

const EffectResult = ({
  run,
  effectName,
  kind,
  hasPicture,
  onRetry,
  canRetry
}: EffectResultProps) => {
  const { t } = useTranslation();
  const name = effectName ?? "";

  if (run.status === "running") {
    return (
      <FlexColumn gap={SPACING.sm} data-testid="effects-result-running">
        <Box sx={{ position: "relative", aspectRatio: "16/10" }}>
          <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />
        </Box>
        <FlexRow gap={SPACING.sm} align="center" role="status">
          <LoadingSpinner size="small" />
          <Caption color="secondary">
            {t("effectsGallery.result.running", { effect: name })}
          </Caption>
        </FlexRow>
      </FlexColumn>
    );
  }

  if (run.status === "failed") {
    return (
      <AlertBanner
        severity="error"
        data-testid="effects-result-error"
        action={
          canRetry ? (
            <EditorButton variant="outlined" size="small" onClick={onRetry}>
              {t("effectsGallery.result.tryAgain")}
            </EditorButton>
          ) : undefined
        }
      >
        {run.error
          ? t("effectsGallery.result.failedWithReason", {
              reason: /[.!?]$/.test(run.error) ? run.error : `${run.error}.`
            })
          : t("effectsGallery.result.failed")}
      </AlertBanner>
    );
  }

  const assetId = run.assetIds[0];
  if (run.status === "done" && assetId) {
    return (
      <FlexColumn gap={SPACING.sm} data-testid="effects-result">
        <MediaThumbnail
          locator={{ asset_id: assetId }}
          kind={kind}
          interactive
          alt={t("effectsGallery.result.alt", { effect: name })}
          aspectRatio="16/10"
          fit="contain"
        />
        <Caption color="secondary" role="status">
          {t("effectsGallery.result.done", { effect: name })}
        </Caption>
      </FlexColumn>
    );
  }

  return (
    <EmptyState
      size="small"
      icon={<AutoAwesomeOutlinedIcon />}
      title={t("effectsGallery.result.emptyTitle")}
      description={
        hasPicture
          ? t("effectsGallery.result.emptyPickEffect")
          : t("effectsGallery.result.emptyAddPicture")
      }
    />
  );
};

export default memo(EffectResult);
