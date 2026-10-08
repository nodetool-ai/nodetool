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

const PromptBlock: React.FC<{ label: string; text: string }> = ({
  label,
  text
}) => (
  <FlexColumn gap={SPACING.xs}>
    <FlexRow align="center" gap={SPACING.xs}>
      <Label sx={{ color: "text.secondary" }}>{label}</Label>
      <CopyButton value={text} tooltip={`Copy ${label.toLowerCase()}`} buttonSize="small" />
    </FlexRow>
    <Box sx={promptSx}>{text || "Nothing to send yet."}</Box>
  </FlexColumn>
);

const ShotPromptPreviewInner: React.FC<ShotPromptPreviewProps> = ({
  shot,
  scene,
  style,
  castNames
}) => {
  const mode = shotRenderMode(shot);
  const { still, clip } = useMemo(
    () => ({
      still: keyframePrompt(shot, { scene, style }),
      clip: clipPromptFor(shot, { scene, style }, mode)
    }),
    [shot, scene, style, mode]
  );

  return (
    <CollapsibleSection title="Prompts" compact unmountOnExit>
      <FlexColumn gap={SPACING.md}>
        {mode === "keyframe" && <PromptBlock label="Still prompt" text={still} />}
        <PromptBlock label="Clip prompt" text={clip} />
        {castNames.length > 0 && (
          <Caption color="secondary">
            {`Reference images for ${castNames.join(", ")} are attached when the render starts.`}
          </Caption>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export const ShotPromptPreview = memo(ShotPromptPreviewInner);
ShotPromptPreview.displayName = "ShotPromptPreview";

export default ShotPromptPreview;
