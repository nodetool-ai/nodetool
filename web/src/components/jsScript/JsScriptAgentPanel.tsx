import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { jsScriptSystemPrompt } from "./jsScriptBodyContract";
import { useJsScriptName } from "../../stores/jsScript/JsScriptStore";

interface JsScriptAgentPanelProps {
  scriptId: string;
}

const JsScriptAgentPanel = ({ scriptId }: JsScriptAgentPanelProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
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
      welcomeTitle={t("assistant.welcomeTitle")}
      welcomeBody={t("assistant.welcomeBody")}
    />
  );
};

export default memo(JsScriptAgentPanel);
