/** @jsxImportSource @emotion/react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import {
  useScriptStore,
  useScriptCast,
  useScriptTitle
} from "../../stores/script/ScriptStore";
import { redoScript, undoScript } from "../../stores/script/timelineSync";
import { useScriptServerSync } from "../../hooks/script/useScriptServerSync";
import { useScriptAgentBridge } from "../../hooks/script/useScriptAgentBridge";
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import {
  FlexColumn,
  FlexRow,
  TabGroup,
  EditorButton,
  MobileBottomSheet,
  ConflictBanner,
  ToolbarIconButton,
  SPACING,
  Z_INDEX
} from "../ui_primitives";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import ScriptDocumentPane from "../script/ScriptDocumentPane";
import ScriptCastPanel from "../script/ScriptCastPanel";
import ScriptAgentPanel from "../script/ScriptAgentPanel";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { SetupFlow } from "../setup/SetupFlow";
import {
  useScriptSetupFlow,
  useScriptSetupStage
} from "../setup/script/useScriptSetupFlow";
import { WithDocumentBar, useDocumentBarHost } from "./documentBarParts";

interface ScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /** Whether this tab is the focused one. Not used by the agent bridge, which
   * registers every open script by id. */
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

type DockTab = "cast" | "assistant";

/**
 * Workspace surface for a script tab. `refId` is the script id. Ensures the
 * script exists in the singleton store, mounts the server-sync/autosave hook,
 * registers the agent bridge (registering this script under its id for the
 * ui_script_* tools), keeps the tab label in sync with the title, and lays out
 * the cast rail, the document pane, and the assistant dock side by side. On
 * mobile the cast and assistant share a bottom sheet.
 *
 * The document bar spans the surface. The pane fills it with the save status,
 * history and actions; the surface adds the Cast and Assistant toggles.
 */
const ScriptSurface = ({ refId, mode, active, tab }: ScriptSurfaceProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const ensureScript = useScriptStore((state) => state.ensureScript);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  // Narrow subscriptions on purpose: the whole-script view also carries
  // `sections`, which changes on every keystroke and would re-render the cast
  // panel and the assistant along with it.
  const title = useScriptTitle(refId);
  const cast = useScriptCast(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab>("cast");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(true);

  const openSheet = useCallback((tab: DockTab) => {
    setDockTab(tab);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  const loadState = useScriptServerSync(refId);
  useScriptAgentBridge(refId);

  // A script still in setup renders the flow in place of the editor (PRD
  // § 6.4). The stage is the only signal read — a script with no stage reads
  // `done` and opens as the editor, as it always did (D3).
  const setupStage = useScriptSetupStage(refId);
  const setupConfig = useScriptSetupFlow({ scriptId: refId });

  // The setup flow writes the script too, so a document undo there would
  // revert the brief or un-write the script and reset the stage.
  useDocumentUndoShortcuts({
    active,
    enabled: !readOnly && setupStage === "done",
    onUndo: useCallback(() => undoScript(refId), [refId]),
    onRedo: useCallback(() => redoScript(refId), [refId]),
    menuHeading: t("i18n-next51.script.menuHeading")
  });

  useEffect(() => {
    setTabTitle(refId, "script", title || t("i18n-next51.script.untitled"));
  }, [setTabTitle, refId, title, t]);

  // External writes the dirty draft refused — offered per merge unit.
  const conflicts = useDocumentConflicts("script", refId);
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

  // Panel toggles for the bar's View slot. Phones reach the panels through
  // the bottom sheet instead.
  const panelToggles = useMemo(
    () =>
      isMobile ? undefined : (
        <>
          <ToolbarIconButton
            icon={<GroupsIcon />}
            tooltip={t("i18n-next51.script.cast")}
            active={castOpen}
            aria-pressed={castOpen}
            onClick={() => setCastOpen((open) => !open)}
          />
          {!readOnly && (
            <ToolbarIconButton
              icon={<AutoAwesomeIcon />}
              tooltip={t("i18n-next51.script.assistant")}
              active={assistantOpen}
              aria-pressed={assistantOpen}
              onClick={() => setAssistantOpen((open) => !open)}
            />
          )}
        </>
      ),
    [isMobile, castOpen, assistantOpen, readOnly, t]
  );
  const { host: barHost, render: documentBar } = useDocumentBarHost(
    tab,
    panelToggles
  );

  const dockTabs = useMemo(
    () => [
      {
        value: "cast",
        label: t("i18n-next51.script.cast"),
        icon: <GroupsIcon />
      },
      {
        value: "assistant",
        label: t("i18n-next51.script.assistant"),
        icon: <AutoAwesomeIcon />
      }
    ],
    [t]
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

  // The store seeds an empty script on mount, so rendering before the server
  // copy lands looks like a script with no lines.
  if (loadState !== "ready") {
    return (
      <WithDocumentBar tab={tab}>
        <DocumentLoadStatus
          state={loadState}
          label={t("i18n-next51.script.label")}
        />
      </WithDocumentBar>
    );
  }

  if (setupStage !== "done") {
    return (
      <WithDocumentBar tab={tab}>
        <SetupFlow config={setupConfig} readOnly={readOnly} />
      </WithDocumentBar>
    );
  }

  // On mobile the fixed 320px side dock would crush the document, so the cast
  // and assistant panels move into a bottom sheet reached by two floating
  // buttons; the document runs full-width.
  if (isMobile) {
    return (
      <FlexColumn fullHeight sx={{ minHeight: 0, position: "relative" }}>
        {barHost}
        {conflictBanner}
        <ScriptDocumentPane
          scriptId={refId}
          readOnly={readOnly}
          active={active}
          documentBar={documentBar}
        />
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
                startIcon={<GroupsIcon />}
                onClick={() => openSheet("cast")}
              >
                {t("i18n-next51.script.cast")}
              </EditorButton>
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => openSheet("assistant")}
              >
                {t("i18n-next51.script.assistant")}
              </EditorButton>
            </FlexRow>
            <MobileBottomSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              maxHeight="85dvh"
              title={
                dockTab === "cast"
                  ? t("i18n-next51.script.cast")
                  : t("i18n-next51.script.assistant")
              }
              headerExtras={dockTabGroup}
              ariaLabel={t("i18n-next51.script.castAndAssistant")}
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

  // Desktop reads like a call sheet: the cast down the left, the lines in the
  // middle, the assistant on the right.
  return (
    <FlexColumn fullHeight sx={{ minHeight: 0 }}>
      {barHost}
      <FlexRow sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        {conflictBanner}
        {castOpen && (
          <ResizableSideDock
            side="left"
            storageKey="script_cast"
            defaultWidth={300}
            minWidth={260}
            maxWidth={440}
            ariaLabel={t("i18n-next51.script.resizeCast")}
          >
            <FlexColumn
              fullWidth
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                backgroundColor: "background.default"
              }}
            >
              <ScriptCastPanel
                scriptId={refId}
                cast={cast}
                readOnly={readOnly}
              />
            </FlexColumn>
          </ResizableSideDock>
        )}
        <ScriptDocumentPane
          scriptId={refId}
          readOnly={readOnly}
          active={active}
          documentBar={documentBar}
        />
        {!readOnly && assistantOpen && (
          <ResizableSideDock
            storageKey="script_assistant"
            ariaLabel={t("i18n-next51.script.resizeAssistant")}
          >
            <FlexColumn
              fullWidth
              sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            >
              <ScriptAgentPanel scriptId={refId} />
            </FlexColumn>
          </ResizableSideDock>
        )}
      </FlexRow>
    </FlexColumn>
  );
};

export default ScriptSurface;
