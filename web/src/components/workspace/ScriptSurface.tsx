/** @jsxImportSource @emotion/react */
import { useEffect } from "react";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useScriptStore, useScript } from "../../stores/script/ScriptStore";
import { useScriptServerSync } from "../../hooks/script/useScriptServerSync";
import ScriptDocumentPane from "../script/ScriptDocumentPane";
import ScriptCastPanel from "../script/ScriptCastPanel";

interface ScriptSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * Workspace surface for a script tab. `refId` is the script id. Ensures the
 * script exists in the singleton store, mounts the server-sync/autosave hook,
 * keeps the tab label in sync with the title, and lays out the document pane
 * beside the cast panel (ElevenLabs-Studio style).
 */
const ScriptSurface = ({ refId, mode }: ScriptSurfaceProps) => {
  const ensureScript = useScriptStore((state) => state.ensureScript);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const { title, cast } = useScript(refId);
  const readOnly = mode === "view";

  useEffect(() => {
    ensureScript(refId);
  }, [ensureScript, refId]);

  useScriptServerSync(refId);

  useEffect(() => {
    setTabTitle(refId, "script", title || "Untitled script");
  }, [setTabTitle, refId, title]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        position: "relative"
      }}
    >
      <ScriptDocumentPane scriptId={refId} readOnly={readOnly} />
      {!readOnly && (
        <ScriptCastPanel scriptId={refId} cast={cast} readOnly={readOnly} />
      )}
    </div>
  );
};

export default ScriptSurface;
