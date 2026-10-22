import React, { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  TextArea,
  SPACING
} from "../../ui_primitives";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useDirectGenPendingStore } from "../../../hooks/timeline/directGenPending";
import { useLineDeliveryRevision } from "../../../hooks/timeline/useLineDeliveryRevision";
import { useScriptStore, effectiveVoice } from "../../../stores/script/ScriptStore";
import { InspectorSectionTitle } from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

interface LineDeliveryPanelProps {
  clipId: string;
}

/** Revise a Script-linked voiceover without replacing its accepted take. */
const LineDeliveryPanel: React.FC<LineDeliveryPanelProps> = ({ clipId }) => {
  const { t } = useTranslation();
  const clip = useTimelineStore((state) => findClipById(state.clips, clipId));
  const sequenceId = useTimelineStore((state) => state.sequenceId);
  const script = useScriptStore((state) =>
    clip?.scriptId ? state.scripts[clip.scriptId] : undefined
  );
  const line = useMemo(
    () =>
      script?.sections
        .flatMap((section) => section.lines)
        .find((candidate) => candidate.id === clip?.scriptLineId),
    [clip?.scriptLineId, script]
  );
  const { reviseLine } = useLineDeliveryRevision();
  const pending = useDirectGenPendingStore((state) =>
    sequenceId
      ? state.pending[sequenceId]?.some(
          (job) => job.clipId === clipId && job.lineDelivery !== undefined
        )
      : false
  );
  const [open, setOpen] = usePersistedFold("line-delivery", true);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!clip || clip.mediaType !== "audio" || !clip.scriptId || !clip.scriptLineId) {
    return null;
  }
  if (!script || !line) {
    return (
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title={t("pass3_30.lineDelivery.title")}
            icon={<AutoAwesomeOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
      >
        <EmptyState
          variant="empty"
          size="small"
          title={t("pass3_30.lineDelivery.contextUnavailable.title")}
          description={t("pass3_30.lineDelivery.contextUnavailable.description")}
        />
      </CollapsibleSection>
    );
  }

  const voice = effectiveVoice(line, script.cast);
  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const requestId = await reviseLine({
      clipId,
      instructions: instructions.trim() || undefined
    });
    if (!requestId) {
      setError(t("pass3_30.lineDelivery.submitError"));
    } else {
      setInstructions("");
    }
  };

  return (
    <CollapsibleSection
      title={
        <InspectorSectionTitle
          title={t("pass3_30.lineDelivery.title")}
          icon={<AutoAwesomeOutlinedIcon />}
        />
      }
      open={open}
      onToggle={setOpen}
    >
      <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md }}>
        <Caption color="secondary">
          {voice
            ? t("pass3_30.lineDelivery.usingVoice", {
                voice: voice.voice,
                line: line.text
              })
            : t("pass3_30.lineDelivery.assignVoice")}
        </Caption>
        {line.direction && (
          <Caption color="secondary">
            {t("pass3_30.lineDelivery.direction", { direction: line.direction })}
          </Caption>
        )}
        <TextArea
          value={instructions}
          onChange={(value) => setInstructions(value)}
          placeholder={t("pass3_30.lineDelivery.directionPlaceholder")}
          minRows={2}
          maxRows={5}
          compact
          fullWidth
          inputProps={{ "aria-label": t("pass3_30.lineDelivery.directionLabel") }}
          disabled={pending || !voice}
        />
        <EditorButton
          fullWidth
          variant={pending ? "outlined" : "contained"}
          disabled={!voice}
          loading={pending}
          onClick={() => void handleSubmit()}
          startIcon={<AutoAwesomeOutlinedIcon />}
        >
          {pending
            ? t("pass3_30.lineDelivery.generating")
            : t("pass3_30.lineDelivery.title")}
        </EditorButton>
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("pass3_30.lineDelivery.errorSummary"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

LineDeliveryPanel.displayName = "LineDeliveryPanel";

export default memo(LineDeliveryPanel);
