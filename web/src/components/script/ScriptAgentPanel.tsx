import { memo, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useScriptTitle } from "../../stores/script/ScriptStore";

interface ScriptAgentPanelProps {
  scriptId: string;
}

const ScriptAgentPanel = ({ scriptId }: ScriptAgentPanelProps) => {
  const title = useScriptTitle(scriptId);

  const focused = useMemo<UiDocumentRef>(
    () => ({ type: "script", id: scriptId, title: title || null }),
    [scriptId, title]
  );

  return (
    <AssistantChatPanel
      chatSource="script_assistant"
      focused={focused}
      workflowId={scriptId}
      docsTopic="scripts"
      docsLabel="Scripts"
      welcomeTitle="Script Assistant"
      welcomeBody='Ask me to write and voice the script — e.g. "draft a 30-second intro for two hosts", "add a line for Narrator", or "voice every line and send it to a timeline".'
    />
  );
};

export default memo(ScriptAgentPanel);
