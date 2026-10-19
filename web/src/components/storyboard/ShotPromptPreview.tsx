/**
 * ShotPromptPreview
 *
 * The prompts a render of this shot sends, written out. The shot editor's
 * fields are the inputs; this is what the model reads once the action, the
 * camera, the scene's lighting and the board's style are composed. Reading it
 * answers "why did the still come out like that" without reverse-engineering
 * the composer, and it updates as the draft is typed.
 *
 * The texts come from the same `keyframePrompt` and `clipPromptFor` the render
 * path calls. Cast references are not shown inline: they are attached at
 * render time as reference images, so the caption names them instead.
 */

import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Scene, Shot } from "@nodetool-ai/protocol";
import {
  clipPromptFor,
  keyframePrompt,
  shotRenderMode
} from "@nodetool-ai/protocol";

import {
  Box,
  Caption,
  CollapsibleSection,
  CopyButton,
  FlexColumn,
  FlexRow,
  Label,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";

interface ShotPromptPreviewProps {
  /** The shot as the draft would save it. */
  shot: Shot;
  /** Its scene, with the draft's lighting. */
  scene: Scene | null;
  style: string;
  /** Names of the cast the render attaches as references. */
  castNames: string[];
}

const promptSx = {
  ...TYPOGRAPHY.mono.caption,
  color: "text.secondary",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  p: SPACING.sm,
  borderRadius: BORDER_RADIUS.sm,
  bgcolor: "c_overlay_subtle"
} as const;

interface PromptBlockProps {
  label: string;
  copyLabel: string;
  emptyText: string;
  text: string;
}

const PromptBlock: React.FC<PromptBlockProps> = ({
  label,
  copyLabel,
  emptyText,
  text
}) => (
  <FlexColumn gap={SPACING.xs}>
    <FlexRow align="center" gap={SPACING.xs}>
      <Label sx={{ color: "text.secondary" }}>{label}</Label>
      <CopyButton value={text} tooltip={copyLabel} buttonSize="small" />
    </FlexRow>
    <Box sx={promptSx}>{text || emptyText}</Box>
  </FlexColumn>
);

const ShotPromptPreviewInner: React.FC<ShotPromptPreviewProps> = ({
  shot,
  scene,
  style,
  castNames
}) => {
  const { t } = useTranslation();
  const mode = shotRenderMode(shot);
  const { still, clip } = useMemo(
    () => ({
      still: keyframePrompt(shot, { scene, style }),
      clip: clipPromptFor(shot, { scene, style }, mode)
    }),
    [shot, scene, style, mode]
  );

  return (
    <CollapsibleSection
      title={t("screens4_18.storyboard.shotPromptPreview.title")}
      compact
      unmountOnExit
    >
      <FlexColumn gap={SPACING.md}>
        {mode === "keyframe" && (
          <PromptBlock
            label={t("screens4_18.storyboard.shotPromptPreview.stillPrompt")}
            copyLabel={t(
              "screens4_18.storyboard.shotPromptPreview.copyPrompt",
              {
                promptType: t(
                  "screens4_18.storyboard.shotPromptPreview.stillPrompt"
                )
              }
            )}
            emptyText={t(
              "screens4_18.storyboard.shotPromptPreview.emptyPrompt"
            )}
            text={still}
          />
        )}
        <PromptBlock
          label={t("screens4_18.storyboard.shotPromptPreview.clipPrompt")}
          copyLabel={t(
            "screens4_18.storyboard.shotPromptPreview.copyPrompt",
            {
              promptType: t(
                "screens4_18.storyboard.shotPromptPreview.clipPrompt"
              )
            }
          )}
          emptyText={t(
            "screens4_18.storyboard.shotPromptPreview.emptyPrompt"
          )}
          text={clip}
        />
        {castNames.length > 0 && (
          <Caption color="secondary">
            {t(
              "screens4_18.storyboard.shotPromptPreview.referenceImages",
              {
                count: castNames.length,
                names: castNames.join(", ")
              }
            )}
          </Caption>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export const ShotPromptPreview = memo(ShotPromptPreviewInner);
ShotPromptPreview.displayName = "ShotPromptPreview";

export default ShotPromptPreview;
