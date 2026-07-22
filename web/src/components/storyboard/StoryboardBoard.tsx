/** @jsxImportSource @emotion/react */
/**
 * StoryboardBoard
 *
 * The board header (title, brief, style, aspect ratio, shot count, and a
 * "Direct" trigger) plus a responsive grid of {@link ShotCard}s. The Direct
 * button is a placeholder that forwards to an `onDirect` callback so a parent
 * can wire it to a real Director run.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  FlexColumn,
  FlexRow,
  FormField,
  FormGrid,
  FormSection,
  Panel,
  TextInput,
  SelectField,
  EditorButton,
  UndoRedoButtons,
  EmptyState,
  Dialog,
  Divider,
  Text,
  Caption,
  CONTROL,
  SPACING,
  getSpacingPx,
  BORDER_RADIUS,
  MOTION
} from "../ui_primitives";
import {
  useBoard,
  useStoryboardStore,
  useStoryboardCanUndo,
  useStoryboardCanRedo
} from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import {
  useImageModelsByProvider,
  type ImageModelTask
} from "../../hooks/useModelsByProvider";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import ShotCard from "./ShotCard";
import StoryboardEntitiesField from "./StoryboardEntitiesField";

interface StoryboardBoardProps {
  boardId: string;
  readOnly?: boolean;
  /** Wired by the parent to a Director run; receives the requested shot count. */
  onDirect?: (shotCount: number) => void;
  /** True while a Director run is in flight (disables and relabels the button). */
  directing?: boolean;
  /** Error from the last Director run, shown under the header fields. */
  directError?: string | null;
  /** Wired by the parent to the timeline handoff. */
  onAssemble?: () => void;
  /** True while assembly is in flight. */
  assembling?: boolean;
  /** Error from the last assembly, shown under the header fields. */
  assembleError?: string | null;
}

const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9 — Widescreen" },
  { value: "9:16", label: "9:16 — Vertical" },
  { value: "1:1", label: "1:1 — Square" },
  { value: "4:3", label: "4:3 — Classic" },
  { value: "21:9", label: "21:9 — Cinematic" }
] as const;

const SHOT_COUNT_OPTIONS = [3, 4, 5, 6, 8, 10, 12].map((n) => ({
  value: n,
  label: `${n} shots`
}));

// Stills can come from a plain generator or an editing model; the latter can
// take entity reference images, so the picker offers both.
const STILL_MODEL_TASKS: ImageModelTask[] = ["text_to_image", "image_to_image"];

// The model pickers are custom buttons, not InputBase controls; hold them at
// the shared form-control height. Scoped to the picker's own class so no
// other button that ends up inside the field is affected.
const modelFieldSx = {
  "& .select-model-button": { minHeight: `${CONTROL.height.lg}px` }
} as const;

