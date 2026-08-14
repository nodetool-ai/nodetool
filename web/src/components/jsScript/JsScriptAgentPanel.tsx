import { memo, useMemo } from "react";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useJsScriptName } from "../../stores/jsScript/JsScriptStore";

/** Teaches the agent the JS script surface and the sandbox contract. */
const jsScriptSystemPrompt = (scriptId: string): string =>
  `# JS script assistant
The user is editing a JS script document (script id "${scriptId}"). Unlike the
Code node assistant, your edits ARE the document — they autosave, there is no
Apply.

- Read it with \`ui_jsscript_get_state\` (name, document, validation issues,
  last run and test results).
- Edit with \`ui_jsscript_set_code\`, \`ui_jsscript_set_ports\`,
  \`ui_jsscript_set_meta\` (name, description, secrets, timeout), and
  \`ui_jsscript_set_tests\`.
- Check your work with \`ui_jsscript_run\` (given inputs) and
  \`ui_jsscript_test\` (the saved cases). Both execute server-side against the
  saved document.

Script contract: declared inputs arrive on the \`inputs\` object
(\`inputs.<name>\`); values leave through \`emit(name, value)\` /
\`output(name, value)\`, never through \`return\`; import any installed
sandbox pack or \`@nodetool-ai/sandbox-nodetool/<namespace>\` directly;
the body has the same \`tools.*\` / \`nodetool.*\` belt a Code node has
(tool-backed calls can spend money).`;

export interface JsScriptAgentPanelProps {
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
