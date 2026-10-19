/**
 * DerivedShotSection
 *
 * Derive a new shot from the selected shot clip: take N frames of its footage
 * as references, add the shot after this one on the board, and put its clip on
 * a new track above this one over the same span. The render dialog opens on
 * the new shot, so the first take can start straight away; the new clip is
 * selected when the dialog closes.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_DERIVED_FRAMES } from "@nodetool-ai/timeline";

import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FormField,
  SelectField,
  TextArea,
  SPACING
} from "../../ui_primitives";
import ShotRenderDialog from "../../storyboard/ShotRenderDialog";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useDeriveShotFromClip,
  type DerivedShot
} from "../../../hooks/timeline/useDeriveShotFromClip";
import { getErrorMessage } from "../../../utils/errorHandling";

interface DerivedShotSectionProps {
  clipId: string;
}

const DerivedShotSectionInner = ({ clipId }: DerivedShotSectionProps) => {
  const { t } = useTranslation();
  const { derive } = useDeriveShotFromClip();
  const selectClip = useTimelineUIStore((state) => state.selectClip);
  const [frameCount, setFrameCount] = useState("3");
  const [action, setAction] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derived, setDerived] = useState<DerivedShot | null>(null);
  const frameCountOptions = Array.from(
    { length: MAX_DERIVED_FRAMES },
    (_, i) => ({
      value: String(i + 1),
      label: t("batch2_28.derived.frameCount", { count: i + 1 })
    })
  );

  const handleDerive = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      setDerived(
        await derive({ clipId, frameCount: Number(frameCount), action })
      );
      setAction("");
    } catch (failure) {
      setError(getErrorMessage(failure, t("batch2_28.derived.errorFallback")));
    } finally {
      setWorking(false);
    }
  }, [action, clipId, derive, frameCount, t]);

  const handleRenderClose = useCallback(() => {
    if (derived) {
      selectClip(derived.clipId);
    }
    setDerived(null);
  }, [derived, selectClip]);

  return (
    <FlexColumn gap={SPACING.sm} data-testid="derived-shot-section">
      <Caption color="secondary">{t("batch2_28.derived.description")}</Caption>
      <FormField label={t("batch2_28.derived.referenceFrames")}>
        <SelectField
          size="small"
          label={t("batch2_28.derived.referenceFrames")}
          hideLabel
          value={frameCount}
          onChange={setFrameCount}
          options={frameCountOptions}
          disabled={working}
        />
      </FormField>
      <TextArea
        label={t("batch2_28.derived.descriptionLabel")}
        value={action}
        onChange={(value) => setAction(value)}
        placeholder={t("batch2_28.derived.descriptionPlaceholder")}
        maxRows={6}
        compact
        fullWidth
        disabled={working}
      />
      <EditorButton
        fullWidth
        variant="outlined"
        onClick={() => void handleDerive()}
        disabled={working}
        data-testid="derived-shot-create"
      >
        {working
          ? t("batch2_28.derived.takingFrames")
          : t("batch2_28.derived.create")}
      </EditorButton>
      {error && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: t("batch2_28.derived.errorSummary"),
            errorText: error
          }}
        >
          {error}
        </ErrorBanner>
      )}
      {derived && (
        <ShotRenderDialog
          boardId={derived.boardId}
          shot={derived.shot}
          step="clip"
          onClose={handleRenderClose}
        />
      )}
    </FlexColumn>
  );
};

export const DerivedShotSection = memo(DerivedShotSectionInner);
DerivedShotSection.displayName = "DerivedShotSection";

export default DerivedShotSection;
