/** @jsxImportSource @emotion/react */
/**
 * The clip-editor panel: a resizable strip under the tracks holding the piano
 * roll for one midi clip.
 *
 * It is the DAW clip view — the side dock is 360 px wide and a piano roll
 * needs the full width of the editor, so the panel stacks below the tracks and
 * takes its height from a drag divider of its own, the same pointer + keyboard
 * control the tracks panel uses.
 *
 * On a phone there is no room to stack: the panel replaces the tracks region
 * outright and its header carries a Back control instead of a Close.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  type ClipEditorTab,
  useTimelineUIStore,
  MAX_PIANO_ROLL_HEIGHT_PX,
  MIN_PIANO_ROLL_HEIGHT_PX
} from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  CloseButton,
  FieldDensityContext,
  FlexColumn,
  MOTION,
  TabGroup,
  ToolbarIconButton
} from "../../ui_primitives";
import { PianoRoll } from "./PianoRoll";
import { StepEditor } from "../stepEditor/StepEditor";
import { StepSequencer } from "../stepSequencer/StepSequencer";
import { PatternRegionNotice } from "../stepSequencer/PatternRegionNotice";

const HANDLE_HEIGHT_PX = 6;
/** Arrow-key step for keyboard resizing. */
const KEYBOARD_RESIZE_STEP_PX = 20;

const dragHandleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: MOTION.background,
    outline: "none",
    touchAction: "none",
    "&:hover, &.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      backgroundColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

const panelStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

interface PianoRollPanelProps {
  /** Phone layout: the panel takes the tracks region's place, full height. */
  fullHeight?: boolean;
  /**
   * Inside the DAW dock: fills the dock, which owns the height and the
   * divider, and keeps its Close control.
   */
  docked?: boolean;
}

