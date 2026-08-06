/** @jsxImportSource @emotion/react */
/**
 * Studio script page: the existing script editor (document pane + cast /
 * assistant dock) inside the Studio chrome. The header carries the one Studio
 * addition — "Create video" assembles the voiced takes into a timeline and
 * navigates to `/studio/timeline/:id`.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import GroupsIcon from "@mui/icons-material/Groups";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import {
  EditorButton,
  FlexColumn,
  FlexRow,
  TabGroup,
  Tooltip
} from "../components/ui_primitives";
import ScriptDocumentPane from "../components/script/ScriptDocumentPane";
import ScriptCastPanel from "../components/script/ScriptCastPanel";
import ScriptAgentPanel from "../components/script/ScriptAgentPanel";
import {
  useScriptStore,
  useScriptCast,
  useScriptTitle
} from "../stores/script/ScriptStore";
import { useScriptServerSync } from "../hooks/script/useScriptServerSync";
import { useScriptAgentBridge } from "../hooks/script/useScriptAgentBridge";
import { useAssembleScriptTimeline } from "../hooks/script/useAssembleScriptTimeline";
import StudioShell from "./StudioShell";

type DockTab = "cast" | "assistant";

const StudioScriptPage = () => {
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

  useScriptServerSync(scriptId);
  useScriptAgentBridge(scriptId);

  const { assemble, assembling, error: assembleError } =
    useAssembleScriptTimeline();

  const dockTabs = useMemo(
    () => [
      { value: "cast", label: "Cast", icon: <GroupsIcon /> },
      { value: "assistant", label: "Assistant", icon: <AutoAwesomeIcon /> }
    ],
    []
  );

  const createVideo = (
    <Tooltip
      title={
        assembleError ??
        "Lay the voiced lines onto a timeline and open the video editor."
      }
    >
      <span>
        <EditorButton
          size="small"
          variant="contained"
          startIcon={<MovieRoundedIcon fontSize="small" />}
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
          {assembling ? "Assembling…" : "Create video"}
        </EditorButton>
      </span>
    </Tooltip>
  );

  return (
    <StudioShell title={title || "Untitled script"} actions={createVideo}>
      <FlexRow fullHeight sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ScriptDocumentPane scriptId={scriptId} readOnly={false} />
        <FlexColumn
          fullHeight
          sx={{
            width: 320,
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
