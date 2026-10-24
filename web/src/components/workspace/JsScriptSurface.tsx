/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import TerminalIcon from "@mui/icons-material/Terminal";
import TuneIcon from "@mui/icons-material/Tune";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
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
  ConflictBanner,
  FlexColumn,
  FlexRow,
  SPACING,
  TabGroup,
  ToolbarIconButton
} from "../ui_primitives";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import JsScriptEditorPane from "../jsScript/JsScriptEditorPane";
import JsScriptSettingsPanel from "../jsScript/JsScriptSettingsPanel";
import JsScriptAgentPanel from "../jsScript/JsScriptAgentPanel";
import JsScriptRunConsole from "../jsScript/JsScriptRunConsole";
import type { JsScriptRunRequest } from "../jsScript/JsScriptRunDialog";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { WithDocumentBar, useDocumentBarHost } from "./documentBarParts";

interface JsScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open script by id. */
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

type DockTab = "settings" | "assistant";
type MobilePane = "code" | "console" | "settings" | "assistant";

const DOCK_WIDTH = 340;
const CONSOLE_HEIGHT = 220;

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
 * document editor: Monaco on the left, a dock with the execution envelope or
 * the assistant on the right, and the run console below.
 *
 * The document bar spans the surface. The run console fills it with the save
 * status, Run and Test; the surface adds the Script settings and Assistant
 * toggles, which pick the dock's panel or close it.
 *
 * On phones neither the 340px dock nor the 220px console leaves room for the
 * editor, so the four regions collapse to a single pane with a segmented
 * switcher. Every pane stays mounted (toggled via `display`) so Monaco's model,
 * the console output, and the assistant thread survive a switch.
 */
const JsScriptSurface = ({
  refId,
  mode,
  active,
  tab
}: JsScriptSurfaceProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const ensureScript = useJsScriptStore((state) => state.ensureScript);
  const undo = useJsScriptStore((state) => state.undo);
  const redo = useJsScriptStore((state) => state.redo);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const name = useJsScriptName(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab | null>("settings");
  const [mobilePane, setMobilePane] = useState<MobilePane>("code");
  const mobileTabs = [
    { value: "code", label: t("i18n-next51.jsScript.code"), icon: <CodeIcon /> },
    { value: "console", label: t("i18n-next51.jsScript.run"), icon: <TerminalIcon /> },
    { value: "settings", label: t("i18n-next51.jsScript.script"), icon: <TuneIcon /> },
    { value: "assistant", label: t("i18n-next51.jsScript.assistant"), icon: <AutoAwesomeIcon /> }
  ];

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  const loadState = useJsScriptServerSync(refId);
  useJsScriptAgentBridge(refId);

  useDocumentUndoShortcuts({
    active,
    enabled: !readOnly,
    onUndo: useCallback(() => undo(refId), [undo, refId]),
    onRedo: useCallback(() => redo(refId), [redo, refId]),
    menuHeading: t("i18n-next51.jsScript.menuHeading")
  });

  useEffect(() => {
    setTabTitle(refId, "jsscript", name || t("i18n-next51.jsScript.untitled"));
  }, [setTabTitle, refId, name, t]);

  // External writes the dirty draft refused — offered per merge unit.
  const conflicts = useDocumentConflicts("jsscript", refId);
  const conflictBanner = conflicts.items.length > 0 && (
    <ConflictBanner
      conflicts={conflicts.items}
      onAccept={conflicts.accept}
      onDiscard={conflicts.discard}
      sx={{ mx: SPACING.md, flexShrink: 0 }}
    />
  );

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

  // Panel toggles for the bar's View slot. Phones reach the panels through
  // the pane switcher instead.
  const toggleDock = (next: DockTab) =>
    setDockTab((current) => (current === next ? null : next));
  const panelToggles = isMobile ? undefined : (
    <>
      <ToolbarIconButton
        icon={<TuneIcon />}
        tooltip={t("i18n-next51.jsScript.scriptSettings")}
        active={dockTab === "settings"}
        aria-pressed={dockTab === "settings"}
        onClick={() => toggleDock("settings")}
      />
      <ToolbarIconButton
        icon={<AutoAwesomeIcon />}
        tooltip={t("i18n-next51.jsScript.assistant")}
        active={dockTab === "assistant"}
        aria-pressed={dockTab === "assistant"}
        onClick={() => toggleDock("assistant")}
      />
    </>
  );
  const { host: barHost, render: documentBar } = useDocumentBarHost(
    tab,
    panelToggles
  );

  // The store seeds an empty script on mount, so rendering before the server
  // copy lands looks like a script with an empty body.
  if (loadState !== "ready") {
    return (
      <WithDocumentBar tab={tab}>
        <DocumentLoadStatus
          state={loadState}
          label={t("i18n-next51.jsScript.label")}
        />
      </WithDocumentBar>
    );
  }

  const editor = <JsScriptEditorPane scriptId={refId} readOnly={readOnly} />;
  const runConsole = (
    <JsScriptRunConsole
      scriptId={refId}
      readOnly={readOnly}
      active={active}
      onRun={handleRun}
      onTest={handleTest}
      documentBar={documentBar}
    />
  );
  const settings = (
    <JsScriptSettingsPanel scriptId={refId} readOnly={readOnly} />
  );
  const assistant = <JsScriptAgentPanel scriptId={refId} />;

  if (isMobile) {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0 }}>
        {barHost}
        <TabGroup
          tabs={mobileTabs}
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
    <FlexColumn fullHeight sx={{ minHeight: 0 }}>
      {barHost}
      <FlexRow sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn fullHeight sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {conflictBanner}
          <FlexColumn fullWidth padding={1} sx={{ flex: 1, minHeight: 0 }}>
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

        {dockTab && (
          <ResizableSideDock
            storageKey="jsscript_assistant"
            defaultWidth={DOCK_WIDTH}
            ariaLabel={t("i18n-next51.jsScript.resizeAssistant")}
          >
            <FlexColumn
              fullWidth
              sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            >
              {dockTab === "settings" ? settings : assistant}
            </FlexColumn>
          </ResizableSideDock>
        )}
      </FlexRow>
    </FlexColumn>
  );
};

export default JsScriptSurface;
