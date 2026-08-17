import { memo, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { jsScriptSystemPrompt } from "./jsScriptBodyContract";
import { useJsScriptName } from "../../stores/jsScript/JsScriptStore";

interface JsScriptAgentPanelProps {
  scriptId: string;
}

const JsScriptAgentPanel = ({ scriptId }: JsScriptAgentPanelProps) => {
  const name = useJsScriptName(scriptId);

  const focused = useMemo<UiDocumentRef>(
    () => ({ type: "jsscript", id: scriptId, title: name || null }),
    [scriptId, name]
  );

  const systemPrompt = useMemo(
    () => jsScriptSystemPrompt(scriptId),
    [scriptId]
  );

  return (
    <AssistantChatPanel
      chatSource="jsscript_assistant"
      focused={focused}
      workflowId={scriptId}
      systemPrompt={systemPrompt}
      welcomeTitle="JS Script Assistant"
      welcomeBody='Ask me to write or change this script — e.g. "parse the CSV and emit one row per line", "add an error output", or "write a test for the empty case".'
    />
  );
};

export default memo(JsScriptAgentPanel);
