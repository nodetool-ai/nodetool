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
  Text,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useBoard, useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
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
      color: theme.vars.palette.text.secondary
    }
  });

const StoryboardBoardInner: React.FC<StoryboardBoardProps> = ({
  boardId,
  readOnly,
  onDirect,
  directing,
  directError
}) => {
  const theme = useTheme();
  const { title, brief, style, aspectRatio, shots } = useBoard(boardId);

  const setTitle = useStoryboardStore((state) => state.setTitle);
  const setBrief = useStoryboardStore((state) => state.setBrief);
  const setStyle = useStoryboardStore((state) => state.setStyle);
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);

  const [shotCount, setShotCount] = useState<number>(6);

  const handleDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  return (
    <div css={styles(theme)} className="storyboard-board">
      {!readOnly && (
        <Panel padding="normal" className="header-fields">
          <FlexColumn gap={3}>
            <TextInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(boardId, e.target.value)}
            />
            <TextInput
              label="Brief"
              value={brief}
              placeholder="Your film in one or two sentences"
              onChange={(e) => setBrief(boardId, e.target.value)}
              multiline
              rows={3}
            />
            <TextInput
              label="Style"
              value={style}
              placeholder="Palette, light, lens, texture"
              onChange={(e) => setStyle(boardId, e.target.value)}
            />
            <FlexRow gap={3} align="flex-end" wrap>
              <SelectField
                label="Aspect ratio"
                value={aspectRatio}
                onChange={(value) => setAspectRatio(boardId, value)}
                options={ASPECT_OPTIONS}
              />
              <SelectField
                label="Shots"
                value={shotCount}
                onChange={(value) => setShotCount(Number(value))}
                options={SHOT_COUNT_OPTIONS}
              />
              <EditorButton
                variant="contained"
                color="primary"
                onClick={handleDirect}
                disabled={!onDirect || directing}
              >
                {directing ? "Directing…" : "Direct"}
              </EditorButton>
            </FlexRow>
            {directError && (
              <Text size="small" color="error">
                {directError}
              </Text>
            )}
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