const styles = (theme: Theme) =>
  css({
    height: "100%",
    overflowY: "auto",
    padding: getSpacingPx(SPACING.lg),
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.lg),
    // Children must keep their natural height so the container scrolls;
    // otherwise the header panel gets flex-shrunk under the grid.
    "> *": { flexShrink: 0 },
    ".shot-list": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.md)
    },
    // ── Directing: ghost cards materializing while the screenplay is written ──
    "@keyframes storyboard-ghost-in": {
      from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
      to: { opacity: 1, transform: "translateY(0) scale(1)" }
    },
    "@keyframes storyboard-shimmer": {
      from: { backgroundPosition: "200% 0" },
      to: { backgroundPosition: "-200% 0" }
    },
    "@keyframes storyboard-spark": {
      "0%, 100%": { opacity: 0.35, transform: "scale(0.9) rotate(0deg)" },
      "50%": { opacity: 0.9, transform: "scale(1.15) rotate(90deg)" }
    },
    ".directing-line": {
      color: theme.vars.palette.primary.main,
      backgroundImage: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.text.secondary}, ${theme.vars.palette.primary.main})`,
      backgroundSize: "200% 100%",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animation: `storyboard-shimmer ${MOTION.spin} infinite`
    },
    ".ghost-card": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      padding: getSpacingPx(SPACING.md),
      display: "grid",
      gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)",
      gap: getSpacingPx(SPACING.md),
      alignItems: "start",
      opacity: 0,
      animation: `storyboard-ghost-in ${MOTION.slow} both`,
      "@media (max-width: 720px)": {
        gridTemplateColumns: "minmax(0, 1fr)"
      }
    },
    ".ghost-lines": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm)
    },
    ".ghost-frame": {
      aspectRatio: "16 / 9",
      borderRadius: BORDER_RADIUS.sm,
      display: "grid",
      placeItems: "center",
      backgroundImage: `linear-gradient(100deg, ${theme.vars.palette.c_overlay_subtle} 40%, ${theme.vars.palette.action.selected} 50%, ${theme.vars.palette.c_overlay_subtle} 60%)`,
      backgroundSize: "200% 100%",
      animation: `storyboard-shimmer ${MOTION.spin} infinite`
    },
    ".ghost-line": {
      height: "10px",
      borderRadius: BORDER_RADIUS.pill,
      backgroundImage: `linear-gradient(100deg, ${theme.vars.palette.c_overlay_subtle} 40%, ${theme.vars.palette.action.selected} 50%, ${theme.vars.palette.c_overlay_subtle} 60%)`,
      backgroundSize: "200% 100%",
      animation: `storyboard-shimmer ${MOTION.spin} infinite`
    },
    ".spark": {
      fontSize: "1.5em",
      color: theme.vars.palette.primary.main,
      animation: `storyboard-spark ${MOTION.pulse} infinite`
    },
    "@media (prefers-reduced-motion: reduce)": {
      ".ghost-frame, .ghost-line, .directing-line, .spark": {
        animation: "none"
      },
      ".ghost-card": { animation: "none", opacity: 1 }
    },
    ".header-fields": {
      color: theme.vars.palette.text.secondary,
      // Keep the writing fields at a readable measure on wide screens.
      maxWidth: "1100px",
      // Rule between the columns, dropped when they stack.
      ".settings": {
        paddingLeft: getSpacingPx(SPACING.xl),
        borderLeft: `1px solid ${theme.vars.palette.divider}`,
        "@media (max-width: 860px)": {
          paddingLeft: 0,
          borderLeft: "none"
        }
      }
    }
  });

const StoryboardBoardInner: React.FC<StoryboardBoardProps> = ({
  boardId,
  readOnly,
  onDirect,
  directing,
  directError,
  onAssemble,
  assembling,
  assembleError
}) => {
  const theme = useTheme();
  const {
    title,
    brief,
    style,
    entityIds,
    aspectRatio,
    directorModel,
    imageModel,
    videoModel,
    shots
  } = useBoard(boardId);

  const setTitle = useStoryboardStore((state) => state.setTitle);
  const setBrief = useStoryboardStore((state) => state.setBrief);
  const setStyle = useStoryboardStore((state) => state.setStyle);
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setDirectorModel = useStoryboardStore((state) => state.setDirectorModel);
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const setVideoModel = useStoryboardStore((state) => state.setVideoModel);
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  const canUndo = useStoryboardCanUndo(boardId);
  const canRedo = useStoryboardCanRedo(boardId);
  const onUndo = useCallback(() => undo(boardId), [undo, boardId]);
  const onRedo = useCallback(() => redo(boardId), [redo, boardId]);

  const [shotCount, setShotCount] = useState<number>(6);
  const [confirmRedirect, setConfirmRedirect] = useState(false);

  const hasShots = shots.length > 0;

  // Entity reference images only reach generation through an editing model;
  // warn when entities are attached but the still model can't take them.
  const { models: imageModels } = useImageModelsByProvider();
  const stillModelDetails = imageModel?.id
    ? imageModels.find((m) => m.id === imageModel.id)
    : undefined;
  const entitiesNeedEditModel =
    entityIds.length > 0 &&
    !stillModelDetails?.supported_tasks?.includes("image_to_image");

  const runDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  // Directing rewrites the whole screenplay, replacing every existing shot
  // (and its generated stills and clips). Confirm before clobbering work.
  const handleDirect = useCallback(() => {
    if (hasShots) {
      setConfirmRedirect(true);
      return;
    }
    runDirect();
  }, [hasShots, runDirect]);

  const handleConfirmRedirect = useCallback(() => {
    setConfirmRedirect(false);
    runDirect();
  }, [runDirect]);

  const hasRenderedShot = useMemo(
    () => shots.some((s) => s.status === "rendered" && !!s.clip?.asset_id),
    [shots]
  );

  const pendingStills = useMemo(
    () =>
      shots.filter(
        (s) => !s.keyframe && (s.status === "planned" || s.status === "failed")
      ),
    [shots]
  );

  const pendingClips = useMemo(
    () =>
      shots.filter(
        (s) =>
          !!s.keyframe &&
          !s.clip &&
          s.status !== "keyframe_generating" &&
          s.status !== "clip_generating"
      ),
    [shots]
  );

  const { generateKeyframe, generateClip } = useGenerateShot();
  const handleGenerateAllStills = useCallback(() => {
    for (const shot of pendingStills) {
      void generateKeyframe(boardId, shot);
    }
  }, [pendingStills, generateKeyframe, boardId]);
  const handleGenerateAllClips = useCallback(() => {
    for (const shot of pendingClips) {
      void generateClip(boardId, shot);
    }
  }, [pendingClips, generateClip, boardId]);

  return (
    <div css={styles(theme)} className="storyboard-board">
      {!readOnly && (
        <Panel padding="normal" className="header-fields">
          <FlexColumn gap={4}>
            <FormGrid>
              <FormSection label="Screenplay">
                <FormField label="Title">
                  <TextInput
                    value={title}
                    placeholder="Untitled film"
                    onChange={(e) => setTitle(boardId, e.target.value)}
                  />
                </FormField>
                <FormField label="Brief">
                  <TextInput
                    value={brief}
                    placeholder="Your film in one or two sentences"
                    onChange={(e) => setBrief(boardId, e.target.value)}
                    multiline
                    rows={3}
                  />
                </FormField>
                <FormField label="Style">
                  <TextInput
                    value={style}
                    placeholder="Palette, light, lens, texture"
                    onChange={(e) => setStyle(boardId, e.target.value)}
                  />
                </FormField>
                <FormField label="Entities">
                  <StoryboardEntitiesField
                    boardId={boardId}
                    entityIds={entityIds}
                  />
                </FormField>
              </FormSection>

              <FormSection label="Direction" className="settings">
                <FormField label="Screenplay model" sx={modelFieldSx}>
                  <LanguageModelSelect
                    value={directorModel?.id ?? ""}
                    onChange={(value) => setDirectorModel(boardId, value)}
                  />
                </FormField>
                <FormField label="Still model" sx={modelFieldSx}>
                  <ImageModelSelect
                    value={imageModel?.id ?? ""}
                    task={STILL_MODEL_TASKS}
                    onChange={(value) => setImageModel(boardId, value)}
                  />
                  {entitiesNeedEditModel && (
                    <Text size="small" color="warning">
                      Entities carry reference images, but this model only
                      takes text. Pick an image-to-image model to use them.
                    </Text>
                  )}
                </FormField>
                <FormField label="Clip model" sx={modelFieldSx}>
                  <VideoModelSelect
                    value={videoModel?.id ?? ""}
                    task="image_to_video"
                    onChange={(value) => setVideoModel(boardId, value)}
                  />
                </FormField>
                <FormField label="Aspect ratio">
                  <SelectField
                    label="Aspect ratio"
                    value={aspectRatio}
                    onChange={(value) => setAspectRatio(boardId, value)}
                    options={ASPECT_OPTIONS}
                  />
                </FormField>
                <FormField label="Shots">
                  <SelectField
                    label="Shots"
                    value={shotCount}
                    onChange={(value) => setShotCount(Number(value))}
                    options={SHOT_COUNT_OPTIONS}
                  />
                </FormField>
              </FormSection>
            </FormGrid>

            <Divider />

            <FlexRow gap={2} align="center" justify="space-between" wrap>
              <Text size="small" color={directError || assembleError ? "error" : "secondary"}>
                {directError ??
                  assembleError ??
                  (hasShots
                    ? "Re-directing rewrites the screenplay and replaces every shot."
                    : "Direct writes the screenplay and seeds your shots.")}
              </Text>
              <FlexRow gap={2} align="center">
                <UndoRedoButtons
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  undoTooltip="Undo (⌘Z)"
                  redoTooltip="Redo (⌘⇧Z)"
                />
                <EditorButton
                  variant="outlined"
                  onClick={handleGenerateAllStills}
                  disabled={pendingStills.length === 0 || directing}
                >
                  {`✦ Generate all stills${pendingStills.length > 0 ? ` (${pendingStills.length})` : ""}`}
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  onClick={handleGenerateAllClips}
                  disabled={pendingClips.length === 0 || directing}
                >
                  {`✦ Generate all clips${pendingClips.length > 0 ? ` (${pendingClips.length})` : ""}`}
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  onClick={onAssemble}
                  disabled={!onAssemble || assembling || !hasRenderedShot}
                >
                  {assembling ? "Assembling…" : "Assemble timeline"}
                </EditorButton>
                <EditorButton
                  variant="contained"
                  color="primary"
                  onClick={handleDirect}
                  disabled={!onDirect || directing}
                >
                  {directing ? "Directing…" : hasShots ? "Re-direct" : "Direct"}
                </EditorButton>
              </FlexRow>
            </FlexRow>
          </FlexColumn>
        </Panel>
      )}

      <Dialog
        open={confirmRedirect}
        onClose={() => setConfirmRedirect(false)}
        title="Re-direct this storyboard?"
        onConfirm={handleConfirmRedirect}
        confirmText="Re-direct"
        destructive
      >
        <FlexColumn gap={1}>
          <Text size="small">
            {`Directing writes a new screenplay and replaces all ${shots.length} current shot${shots.length === 1 ? "" : "s"}.`}
          </Text>
          <Caption color="secondary">
            Generated stills and clips stay in your asset library, but the
            shots on this board are rebuilt from scratch.
          </Caption>
        </FlexColumn>
      </Dialog>

      {directing ? (
        <>
          <Text size="small" className="directing-line">
            ✦ The director is writing your screenplay…
          </Text>
          <div className="shot-list">
            {Array.from({ length: shotCount }).map((_, i) => (
              <div
                key={i}
                className="ghost-card"
                style={{ animationDelay: `${i * 140}ms` }}
              >
                <div className="ghost-frame">
                  <span className="spark">✦</span>
                </div>
                <div className="ghost-lines">
                  <div className="ghost-line" style={{ width: "40%" }} />
                  <div className="ghost-line" style={{ width: "85%" }} />
                  <div className="ghost-line" style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : shots.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No shots yet"
          description={
            readOnly
              ? "This storyboard has no shots."
              : "Write a brief and press Direct to generate a screenplay of shots."
          }
        />
      ) : (
        <>
          <Text size="small" color="secondary">
            {`${shots.length} shot${shots.length === 1 ? "" : "s"}`}
          </Text>
          <div className="shot-list">
            {shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                boardId={boardId}
                shot={shot}
                readOnly={readOnly}
                isFirst={i === 0}
                isLast={i === shots.length - 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const StoryboardBoard = memo(StoryboardBoardInner);
StoryboardBoard.displayName = "StoryboardBoard";

export default StoryboardBoard;
