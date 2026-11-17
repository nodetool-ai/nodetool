/** @jsxImportSource @emotion/react */
/**
 * The clip panels beside the Inspector, one owner per control as in the
 * native editor: Effect Controls (Render or Audio, Transform, Time Remapping,
 * Effects, Mask and Matte), Motion (Animate and Drive from audio), Color, and
 * AI (generation, AI edit and extend, line delivery, subject matte, smart
 * reframe and tracking). Each panel shows the single selected clip.
 */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";

import type { TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { usePersistedFold } from "./usePersistedFold";
import {
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  Panel,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import {
  InspectorDivider,
  InspectorSectionTitle,
  sectionContentStyles
} from "./InspectorPrimitives";
import { ClipAdjustments } from "./ClipAdjustments";
import { ClipAnimations } from "./ClipAnimations";
import { ClipAudioDrive } from "./ClipAudioDrive";
import { ClipEffectsList } from "./ClipEffectsList";
import { ClipMaskMatte, ClipSubjectMatte } from "./ClipMaskMatte";
import { ClipReframe } from "./ClipReframe";
import { ClipTimeRemapSection } from "./ClipTimeRemap";
import { ClipTracking } from "./ClipTracking";
import { KeyframedPropertyRow } from "./KeyframedPropertyRow";
import { OPACITY_ROW } from "./keyframeRows";
import { GeneratedClipPanel } from "./GeneratedClipPanel";
import { DirectGenClipPanel } from "./DirectGenClipPanel";
import AIEditClipPanel from "./AIEditClipPanel";
import ExtendClipPanel from "./ExtendClipPanel";
import ImageToVideoPanel from "./ImageToVideoPanel";
import LineDeliveryPanel from "./LineDeliveryPanel";

const containerStyles = css({
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xxl)}`,
  overflow: "auto"
});

const panelSx = {
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto",
  boxSizing: "border-box"
};

const PanelFrame: React.FC<{ children: React.ReactNode; testId: string }> = ({
  children,
  testId
}) => (
  <Panel
    background="default"
    bordered={false}
    css={containerStyles}
    sx={panelSx}
    data-testid={testId}
  >
    {children}
  </Panel>
);

/** The words a panel shows when it has no clip to work on. */
interface PanelCopy {
  /** Nothing selected. */
  empty: string;
  /** More than one clip selected. */
  several: string;
  /** The selected clip has nothing for this panel. */
  unsupportedTitle: string;
  unsupported: string;
}

interface SingleClipPanelProps {
  testId: string;
  copy: PanelCopy;
  supports: (clip: TimelineClip) => boolean;
  render: (clip: TimelineClip) => React.ReactNode;
}

/** The selected clip, or why there is none, framed like the Inspector. */
const SingleClipPanel: React.FC<SingleClipPanelProps> = ({
  testId,
  copy,
  supports,
  render
}) => {
  const { t } = useTranslation();
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  const clip = useTimelineStore((s) =>
    clipId ? (findClipById(s.clips, clipId) ?? null) : null
  );
  if (selectedClipIds.size > 1) {
    return (
      <PanelFrame testId={testId}>
        <EmptyState
          variant="empty"
          size="small"
          title={t("timelineClipPanels.severalClips")}
          description={copy.several}
        />
      </PanelFrame>
    );
  }
  if (!clip) {
    return (
      <PanelFrame testId={testId}>
        <EmptyState
          variant="empty"
          size="small"
          title={t("timelineClipPanels.noClip")}
          description={copy.empty}
        />
      </PanelFrame>
    );
  }
  if (!supports(clip)) {
    return (
      <PanelFrame testId={testId}>
        <EmptyState
          variant="empty"
          size="small"
          title={copy.unsupportedTitle}
          description={copy.unsupported}
        />
      </PanelFrame>
    );
  }
  return <>{render(clip)}</>;
};

// ── Effect Controls ────────────────────────────────────────────────────────

/**
 * An adjustment clip draws nothing of its own, so it has no transform or
 * blend mode: only opacity, its effect chain and the mask half of
 * mask/matte (it is never a matte target).
 */
const AdjustmentEffectControls: React.FC<{ clip: TimelineClip }> = memo(
  ({ clip }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const [renderOpen, setRenderOpen] = usePersistedFold("render");
    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_30.timelineInspector.sections.render")}
              icon={<LayersOutlinedIcon />}
            />
          }
          open={renderOpen}
          onToggle={setRenderOpen}
          unmountOnExit
        >
          <FlexColumn css={sectionContentStyles(theme)}>
            <KeyframedPropertyRow clip={clip} row={OPACITY_ROW} />
          </FlexColumn>
        </CollapsibleSection>
        <ClipEffectsList clip={clip} />
        <ClipMaskMatte clip={clip} hideMatte />
      </>
    );
  }
);
AdjustmentEffectControls.displayName = "AdjustmentEffectControls";

const renderEffectControls = (clip: TimelineClip): React.ReactNode => (
  <PanelFrame testId="timeline-effect-controls">
    {clip.mediaType === "adjustment" ? (
      <AdjustmentEffectControls clip={clip} />
    ) : (
      <>
        <ClipAdjustments clip={clip} part="effectControls" />
        {clip.mediaType !== "midi" && clip.mediaType !== "group" && (
          <ClipTimeRemapSection clip={clip} />
        )}
      </>
    )}
  </PanelFrame>
);

const supportsAnyClip = (): boolean => true;

export const TimelineEffectControlsPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SingleClipPanel
      testId="timeline-effect-controls-panel"
      copy={{
        empty: t("timelineClipPanels.effectControls.empty"),
        several: t("timelineClipPanels.effectControls.several"),
        unsupportedTitle: "",
        unsupported: ""
      }}
      supports={supportsAnyClip}
      render={renderEffectControls}
    />
  );
};

// ── Motion ─────────────────────────────────────────────────────────────────

const supportsMotion = (clip: TimelineClip): boolean =>
  clip.mediaType !== "midi";

const renderMotion = (clip: TimelineClip): React.ReactNode => (
  <PanelFrame testId="timeline-motion">
    <ClipAnimations clip={clip} />
    {clip.mediaType !== "group" && clip.mediaType !== "adjustment" && (
      <ClipAudioDrive key={`audio-drive-${clip.id}`} clip={clip} />
    )}
  </PanelFrame>
);

export const TimelineMotionPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SingleClipPanel
      testId="timeline-motion-panel"
      copy={{
        empty: t("timelineClipPanels.motion.empty"),
        several: t("timelineClipPanels.motion.several"),
        unsupportedTitle: t("timelineClipPanels.motion.unsupportedTitle"),
        unsupported: t("timelineClipPanels.motion.unsupported")
      }}
      supports={supportsMotion}
      render={renderMotion}
    />
  );
};

// ── Color ──────────────────────────────────────────────────────────────────

const supportsColor = (clip: TimelineClip): boolean =>
  clip.mediaType !== "audio" &&
  clip.mediaType !== "midi" &&
  clip.mediaType !== "adjustment";

const renderColor = (clip: TimelineClip): React.ReactNode => (
  <PanelFrame testId="timeline-color">
    <ClipAdjustments clip={clip} part="color" />
  </PanelFrame>
);

export const TimelineColorPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SingleClipPanel
      testId="timeline-color-panel"
      copy={{
        empty: t("timelineClipPanels.color.empty"),
        several: t("timelineClipPanels.color.several"),
        unsupportedTitle: t("timelineClipPanels.color.unsupportedTitle"),
        unsupported: t("timelineClipPanels.color.unsupported")
      }}
      supports={supportsColor}
      render={renderColor}
    />
  );
};

// ── AI ─────────────────────────────────────────────────────────────────────

const DIRECT_GEN_BINDINGS = new Set([
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "text-to-audio",
  "text-to-music"
]);

/** True when the AI panel has a section for this clip. */
export const clipHasAiTools = (clip: TimelineClip): boolean =>
  clip.sourceType === "generated" ||
  clip.mediaType === "video" ||
  clip.mediaType === "image" ||
  clip.mediaType === "overlay" ||
  clip.mediaType === "text" ||
  clip.mediaType === "shape" ||
  (clip.mediaType === "audio" && !!clip.scriptId && !!clip.scriptLineId);

/** Every AI tool that applies to an existing clip, in the panel's order. */
const AiToolSections: React.FC<{ clip: TimelineClip }> = ({ clip }) => (
  <>
    {clip.mediaType === "video" && (
      <>
        <AIEditClipPanel key={`ai-edit-${clip.id}`} clipId={clip.id} />
        <ExtendClipPanel key={`extend-${clip.id}`} clipId={clip.id} />
      </>
    )}
    {clip.mediaType === "image" && (
      <ImageToVideoPanel key={`image-to-video-${clip.id}`} clipId={clip.id} />
    )}
    <LineDeliveryPanel key={`line-delivery-${clip.id}`} clipId={clip.id} />
    <ClipSubjectMatte clip={clip} />
    {(clip.mediaType === "video" ||
      clip.mediaType === "image" ||
      clip.mediaType === "overlay") && <ClipReframe clip={clip} />}
    <ClipTracking clip={clip} />
    <InspectorDivider />
  </>
);

const renderAi = (clip: TimelineClip): React.ReactNode => {
  if (clip.sourceType === "generated") {
    // The generation form leads, since it made the clip.
    return clip.bindingKind && DIRECT_GEN_BINDINGS.has(clip.bindingKind) ? (
      <DirectGenClipPanel
        clipId={clip.id}
        additionalSections={<AiToolSections clip={clip} />}
      />
    ) : (
      <GeneratedClipPanel
        clipId={clip.id}
        additionalSections={<AiToolSections clip={clip} />}
      />
    );
  }
  return (
    <PanelFrame testId="timeline-ai">
      <AiToolSections clip={clip} />
    </PanelFrame>
  );
};

export const TimelineAiPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SingleClipPanel
      testId="timeline-ai-panel"
      copy={{
        empty: t("timelineClipPanels.ai.empty"),
        several: t("timelineClipPanels.ai.several"),
        unsupportedTitle: t("timelineClipPanels.ai.unsupportedTitle"),
        unsupported: t("timelineClipPanels.ai.unsupported")
      }}
      supports={clipHasAiTools}
      render={renderAi}
    />
  );
};