export const PianoRollPanel: React.FC<PianoRollPanelProps> = memo(
  ({ fullHeight = false, docked = false }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const clipId = useTimelineUIStore((s) => s.pianoRollClipId);
    const heightPx = useTimelineUIStore((s) => s.pianoRollHeightPx);
    const setHeightPx = useTimelineUIStore((s) => s.setPianoRollHeightPx);
    const closePianoRoll = useTimelineUIStore((s) => s.closePianoRoll);
    const openPianoRoll = useTimelineUIStore((s) => s.openPianoRoll);
    const linked = useTimelineUIStore((s) => s.pianoRollSettings.link);
    const editorTab = useTimelineUIStore((s) => s.clipEditorTab);
    const setEditorTab = useTimelineUIStore((s) => s.setClipEditorTab);
    const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
    const selectedClip = useTimelineStore((s) => {
      if (selectedClipIds.size !== 1) return undefined;
      return findClipById(s.clips, [...selectedClipIds][0]!);
    });

    // A clip the panel is open on can be deleted, or the whole document
    // replaced by an external sync — either way the panel has nothing left to
    // edit and closes itself rather than showing an empty grid.
    const clip = useTimelineStore((s) =>
      clipId ? findClipById(s.clips, clipId) : undefined
    );
    const isEditable = clip !== undefined && clip.mediaType === "midi";
    const isPattern = clip?.pattern !== undefined;
    // A pattern region opens on the Step Sequencer tab (SQ27). When the open
    // clip stops being a pattern (converted, or a plain MIDI clip is linked
    // in), the editor leaves the Step Sequencer for the Piano Roll (F21).
    const wasPattern = useRef(isPattern);
    const editorTabRef = useRef(editorTab);
    editorTabRef.current = editorTab;
    useEffect(() => {
      if (clipId !== null && isPattern) setEditorTab("stepSequencer");
      else if (clipId !== null && wasPattern.current && editorTabRef.current === "stepSequencer") {
        setEditorTab("pianoRoll");
      }
      wasPattern.current = isPattern;
    }, [clipId, isPattern, setEditorTab]);
    // Selecting a pattern region opens the editor on it (SQ27).
    useEffect(() => {
      if (clipId === null && selectedClip?.pattern !== undefined) openPianoRoll(selectedClip.id);
    }, [clipId, selectedClip, openPianoRoll]);
    useEffect(() => {
      if (clipId !== null && !isEditable) closePianoRoll();
    }, [clipId, isEditable, closePianoRoll]);

    // Link: the editor follows the one midi clip selected in the timeline.
    useEffect(() => {
      if (
        linked &&
        clipId !== null &&
        selectedClip?.mediaType === "midi" &&
        selectedClip.id !== clipId
      ) {
        openPianoRoll(selectedClip.id);
      }
    }, [linked, clipId, selectedClip, openPianoRoll]);

    const [isDragging, setIsDragging] = useState(false);
    const dragStartYRef = useRef(0);
    const dragStartHeightRef = useRef(heightPx);
    const handleRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragStartYRef.current = e.clientY;
        dragStartHeightRef.current = heightPx;
        setIsDragging(true);
      },
      [heightPx]
    );

    useEffect(() => {
      if (!isDragging) return;
      document.body.style.userSelect = "none";
      const handleEl = handleRef.current;
      handleEl?.classList.add("dragging");
      const onPointerMove = (ev: PointerEvent) => {
        // Drag up → taller, the way the tracks divider works.
        setHeightPx(dragStartHeightRef.current + (dragStartYRef.current - ev.clientY));
      };
      const onPointerUp = () => setIsDragging(false);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        document.body.style.userSelect = "";
        handleEl?.classList.remove("dragging");
      };
    }, [isDragging, setHeightPx]);

    const handleHandleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHeightPx(heightPx + KEYBOARD_RESIZE_STEP_PX);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setHeightPx(heightPx - KEYBOARD_RESIZE_STEP_PX);
        }
      },
      [heightPx, setHeightPx]
    );

    if (clipId === null || !isEditable) return null;

    const toolbarStart = (
      <>
        {fullHeight && !docked && (
          <ToolbarIconButton
            onClick={closePianoRoll}
            tooltip={t("pass3_21.timeline.pianoRoll.panel.backToTracks")}
            aria-label={t("pass3_21.timeline.pianoRoll.panel.backToTracks")}
          >
            <ArrowBackIosNewIcon fontSize="small" />
          </ToolbarIconButton>
        )}
      </>
    );
    const toolbarEnd = (!fullHeight || docked) && (
      <CloseButton
        onClick={closePianoRoll}
        tooltip={t("pass3_21.timeline.pianoRoll.panel.closeNoteEditor")}
      />
    );

    return (
      <>
        {!fullHeight && !docked && (
          <div
            ref={handleRef}
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("pass3_21.timeline.pianoRoll.panel.resizeNoteEditor")}
            aria-valuenow={heightPx}
            aria-valuemin={MIN_PIANO_ROLL_HEIGHT_PX}
            aria-valuemax={MAX_PIANO_ROLL_HEIGHT_PX}
            tabIndex={0}
            css={dragHandleStyles(theme)}
            onPointerDown={handlePointerDown}
            onKeyDown={handleHandleKeyDown}
          />
        )}
        <FlexColumn
          fullWidth
          css={panelStyles(theme)}
          data-testid="piano-roll-panel"
          sx={
            fullHeight || docked
              ? { flex: "1 1 0", minHeight: 0 }
              : { height: heightPx }
          }
        >
          <TabGroup
            size="small"
            aria-label={t("pass3_20.stepEditor.tab.aria")}
            data-testid="clip-editor-tabs"
            tabs={[
              { value: "pianoRoll", label: t("pass3_20.stepEditor.tab.pianoRoll") },
              { value: "stepEditor", label: t("pass3_20.stepEditor.tab.stepEditor") },
              { value: "stepSequencer", label: t("stepSequencer.tab") }
            ]}
            value={editorTab}
            onChange={(value) => setEditorTab(value as ClipEditorTab)}
          />
          <FieldDensityContext.Provider value="compact">
          {editorTab === "stepSequencer" ? (
            <StepSequencer clipId={clipId} toolbarStart={toolbarStart} toolbarEnd={toolbarEnd} />
          ) : isPattern ? (
            <PatternRegionNotice clipId={clipId} view={editorTab === "stepEditor" ? "stepEditor" : "pianoRoll"} />
          ) : editorTab === "stepEditor" ? (
            <StepEditor
              clipId={clipId}
              onClose={closePianoRoll}
              compact={fullHeight}
              toolbarStart={toolbarStart}
              toolbarEnd={toolbarEnd}
            />
          ) : (
            <PianoRoll
              clipId={clipId}
              onClose={closePianoRoll}
              compact={fullHeight}
              toolbarStart={toolbarStart}
              toolbarEnd={toolbarEnd}
            />
          )}
          </FieldDensityContext.Provider>
        </FlexColumn>
      </>
    );
  }
);

PianoRollPanel.displayName = "PianoRollPanel";
