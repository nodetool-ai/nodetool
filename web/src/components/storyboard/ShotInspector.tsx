/**
 * ShotInspector
 *
 * The selection footer, docked under the shot grid: which shot is selected,
 * its description, where it appears in the project's sibling documents, and
 * the four actions PRD § 7.5 leaves here — `Edit`, `Iterate`, `Regenerate`,
 * `Delete`.
 *
 * Every field this used to edit now lives in {@link ShotEditDialog}, which
 * `Edit` opens. The cross-document chips stay because nothing else on the
 * board says where a shot landed in the script and in the cut.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";
import { useEntities } from "../../serverState/useEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useBoardScriptLines } from "../../hooks/storyboard/useShotDuration";
import { useShotTimelineLink } from "../../hooks/storyboard/useShotTimelineLink";
import ShotActionText from "./ShotActionText";
import ShotEditDialog from "./ShotEditDialog";
import { isShotGenerating } from "./ShotStatusPill";
import {
  Box,
  Caption,
  Chip,
  CloseButton,
  Dialog,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Panel,
  Text,
  TextInput,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";

interface ShotInspectorProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
  /** Clears the board's selection. */
  onClose?: () => void;
}

/** Sky — the app's colour for anything script- or voice-shaped. */
const SCRIPT_COLOR = colorForType("audio");

/** Violet — the app's colour for anything picture-shaped. */
const TIMELINE_COLOR = colorForType("video");

/** Secondary actions read as text; only `Edit` carries the accent. */
const quietActionSx = {
  color: "text.secondary",
  "&:hover": { color: "text.primary", bgcolor: "c_overlay_subtle" }
} as const;

/** A cross-document link chip, tinted by the document type it points at. */
const linkChipSx = (color: string) =>
  ({
    height: `${CONTROL.height.xs}px`,
    borderRadius: BORDER_RADIUS.md,
    borderColor: hexToRgba(color, 0.35),
    color
  }) as const;

const scriptChipSx = linkChipSx(SCRIPT_COLOR);
const timelineChipSx = linkChipSx(TIMELINE_COLOR);

const NO_ENTITY_IDS: string[] = [];

