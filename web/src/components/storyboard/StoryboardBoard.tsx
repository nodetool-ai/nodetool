/** @jsxImportSource @emotion/react */
/**
 * StoryboardBoard
 *
 * The board header (title, brief, style, aspect ratio, shot count, and a
 * "Direct" trigger) plus a responsive grid of {@link ShotCard}s. The Direct
 * button is a placeholder that forwards to an `onDirect` callback so a parent
 * can wire it to a real Director run.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  FlexColumn,
  FlexRow,
  Panel,
  TextInput,
  SelectField,
  EditorButton,
  EmptyState,
  Divider,
  Text,
  SPACING,
  getSpacingPx,
  BORDER_RADIUS
} from "../ui_primitives";
import { useBoard, useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import ShotCard from "./ShotCard";

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

/**
 * One labelled form row. Every control in the header — text inputs, selects,
 * and the model picker — wears the same label so the two columns read as one
 * form instead of three different widget styles.
 */
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children
}) => (
  <FlexColumn gap={1} className="field">
    <Text size="small" color="secondary" className="field-label">
      {label}
    </Text>
    {children}
  </FlexColumn>
);

const styles = (theme: Theme) =>
  css({
    height: "100%",
    overflowY: "auto",
    padding: getSpacingPx(SPACING.lg),
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.lg),
    ".grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
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
      animation: "storyboard-shimmer 2.4s linear infinite"
    },
    ".ghost-card": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      padding: getSpacingPx(SPACING.md),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm),
      opacity: 0,
      animation: "storyboard-ghost-in 500ms ease both"
    },
    ".ghost-frame": {
      aspectRatio: "16 / 9",
      borderRadius: BORDER_RADIUS.sm,
      display: "grid",
      placeItems: "center",
      backgroundImage: `linear-gradient(100deg, ${theme.vars.palette.c_overlay_subtle} 40%, ${theme.vars.palette.action.selected} 50%, ${theme.vars.palette.c_overlay_subtle} 60%)`,
      backgroundSize: "200% 100%",
      animation: "storyboard-shimmer 1.8s linear infinite"
    },
    ".ghost-line": {
      height: "10px",
      borderRadius: "5px",
      backgroundImage: `linear-gradient(100deg, ${theme.vars.palette.c_overlay_subtle} 40%, ${theme.vars.palette.action.selected} 50%, ${theme.vars.palette.c_overlay_subtle} 60%)`,
      backgroundSize: "200% 100%",
      animation: "storyboard-shimmer 1.8s linear infinite"
    },
    ".spark": {
      fontSize: "20px",
      color: theme.vars.palette.primary.main,
      animation: "storyboard-spark 1.8s ease-in-out infinite"
    },
    "@media (prefers-reduced-motion: reduce)": {
      ".ghost-frame, .ghost-line, .directing-line, .spark": {
        animation: "none"
      },
      ".ghost-card": { animation: "none", opacity: 1 }
    },
    ".header-fields": {
      color: theme.vars.palette.text.secondary,
      // Panel clips its content; the shrunk "Title" label sits above the input
      // box and would be cut off.
      overflow: "visible",
      // Keep the writing fields at a readable measure on wide screens.
      maxWidth: "1100px",
      // Script on the left, run settings on the right; stacks under 860px.
      ".header-grid": {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 260px",
        gap: getSpacingPx(SPACING.xl),
        alignItems: "start",
        "@media (max-width: 860px)": {
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: getSpacingPx(SPACING.lg)
        }
      },
      ".group-label": {
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: theme.vars.palette.text.disabled
      },
      // Rule between the columns, dropped when they stack.
      ".settings": {
        paddingLeft: getSpacingPx(SPACING.xl),
        borderLeft: `1px solid ${theme.vars.palette.divider}`,
        "@media (max-width: 860px)": {
          paddingLeft: 0,
          borderLeft: "none"
        }
      },
      // Labels live above every control, so no MUI notch or floating label.
      ".field-label": {
        lineHeight: 1.2
      },
      // One control height across text inputs, selects, and the model button.
      ".field .MuiInputBase-root, .field > button": {
        minHeight: "36px"
      },
      ".field > button": { width: "100%" },
      ".field .MuiInputBase-multiline": { minHeight: 0 }
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

  const [shotCount, setShotCount] = useState<number>(6);

  const handleDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  const hasRenderedShot = shots.some(
    (s) => s.status === "rendered" && !!s.clip?.asset_id
  );

  // Shots still waiting for their first still (or whose last attempt failed).
  const pendingStills = shots.filter(
    (s) =>
      !s.keyframe && (s.status === "planned" || s.status === "failed")
  );

  // Approved shots with a still, cleared for video spend but not yet rendered.
  const pendingClips = shots.filter(
    (s) => s.status === "approved" && !!s.keyframe
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
            <div className="header-grid">
              <FlexColumn gap={3}>
                <Text size="tiny" className="group-label">
                  Screenplay
                </Text>
                <Field label="Title">
                  <TextInput
                    value={title}
                    size="small"
                    placeholder="Untitled film"
                    onChange={(e) => setTitle(boardId, e.target.value)}
                  />
                </Field>
                <Field label="Brief">
                  <TextInput
                    value={brief}
                    size="small"
                    placeholder="Your film in one or two sentences"
                    onChange={(e) => setBrief(boardId, e.target.value)}
                    multiline
                    rows={3}
                  />
                </Field>
                <Field label="Style">
                  <TextInput
                    value={style}
                    size="small"
                    placeholder="Palette, light, lens, texture"
                    onChange={(e) => setStyle(boardId, e.target.value)}
                  />
                </Field>
              </FlexColumn>

              <FlexColumn gap={3} className="settings">
                <Text size="tiny" className="group-label">
                  Direction
                </Text>
                <Field label="Screenplay model">
                  <LanguageModelSelect
                    value={directorModel?.id ?? ""}
                    onChange={(value) => setDirectorModel(boardId, value)}
                  />
                </Field>
                <Field label="Still model">
                  <ImageModelSelect
                    value={imageModel?.id ?? ""}
                    task="text_to_image"
                    onChange={(value) => setImageModel(boardId, value)}
                  />
                </Field>
                <Field label="Clip model">
                  <VideoModelSelect
                    value={videoModel?.id ?? ""}
                    task="image_to_video"
                    onChange={(value) => setVideoModel(boardId, value)}
                  />
                </Field>
                <Field label="Aspect ratio">
                  <SelectField
                    label="Aspect ratio"
                    hideLabel
                    value={aspectRatio}
                    size="small"
                    variant="outlined"
                    onChange={(value) => setAspectRatio(boardId, value)}
                    options={ASPECT_OPTIONS}
                  />
                </Field>
                <Field label="Shots">
                  <SelectField
                    label="Shots"
                    hideLabel
                    value={shotCount}
                    size="small"
                    variant="outlined"
                    onChange={(value) => setShotCount(Number(value))}
                    options={SHOT_COUNT_OPTIONS}
                  />
                </Field>
              </FlexColumn>
            </div>

            <Divider />

            <FlexRow gap={2} align="center" justify="space-between" wrap>
              <Text size="small" color={directError || assembleError ? "error" : "secondary"}>
                {directError ??
                  assembleError ??
                  "Direct writes the screenplay and seeds your shots."}
              </Text>
              <FlexRow gap={2} align="center">
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
                  {directing ? "Directing…" : "Direct"}
                </EditorButton>
              </FlexRow>
            </FlexRow>
          </FlexColumn>
        </Panel>
      )}

      {directing ? (
        <>
          <Text size="small" className="directing-line">
            ✦ The director is writing your screenplay…
          </Text>
          <div className="grid">
            {Array.from({ length: shotCount }).map((_, i) => (
              <div
                key={i}
                className="ghost-card"
                style={{ animationDelay: `${i * 140}ms` }}
              >
                <div className="ghost-frame">
                  <span className="spark">✦</span>
                </div>
                <div className="ghost-line" style={{ width: "80%" }} />
                <div className="ghost-line" style={{ width: "55%" }} />
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
          <div className="grid">
            {shots.map((shot) => (
              <ShotCard
                key={shot.id}
                boardId={boardId}
                shot={shot}
                readOnly={readOnly}
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
