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
  FormField,
  FormGrid,
  FormSection,
  Panel,
  TextInput,
  SelectField,
  EditorButton,
  EmptyState,
  Divider,
  Text,
  CONTROL,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useBoard, useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
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
    ".grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
      gap: getSpacingPx(SPACING.md)
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
  const { title, brief, style, aspectRatio, directorModel, imageModel, shots } =
    useBoard(boardId);

  const setTitle = useStoryboardStore((state) => state.setTitle);
  const setBrief = useStoryboardStore((state) => state.setBrief);
  const setStyle = useStoryboardStore((state) => state.setStyle);
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setDirectorModel = useStoryboardStore((state) => state.setDirectorModel);
  const setImageModel = useStoryboardStore((state) => state.setImageModel);

  const [shotCount, setShotCount] = useState<number>(6);

  const handleDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  const hasRenderedShot = shots.some(
    (s) => s.status === "rendered" && !!s.clip?.asset_id
  );

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
                    task="text_to_image"
                    onChange={(value) => setImageModel(boardId, value)}
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
                  "Direct writes the screenplay and seeds your shots."}
              </Text>
              <FlexRow gap={2} align="center">
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

      {shots.length === 0 ? (
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