const ShotInspectorInner: React.FC<ShotInspectorProps> = ({
  boardId,
  shot,
  readOnly,
  onClose
}) => {
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? NO_ENTITY_IDS
  );
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { generateKeyframe, generateRevisedClip } = useGenerateShot();
  const { data: allEntities } = useEntities();

  const [editOpen, setEditOpen] = useState(false);
  const [iterateOpen, setIterateOpen] = useState(false);
  const [iterateText, setIterateText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isGenerating = isShotGenerating(shot);
  const shotName = `${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`;
  const shotNumber = `SH ${String(shot.index + 1).padStart(2, "0")}`;
  const onBoard = new Set(boardEntityIds);
  const shotEntities = allEntities
    ? entitiesForShot(
        shot,
        allEntities.filter((entity) => onBoard.has(entity.id))
      )
    : [];

  // Where this shot lands in the project's other documents: the script line it
  // covers, and the clip it owns in the assembled cut.
  const scriptLines = useBoardScriptLines(boardId);
  const scriptLink = useMemo(() => {
    const ids = shot.script_line_ids ?? [];
    if (!scriptId || ids.length === 0) {
      return null;
    }
    const order = [...scriptLines.keys()];
    const first = ids
      .map((id) => ({ id, position: order.indexOf(id) }))
      .filter((entry) => entry.position >= 0)
      .sort((a, b) => a.position - b.position)[0];
    return {
      lineId: first?.id ?? null,
      label: first ? `Script · line ${first.position + 1}` : "Script"
    };
  }, [scriptId, scriptLines, shot.script_line_ids]);
  const timelineLink = useShotTimelineLink(boardId, shot.id);

  const handleOpenScript = useCallback(() => {
    if (!scriptId) {
      return;
    }
    // Park the line before the tab opens: the script pane reads the request as
    // it renders, and scrolls to the line rather than to the top.
    if (scriptLink?.lineId) {
      requestDocumentFocus({
        type: "script",
        ref: scriptId,
        lineId: scriptLink.lineId
      });
    }
    openTab({ type: "script", ref: scriptId, mode: "edit", title: "Script" });
  }, [openTab, scriptId, scriptLink]);

  // A start that throws records its reason on the shot's job state (and
  // toasts it), which is what the card's error line shows — so the rejection
  // is already reported and only needs to not go unhandled.
  const handleRegenerate = useCallback(() => {
    void generateKeyframe(boardId, shot).catch(() => undefined);
  }, [generateKeyframe, boardId, shot]);

  const handleIterateConfirm = useCallback(() => {
    const instruction = iterateText.trim();
    if (instruction.length > 0) {
      void generateRevisedClip(boardId, shot, instruction).catch(
        () => undefined
      );
    }
    setIterateOpen(false);
    setIterateText("");
  }, [iterateText, generateRevisedClip, boardId, shot]);

  const handleDelete = useCallback(() => {
    removeShot(boardId, shot.id);
    setConfirmDelete(false);
  }, [removeShot, boardId, shot.id]);

  return (
    <Panel padding="none" className="shot-inspector">
      <FlexRow
        align="center"
        gap={SPACING.lg}
        wrap
        sx={{
          minHeight: `${CONTROL.height.xl}px`,
          px: SPACING.xl,
          py: SPACING.md
        }}
      >
        <Box sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}>
          {`${shotNumber} selected`}
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
          <ShotActionText action={shot.action} entities={shotEntities} />
        </Box>
        <Divider orientation="vertical" flexItem />
        <Caption color="secondary">Appears in</Caption>
        {timelineLink && (
          <Chip
            compact
            variant="outlined"
            label={timelineLink.label}
            sx={timelineChipSx}
            onClick={timelineLink.open}
            title="Open the cut with this shot's clip selected"
          />
        )}
        {scriptLink && (
          <Chip
            compact
            variant="outlined"
            label={scriptLink.label}
            sx={scriptChipSx}
            onClick={handleOpenScript}
            title="Open the script this shot's lines come from"
          />
        )}
        {!timelineLink && !scriptLink && (
          <Caption color="muted">nothing yet</Caption>
        )}
        {!readOnly && (
          <>
            <EditorButton
              variant="contained"
              color="primary"
              onClick={() => setEditOpen(true)}
              title="Open this shot's fields, takes and script lines"
            >
              Edit
            </EditorButton>
            <EditorButton
              onClick={() => setIterateOpen(true)}
              disabled={isGenerating || !shot.clip}
              sx={quietActionSx}
              title={
                shot.clip
                  ? "Re-render this clip with a note applied"
                  : "Render a clip first"
              }
            >
              Iterate
            </EditorButton>
            <EditorButton
              onClick={handleRegenerate}
              disabled={isGenerating}
              sx={quietActionSx}
              title="Render a new still from this shot's saved fields"
            >
              Regenerate
            </EditorButton>
            <EditorButton
              onClick={() => setConfirmDelete(true)}
              disabled={isGenerating}
              sx={quietActionSx}
              title="Remove this shot from the board"
            >
              Delete
            </EditorButton>
          </>
        )}
        {onClose && (
          <CloseButton onClick={onClose} tooltip="Clear shot selection" />
        )}
      </FlexRow>

      <ShotEditDialog
        boardId={boardId}
        shotId={shot.id}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        readOnly={readOnly}
      />

      <Dialog
        open={iterateOpen}
        onClose={() => setIterateOpen(false)}
        title="Iterate on this clip"
        onConfirm={handleIterateConfirm}
        confirmText="Iterate"
        confirmDisabled={iterateText.trim().length === 0}
      >
        <FlexColumn gap={SPACING.xs}>
          <Caption color="secondary">
            Describe the change to make. The current clip is re-rendered with
            your note applied.
          </Caption>
          <TextInput
            value={iterateText}
            placeholder="e.g. make it darker, add rain"
            onChange={(e) => setIterateText(e.target.value)}
            multiline
            rows={3}
            autoFocus
          />
        </FlexColumn>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete shot?"
        onConfirm={handleDelete}
        confirmText="Delete"
        destructive
      >
        <Text>
          {`Remove “${shotName}” from the board. Generated stills and clips stay in your asset library.`}
        </Text>
      </Dialog>
    </Panel>
  );
};

export const ShotInspector = memo(ShotInspectorInner);
ShotInspector.displayName = "ShotInspector";

export default ShotInspector;
