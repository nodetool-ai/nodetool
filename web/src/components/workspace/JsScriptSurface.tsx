/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import TerminalIcon from "@mui/icons-material/Terminal";
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
  Box,
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
import DocumentLoadStatus from "./DocumentLoadStatus";

interface JsScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open script by id. */
  active: boolean;
}

type DockTab = "settings" | "assistant";
type MobilePane = "code" | "console" | "settings" | "assistant";

const DOCK_WIDTH = 340;
const CONSOLE_HEIGHT = 220;

const DEFAULT_NAME = "Untitled JS script";

const MOBILE_TABS = [
  { value: "code", label: "Code", icon: <CodeIcon /> },
  { value: "console", label: "Run", icon: <TerminalIcon /> },
  { value: "settings", label: "Script", icon: <TuneIcon /> },
  { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
];

const MOBILE_PANES: readonly MobilePane[] = [
  "code",
  "console",
  "settings",
  "assistant"
];

const isMobilePane = (value: string): value is MobilePane =>
  (MOBILE_PANES as readonly string[]).includes(value);

/**
 * Workspace surface for a JS script tab. `refId` is the js_scripts row id. It
 * ensures the script exists in the singleton store, mounts server sync
 * (load + autosave), registers the agent bridge for the `ui_jsscript_*` tools,
 * keeps the tab label in sync, and lays out the Code-assistant layout as a full
 * document editor: Monaco on the left, a dock that toggles between the
 * execution envelope and the assistant on the right, and the run console below.
 *
 * On phones neither the 340px dock nor the 220px console leaves room for the
 * editor, so the four regions collapse to a single pane with a segmented
 * switcher. Every pane stays mounted (toggled via `display`) so Monaco's model,
 * the console output, and the assistant thread survive a switch.
 */
const JsScriptSurface = ({ refId, mode, active }: JsScriptSurfaceProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const ensureScript = useJsScriptStore((state) => state.ensureScript);
  const undo = useJsScriptStore((state) => state.undo);
  const redo = useJsScriptStore((state) => state.redo);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const name = useJsScriptName(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab>("settings");
  const [mobilePane, setMobilePane] = useState<MobilePane>("code");

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  const loadState = useJsScriptServerSync(refId);
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

  // The store seeds an empty script on mount, so rendering before the server
  // copy lands looks like a script with an empty body.
  if (loadState !== "ready") {
    return <DocumentLoadStatus state={loadState} label="JS script" />;
  }

  const editor = <JsScriptEditorPane scriptId={refId} readOnly={readOnly} />;
  const runConsole = (
    <JsScriptRunConsole
      scriptId={refId}
      readOnly={readOnly}
      onRun={handleRun}
      onTest={handleTest}
    />
  );
  const settings = (
    <JsScriptSettingsPanel scriptId={refId} readOnly={readOnly} />
  );
  const assistant = <JsScriptAgentPanel scriptId={refId} />;

  if (isMobile) {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0 }}>
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
        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {MOBILE_PANES.map((pane) => (
            <FlexColumn
              key={pane}
              fullWidth
              padding={pane === "code" ? 1 : 0}
              sx={{
                position: "absolute",
                inset: 0,
                minHeight: 0,
                overflow: "hidden",
                display: mobilePane === pane ? "flex" : "none"
              }}
            >
              {pane === "code"
                ? editor
                : pane === "console"
                  ? runConsole
                  : pane === "settings"
                    ? settings
                    : assistant}
            </FlexColumn>
          ))}
        </Box>
      </FlexColumn>
    );
  }

  return (
    <FlexRow fullHeight sx={{ minHeight: 0 }}>
      <FlexColumn fullHeight sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <FlexColumn
          fullWidth
          padding={1}
          sx={{ flex: 1, minHeight: 0 }}
        >
          {editor}
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
          {runConsole}
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
          {dockTab === "settings" ? settings : assistant}
        </FlexColumn>
      </ResizableSideDock>
    </FlexRow>
  );
};

export default JsScriptSurface;
