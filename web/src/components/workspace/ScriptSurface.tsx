/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useScriptStore, useScript } from "../../stores/script/ScriptStore";
import { useScriptServerSync } from "../../hooks/script/useScriptServerSync";
import { useScriptAgentBridge } from "../../hooks/script/useScriptAgentBridge";
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import {
  FlexColumn,
  FlexRow,
  TabGroup,
  EditorButton,
  MobileBottomSheet,
  SPACING,
  Z_INDEX
} from "../ui_primitives";
import ScriptDocumentPane from "../script/ScriptDocumentPane";
import ScriptCastPanel from "../script/ScriptCastPanel";
import ScriptAgentPanel from "../script/ScriptAgentPanel";

interface ScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open script by id. */
  active: boolean;
}

type DockTab = "cast" | "assistant";

/**
 * Workspace surface for a script tab. `refId` is the script id. Ensures the
 * script exists in the singleton store, mounts the server-sync/autosave hook,
 * registers the agent bridge (registering this script under its id for the
 * ui_script_* tools), keeps the tab label in sync with the title, and lays out the document
 * pane beside a right dock that toggles between the cast panel and the
 * assistant (ElevenLabs-Studio style).
 */
const ScriptSurface = ({ refId, mode, active }: ScriptSurfaceProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const ensureScript = useScriptStore((state) => state.ensureScript);
  const undo = useScriptStore((state) => state.undo);
  const redo = useScriptStore((state) => state.redo);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const { title, cast } = useScript(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab>("cast");
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSheet = useCallback((tab: DockTab) => {
    setDockTab(tab);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  useScriptServerSync(refId);
  useScriptAgentBridge(refId);

  useDocumentUndoShortcuts({
    active,
    enabled: !readOnly,
    onUndo: useCallback(() => undo(refId), [undo, refId]),
    onRedo: useCallback(() => redo(refId), [redo, refId])
  });

  useEffect(() => {
    setTabTitle(refId, "script", title || "Untitled script");
  }, [setTabTitle, refId, title]);

  const dockTabs = useMemo(
    () => [
      { value: "cast", label: "Cast", icon: <GroupsIcon /> },
      { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
    ],
    []
  );

  const dockTabGroup = (
    <TabGroup
      tabs={dockTabs}
      value={dockTab}
      onChange={(value) => setDockTab(value as DockTab)}
      size="small"
      fullWidth
      sx={{
        flexShrink: 0,
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }}
    />
  );

  const dockPanel =
    dockTab === "cast" ? (
      <ScriptCastPanel scriptId={refId} cast={cast} readOnly={readOnly} />
    ) : (
      <ScriptAgentPanel scriptId={refId} />
    );

  // On mobile the fixed 320px side dock would crush the document, so the cast
  // and assistant panels move into a bottom sheet reached by two floating
  // buttons; the document runs full-width.
  if (isMobile) {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0, position: "relative" }}>
        <ScriptDocumentPane scriptId={refId} readOnly={readOnly} />
        {!readOnly && (
          <>
            <FlexRow
              gap={SPACING.sm}
              sx={{
                position: "absolute",
                right: SPACING.md,
                bottom: SPACING.md,
                zIndex: Z_INDEX.sticky
              }}
            >
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<GroupsIcon fontSize="small" />}
                onClick={() => openSheet("cast")}
              >
                Cast
              </EditorButton>
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                onClick={() => openSheet("assistant")}
              >
                Assistant
              </EditorButton>
            </FlexRow>
            <MobileBottomSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              maxHeight="85dvh"
              title={dockTab === "cast" ? "Cast" : "Assistant"}
              headerExtras={dockTabGroup}
              ariaLabel="Script cast and assistant"
            >
              <FlexColumn
                fullWidth
                sx={{ height: "70dvh", minHeight: 0, overflow: "hidden" }}
              >
                {dockPanel}
              </FlexColumn>
            </MobileBottomSheet>
          </>
        )}
      </FlexColumn>
    );
  }

  return (
    <FlexRow fullHeight sx={{ minHeight: 0, position: "relative" }}>
      <ScriptDocumentPane scriptId={refId} readOnly={readOnly} />
      {!readOnly && (
        <FlexColumn
          fullHeight
          sx={{
            width: 320,
            flexShrink: 0,
            minHeight: 0,
            borderLeft: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          {dockTabGroup}
          <FlexColumn
            fullWidth
            sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            {dockPanel}
          </FlexColumn>
        </FlexColumn>
      )}
    </FlexRow>
  );
};

export default ScriptSurface;
