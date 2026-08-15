/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import TuneIcon from "@mui/icons-material/Tune";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import {
  useJsScriptName,
  useJsScriptStore
} from "../../stores/jsScript/JsScriptStore";
import { useJsScriptServerSync } from "../../hooks/jsScript/useJsScriptServerSync";
import { useJsScriptAgentBridge } from "../../hooks/jsScript/useJsScriptAgentBridge";
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import {
  getJsScriptAgentHandler,
  hasJsScriptAgentHandler
} from "../jsScript/jsScriptAgentBridge";
import {
  FlexColumn,
  FlexRow,
  TabGroup
} from "../ui_primitives";
import JsScriptEditorPane from "../jsScript/JsScriptEditorPane";
import JsScriptSettingsPanel from "../jsScript/JsScriptSettingsPanel";
import JsScriptAgentPanel from "../jsScript/JsScriptAgentPanel";
import JsScriptRunConsole from "../jsScript/JsScriptRunConsole";
import type { JsScriptRunRequest } from "../jsScript/JsScriptRunDialog";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";

interface JsScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open script by id. */
  active: boolean;
}

type DockTab = "settings" | "assistant";

const DOCK_WIDTH = 340;
const CONSOLE_HEIGHT = 220;

const DEFAULT_NAME = "Untitled JS script";

/**
 * Workspace surface for a JS script tab. `refId` is the js_scripts row id. It
 * ensures the script exists in the singleton store, mounts server sync
 * (load + autosave), registers the agent bridge for the `ui_jsscript_*` tools,
 * keeps the tab label in sync, and lays out the Code-assistant layout as a full
 * document editor: Monaco on the left, a dock that toggles between the
 * execution envelope and the assistant on the right, and the run console below.
 */
const JsScriptSurface = ({ refId, mode, active }: JsScriptSurfaceProps) => {
  const theme = useTheme();
  const ensureScript = useJsScriptStore((state) => state.ensureScript);
  const undo = useJsScriptStore((state) => state.undo);
  const redo = useJsScriptStore((state) => state.redo);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const name = useJsScriptName(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab>("settings");

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  useJsScriptServerSync(refId);
  useJsScriptAgentBridge(refId);

  useDocumentUndoShortcuts({
    active,
    enabled: !readOnly,
    onUndo: useCallback(() => undo(refId), [undo, refId]),
    onRedo: useCallback(() => redo(refId), [redo, refId])
  });

  useEffect(() => {
    setTabTitle(refId, "jsscript", name || DEFAULT_NAME);
  }, [setTabTitle, refId, name]);

  // Run and test go through the same handler the agent tools use, so the
  // console and the assistant cannot execute a script two different ways.
  const handleRun = useCallback(
    (request: JsScriptRunRequest) => {
      if (!hasJsScriptAgentHandler(refId)) return;
      void getJsScriptAgentHandler(refId)
        .run(request.inputs, request.inputStreams)
        .catch((error: unknown) => {
          useJsScriptStore.getState().setLastRun(refId, {
            ok: false,
            logs: [],
            error: error instanceof Error ? error.message : String(error),
            duration_ms: 0
          });
        });
    },
    [refId]
  );

  const handleTest = useCallback(() => {
    if (!hasJsScriptAgentHandler(refId)) return;
    void getJsScriptAgentHandler(refId)
      .test()
      .catch((error: unknown) => {
        console.error("JS script test run failed", error);
      });
  }, [refId]);

  const dockTabs = useMemo(
    () => [
      { value: "settings", label: "Script", icon: <TuneIcon /> },
      { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
    ],
    []
  );

  return (
    <FlexRow fullHeight sx={{ minHeight: 0 }}>
      <FlexColumn fullHeight sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <FlexColumn
          fullWidth
          padding={1}
          sx={{ flex: 1, minHeight: 0 }}
        >
          <JsScriptEditorPane scriptId={refId} readOnly={readOnly} />
        </FlexColumn>

        <FlexColumn
          fullWidth
          sx={{
            height: CONSOLE_HEIGHT,
            flexShrink: 0,
            minHeight: 0,
            borderTop: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <JsScriptRunConsole
            scriptId={refId}
            readOnly={readOnly}
            onRun={handleRun}
            onTest={handleTest}
          />
        </FlexColumn>
      </FlexColumn>

      <ResizableSideDock
        storageKey="jsscript_assistant"
        defaultWidth={DOCK_WIDTH}
        ariaLabel="Resize JS script assistant"
      >
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
        <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {dockTab === "settings" ? (
            <JsScriptSettingsPanel scriptId={refId} readOnly={readOnly} />
          ) : (
            <JsScriptAgentPanel scriptId={refId} />
          )}
        </FlexColumn>
      </ResizableSideDock>
    </FlexRow>
  );
};

export default JsScriptSurface;
