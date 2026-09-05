/**
 * Studio storyboard page: the existing storyboard editor (board + agent
 * panel + generation queue) inside the Studio chrome, minus the workspace
 * sidebar and tab machinery. Two Studio-specific behaviors:
 *
 * - New boards get the curated Studio models stamped on (director, still,
 *   clip), so a board generates before anyone opens a dropdown. The still and
 *   clip pickers stay, curated down to three options each; the director is
 *   pinned and its picker is hidden.
 * - Assembling navigates straight to `/studio/timeline/:id`, the product's
 *   one finishing surface.
 */

import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { Box, FlexColumn, FlexRow } from "../components/ui_primitives";
import StoryboardBoard from "../components/storyboard/StoryboardBoard";
import StoryboardAgentPanel from "../components/storyboard/StoryboardAgentPanel";
import StoryboardQueueOverlay from "../components/storyboard/StoryboardQueueOverlay";
import { useStoryboardStore } from "../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationSubscriptions } from "../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardServerSync } from "../hooks/storyboard/useStoryboardServerSync";
import { useDocumentUndoShortcuts } from "../hooks/useDocumentUndoShortcuts";
import { useStoryboardAgentBridge } from "../hooks/storyboard/useStoryboardAgentBridge";
import { useExtractScriptFromBoard } from "../hooks/storyboard/useExtractScriptFromBoard";
import { useDirectScreenplay } from "../hooks/storyboard/useDirectScreenplay";
import { useAssembleTimeline } from "../hooks/storyboard/useAssembleTimeline";
import { SetupFlow } from "../components/setup/SetupFlow";
import {
  useStoryboardSetupFlow,
  useStoryboardSetupStage
} from "../components/setup/storyboard/useStoryboardSetupFlow";
import StudioShell from "./StudioShell";
import {
  STUDIO_CLIP_MODEL,
  STUDIO_DIRECTOR_MODEL,
  STUDIO_STILL_MODEL
} from "./curatedModels";

/** Stamp the curated models onto a board that has none selected. */
const useStudioModelPolicy = (boardId: string) => {
  const hasAnyModel = useStoryboardStore((state) => {
    const board = state.boards[boardId];
    return board
      ? Boolean(board.directorModel || board.imageModel || board.videoModel)
      : null;
  });
  useEffect(() => {
    if (hasAnyModel === false) {
      const store = useStoryboardStore.getState();
      store.setDirectorModel(boardId, STUDIO_DIRECTOR_MODEL);
      store.setImageModel(boardId, STUDIO_STILL_MODEL);
      store.setVideoModel(boardId, STUDIO_CLIP_MODEL);
    }
  }, [hasAnyModel, boardId]);
};

const StudioStoryboardPage = () => {
  const { boardId = "" } = useParams<{ boardId: string }>();
  const theme = useTheme();
  const navigate = useNavigate();
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  const title = useStoryboardStore(
    (state) => state.boards[boardId]?.title ?? ""
  );

  useEffect(() => {
    ensureBoard(boardId);
  }, [ensureBoard, boardId]);

  useStoryboardServerSync(boardId);
  useStoryboardAgentBridge(boardId);
  useStoryboardGenerationSubscriptions();
  useStudioModelPolicy(boardId);

  // The board's undo buttons advertise ⌘Z; the page is the only surface, so
  // it is always the active one.
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  useDocumentUndoShortcuts({
    active: true,
    enabled: true,
    onUndo: useCallback(() => undo(boardId), [undo, boardId]),
    onRedo: useCallback(() => redo(boardId), [redo, boardId])
  });

  // A board still in setup renders the flow inside the Studio chrome, at the
  // stage the document carries (PRD § 6.4). A board with no stage reads `done`
  // and opens as the board (D3).
  const setupStage = useStoryboardSetupStage(boardId);
  // Studio boards carry a linked script, and it is extracted when the creator
  // leaves the review step — from the screenplay they reviewed, not the
  // Director's first draft (PRD D9, criterion 6).
  const { extract } = useExtractScriptFromBoard();
  const extractReviewed = useCallback(async () => {
    await extract(boardId, { open: false });
  }, [boardId, extract]);
  const setupConfig = useStoryboardSetupFlow({
    boardId,
    onReviewed: extractReviewed
  });

  const { direct, directing, error: directError } = useDirectScreenplay();
  const handleDirect = useCallback(
    (shotCount: number) => direct(boardId, shotCount),
    [direct, boardId]
  );

  const { assemble, assembling, error: assembleError } = useAssembleTimeline();
  const handleAssemble = useCallback(() => {
    void assemble(boardId)
      .then((result) => navigate(`/studio/timeline/${result.sequenceId}`))
      .catch(() => {
        // Surfaced via assembleError; swallow to keep the click handler quiet.
      });
  }, [assemble, boardId, navigate]);

  if (setupStage !== "done") {
    return (
      <StudioShell title={title || "Untitled storyboard"}>
        <SetupFlow config={setupConfig} />
      </StudioShell>
    );
  }

  return (
    <StudioShell title={title || "Untitled storyboard"}>
      <FlexRow
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative"
        }}
      >
        <StoryboardQueueOverlay boardId={boardId} />
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <StoryboardBoard
            boardId={boardId}
            readOnly={false}
            onDirect={handleDirect}
            directing={directing}
            directError={directError}
            onAssemble={handleAssemble}
            assembling={assembling}
            assembleError={assembleError}
          />
        </Box>
        <FlexColumn
          fullHeight
          sx={{
            width: 320,
            flexShrink: 0,
            minHeight: 0,
            borderLeft: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <StoryboardAgentPanel boardId={boardId} />
        </FlexColumn>
      </FlexRow>
    </StudioShell>
  );
};

export default StudioStoryboardPage;
