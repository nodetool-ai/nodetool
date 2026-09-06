/**
 * The script flow for a host that is not already a script editor — the New
 * Project tab, which swaps itself for the flow once an entry card creates the
 * script (PRD § 6.1).
 *
 * A script tab and the Studio page already run the script's server sync and
 * agent bridge, so they render `SetupFlow` themselves. This host adds them, so
 * setup writes persist and the `ui_script_*` tools reach the script while the
 * flow is up (PRD § 6.5) — the review and voices steps call that bridge
 * directly, so without it they would have nothing to write through.
 */

import { useEffect } from "react";

import { useScriptStore } from "../../../stores/script/ScriptStore";
import { useScriptServerSync } from "../../../hooks/script/useScriptServerSync";
import { useScriptAgentBridge } from "../../../hooks/script/useScriptAgentBridge";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import { SetupFlow } from "../SetupFlow";
import { useScriptSetupFlow } from "./useScriptSetupFlow";

export interface ScriptSetupHostProps {
  scriptId: string;
  /** Runs when the flow's last step finishes — the host opens the script. */
  onFinish: () => void;
  /**
   * Offered on step 1 only, for someone who picked the wrong entry card. The
   * host owns what happens to the script it started (F31).
   */
  onChangeFlow?: () => void | Promise<void>;
}

const ScriptSetupHost = ({
  scriptId,
  onFinish,
  onChangeFlow
}: ScriptSetupHostProps) => {
  const ensureScript = useScriptStore((state) => state.ensureScript);
  useEffect(() => {
    ensureScript(scriptId);
  }, [ensureScript, scriptId]);

  const loadState = useScriptServerSync(scriptId);
  useScriptAgentBridge(scriptId);
  const config = useScriptSetupFlow({ scriptId, onFinish });

  // The store seeds an empty script on mount, and an empty script's stage
  // reads `done` — rendering before the server copy lands would show no flow.
  if (loadState !== "ready") {
    return <DocumentLoadStatus state={loadState} label="script" />;
  }

  return <SetupFlow config={config} onChangeFlow={onChangeFlow} />;
};

export default ScriptSetupHost;
