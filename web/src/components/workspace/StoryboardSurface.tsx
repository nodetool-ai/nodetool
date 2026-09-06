import { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import TheatersIcon from "@mui/icons-material/Theaters";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationSubscriptions } from "../../stores/storyboard/StoryboardGenerationStore";
import { useStoryboardAgentBridge } from "../../hooks/storyboard/useStoryboardAgentBridge";
import { useDirectScreenplay } from "../../hooks/storyboard/useDirectScreenplay";
import { useStoryboardServerSync } from "../../hooks/storyboard/useStoryboardServerSync";
import { useAssembleTimeline } from "../../hooks/storyboard/useAssembleTimeline";
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import {
  Box,
  FlexColumn,
  FlexRow,
  TabGroup,
  ConflictBanner,
  Z_INDEX,
  SPACING
} from "../ui_primitives";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import StoryboardBoard from "../storyboard/StoryboardBoard";
import StoryboardQueueOverlay from "../storyboard/StoryboardQueueOverlay";
import StoryboardAgentPanel from "../storyboard/StoryboardAgentPanel";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { SetupFlow } from "../setup/SetupFlow";
import {
  useStoryboardSetupFlow,
  useStoryboardSetupStage
} from "../setup/storyboard/useStoryboardSetupFlow";

interface StoryboardSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open board by id. */
  active: boolean;
}

type MobilePane = "board" | "assistant";

const MOBILE_TABS = [
  { value: "board", label: "Board", icon: <TheatersIcon /> },
  { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
];

const MOBILE_PANES: readonly MobilePane[] = ["board", "assistant"];

const isMobilePane = (value: string): value is MobilePane =>
  (MOBILE_PANES as readonly string[]).includes(value);

/**
 * Workspace surface for a storyboard tab. `refId` is the board id. Ensures the
 * board exists in the singleton store, mounts the agent bridge (registering this
 * board under its id for the ui_storyboard_* tools) and the generation
 * subscriptions, and renders the board read-only in view mode.
 *
 * On wide screens the board and assistant sit side by side. On phones two
 * columns don't fit, so edit mode collapses to a single pane with a
 * segmented switcher; every pane stays mounted (toggled via `display`) so
 * board, chat, and scroll state survive switches.
 */
const StoryboardSurface = ({ refId, mode, active }: StoryboardSurfaceProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [mobilePane, setMobilePane] = useState<MobilePane>("board");
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  const boardTitle = useStoryboardStore(
    (state) => state.boards[refId]?.title ?? ""
  );
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    ensureBoard(refId);
  }, [ensureBoard, refId]);

  const loadState = useStoryboardServerSync(refId);

  useDocumentUndoShortcuts({
    active,
    enabled: mode !== "view",
    onUndo: useCallback(() => undo(refId), [undo, refId]),
    onRedo: useCallback(() => redo(refId), [redo, refId])
  });

  // Keep the tab label in sync with the board's title field.
  useEffect(() => {
    setTabTitle(refId, "storyboard", boardTitle || "Untitled storyboard");
  }, [setTabTitle, refId, boardTitle]);

  useStoryboardAgentBridge(refId);
  useStoryboardGenerationSubscriptions(refId);

  const conflicts = useDocumentConflicts("storyboard", refId);
  const conflictBanner = conflicts.items.length > 0 && (
    <ConflictBanner
      conflicts={conflicts.items}
      onAccept={conflicts.accept}
      onDiscard={conflicts.discard}
      sx={{
        position: "absolute",
        top: SPACING.md,
        left: SPACING.md,
        right: SPACING.md,
        zIndex: Z_INDEX.sticky,
        // The banner reads as a document-level notice, not a full-width
        // bar: one breakpoint step wide, centred over the surface.
        maxWidth: theme.breakpoints.values.sm,
        mx: "auto"
      }}
    />
  );

  const { direct, directing, error } = useDirectScreenplay();
  const handleDirect = useCallback(
    (shotCount: number) => direct(refId, shotCount),
    [direct, refId]
  );

  // A board still in setup renders the flow in place of the board (PRD § 6.4).
  // The stage is the only signal read — a board with no stage reads `done` and
  // opens as the board, as it always did (D3).
  const setupStage = useStoryboardSetupStage(refId);
  const setupConfig = useStoryboardSetupFlow({ boardId: refId });

  const { assemble, assembling, error: assembleError } = useAssembleTimeline();
  const handleAssemble = useCallback(() => {
    void assemble(refId).catch(() => {
      // Surfaced via assembleError; swallow to keep the click handler quiet.
    });
  }, [assemble, refId]);

  const board = useMemo(
    () => (
      <StoryboardBoard
        boardId={refId}
        readOnly={mode === "view"}
        onDirect={handleDirect}
        directing={directing}
        directError={error}
        onAssemble={handleAssemble}
        assembling={assembling}
        assembleError={assembleError}
      />
    ),
    [
      refId,
      mode,
      handleDirect,
      directing,
      error,
      handleAssemble,
      assembling,
      assembleError
    ]
  );

  // The store seeds an empty board on mount, so rendering before the server
  // copy lands looks like a board with no shots.
  if (loadState !== "ready") {
    return <DocumentLoadStatus state={loadState} label="storyboard" />;
  }

  if (setupStage !== "done") {
    return <SetupFlow config={setupConfig} />;
  }

  if (isMobile && mode !== "view") {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0, position: "relative" }}>
        {conflictBanner}
        <TabGroup
          tabs={MOBILE_TABS}
          value={mobilePane}
          onChange={(value) => {
            if (isMobilePane(value)) {
              setMobilePane(value);
            }
          }}
          size="small"
          fullWidth
          sx={{
            flexShrink: 0,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        />
        {/* One pane visible at a time; each fills the switcher body and its
            child owns the layout, so plain block boxes (toggled via display)
            suffice — no flex wrapper needed. */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              height: "100%",
              display: mobilePane === "board" ? "block" : "none"
            }}
          >
            {board}
          </Box>
          <Box
            sx={{
              height: "100%",
              display: mobilePane === "assistant" ? "block" : "none"
            }}
          >
            <StoryboardAgentPanel boardId={refId} />
          </Box>
        </Box>
        <StoryboardQueueOverlay boardId={refId} />
      </FlexColumn>
    );
  }

  return (
    <FlexRow fullHeight sx={{ minHeight: 0, position: "relative" }}>
      <StoryboardQueueOverlay boardId={refId} />
      {conflictBanner}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>{board}</Box>
      {mode !== "view" && (
        <ResizableSideDock
          storageKey="storyboard_assistant"
          ariaLabel="Resize storyboard assistant"
        >
          <StoryboardAgentPanel boardId={refId} />
        </ResizableSideDock>
      )}
    </FlexRow>
  );
};

export default StoryboardSurface;
