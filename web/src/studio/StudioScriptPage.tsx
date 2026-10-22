/** @jsxImportSource @emotion/react */
/**
 * Studio script page: the existing script editor (document pane + cast /
 * assistant dock) inside the Studio chrome. The header carries the one Studio
 * addition — "Create video" assembles the voiced takes into a timeline and
 * navigates to `/studio/timeline/:id`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import GroupsIcon from "@mui/icons-material/Groups";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  STUDIO_ASSISTANT_WIDTH,
  TabGroup,
  Tooltip
} from "../components/ui_primitives";
import ReportBugButton from "../components/support/ReportBugButton";
import ScriptDocumentPane from "../components/script/ScriptDocumentPane";
import ScriptCastPanel from "../components/script/ScriptCastPanel";
import ScriptAgentPanel from "../components/script/ScriptAgentPanel";
import {
  useScriptStore,
  useScriptCast,
  useScriptTitle
} from "../stores/script/ScriptStore";
import { useScriptServerSync } from "../hooks/script/useScriptServerSync";
import { useDocumentUndoShortcuts } from "../hooks/useDocumentUndoShortcuts";
import { useScriptAgentBridge } from "../hooks/script/useScriptAgentBridge";
import { useAssembleScriptTimeline } from "../hooks/script/useAssembleScriptTimeline";
import { SetupFlow } from "../components/setup/SetupFlow";
import {
  useScriptSetupFlow,
  useScriptSetupStage
} from "../components/setup/script/useScriptSetupFlow";
import DocumentLoadStatus from "../components/workspace/DocumentLoadStatus";
import StudioShell from "./StudioShell";

type DockTab = "cast" | "assistant";

const StudioScriptPage = () => {
  const { t } = useTranslation();
  const { scriptId = "" } = useParams<{ scriptId: string }>();
  const theme = useTheme();
  const navigate = useNavigate();
  const ensureScript = useScriptStore((state) => state.ensureScript);
  const title = useScriptTitle(scriptId);
  const cast = useScriptCast(scriptId);
  const [dockTab, setDockTab] = useState<DockTab>("assistant");

  useEffect(() => {
    ensureScript(scriptId);
  }, [ensureScript, scriptId]);

  const loadState = useScriptServerSync(scriptId);
  useScriptAgentBridge(scriptId);

  const { assemble, assembling, error: assembleError } =
    useAssembleScriptTimeline();

  // A script still in setup renders the flow inside the Studio chrome, at the
  // stage the document carries (PRD § 6.4). A script with no stage reads
  // `done` and opens as the editor (D3).
  const setupStage = useScriptSetupStage(scriptId);
  const setupConfig = useScriptSetupFlow({ scriptId });

  const undo = useScriptStore((state) => state.undo);
  const redo = useScriptStore((state) => state.redo);
  // No document undo while the flow shows: it would revert the setup itself.
  useDocumentUndoShortcuts({
    active: true,
    enabled: setupStage === "done",
    onUndo: useCallback(() => undo(scriptId), [undo, scriptId]),
    onRedo: useCallback(() => redo(scriptId), [redo, scriptId])
  });

  const dockTabs = useMemo(
    () => [
      { value: "cast", label: t("screen_remaining.studio.cast"), icon: <GroupsIcon /> },
      { value: "assistant", label: t("screen_remaining.studio.assistant"), icon: <AutoAwesomeIcon /> }
    ],
    [t]
  );

  const createVideo = (
    <Tooltip
      title={
        assembleError ??
        t("screen_remaining.studio.createVideoTooltip")
      }
    >
      <span>
        <EditorButton
          size="small"
          variant="contained"
          startIcon={<MovieRoundedIcon />}
          disabled={assembling}
          onClick={() => {
            void assemble(scriptId)
              .then((result) =>
                navigate(`/studio/timeline/${result.sequenceId}`)
              )
              .catch(() => {
                // Surfaced via assembleError; swallow to keep the click quiet.
              });
          }}
        >
          {assembling ? t("screen_remaining.studio.assembling") : t("screen_remaining.studio.createVideo")}
        </EditorButton>
      </span>
    </Tooltip>
  );

  // The store seeds an empty script on mount, so rendering before the server
  // copy lands looks like a script with no lines.
  if (loadState !== "ready") {
    return (
      <StudioShell title={title || t("screen_remaining.studio.untitledScript")}>
        <DocumentLoadStatus state={loadState} label={t("screen_remaining.studio.script")} />
      </StudioShell>
    );
  }

  if (setupStage !== "done") {
    return (
      <StudioShell title={title || t("screen_remaining.studio.untitledScript")}>
        <SetupFlow config={setupConfig} />
      </StudioShell>
    );
  }

  return (
    <StudioShell title={title || t("screen_remaining.studio.untitledScript")} actions={createVideo}>
      {/* The button's tooltip is out of reach for keyboard and touch, so a
          failed Create video says why here. */}
      {assembleError ? (
        <AlertBanner
          severity="error"
          title={t("screen_remaining.studio.videoCreateError")}
          sx={{ margin: SPACING.md }}
          action={
            <ReportBugButton
              label={t("screen_remaining.studio.reportFailure")}
              variant="outlined"
              size="small"
              context={{
                source: "manual",
                summary: t("screen_remaining.studio.scriptVideoError"),
                errorText: assembleError
              }}
            />
          }
        >
          {assembleError}
        </AlertBanner>
      ) : null}
      <FlexRow fullHeight sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ScriptDocumentPane scriptId={scriptId} readOnly={false} />
        <FlexColumn
          fullHeight
          sx={{
            width: STUDIO_ASSISTANT_WIDTH,
            flexShrink: 0,
            minHeight: 0,
            borderLeft: `1px solid ${theme.vars.palette.divider}`
          }}
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
          <FlexColumn
            fullWidth
            sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            {dockTab === "cast" ? (
              <ScriptCastPanel
                scriptId={scriptId}
                cast={cast}
                readOnly={false}
              />
            ) : (
              <ScriptAgentPanel scriptId={scriptId} />
            )}
          </FlexColumn>
        </FlexColumn>
      </FlexRow>
    </StudioShell>
  );
};

export default StudioScriptPage;
