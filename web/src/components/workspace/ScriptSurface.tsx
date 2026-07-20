/** @jsxImportSource @emotion/react */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import GroupsIcon from "@mui/icons-material/Groups";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useScriptStore, useScript } from "../../stores/script/ScriptStore";
import { useScriptServerSync } from "../../hooks/script/useScriptServerSync";
import { useScriptAgentBridge } from "../../hooks/script/useScriptAgentBridge";
import { FlexColumn, FlexRow, TabGroup } from "../ui_primitives";
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
const ScriptSurface = ({ refId, mode }: ScriptSurfaceProps) => {
  const theme = useTheme();
  const ensureScript = useScriptStore((state) => state.ensureScript);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const { title, cast } = useScript(refId);
  const readOnly = mode === "view";
  const [dockTab, setDockTab] = useState<DockTab>("cast");

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  useScriptServerSync(refId);
  useScriptAgentBridge(refId);

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
                scriptId={refId}
                cast={cast}
                readOnly={readOnly}
              />
            ) : (
              <ScriptAgentPanel scriptId={refId} />
            )}
          </FlexColumn>
        </FlexColumn>
      )}
    </FlexRow>
  );
};

export default ScriptSurface;
