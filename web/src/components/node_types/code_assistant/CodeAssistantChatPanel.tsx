import { memo, useCallback, useMemo } from "react";

import AssistantChatPanel from "../../chat/assistant/AssistantChatPanel";

/** Teaches the agent the Code assistant surface and the sandbox contract. */
const codeAssistantSystemPrompt = (nodeId: string): string =>
  `# Code assistant
The user is editing the body of a \`nodetool.code.Code\` node (node id
"${nodeId}") in the Code assistant. You edit a draft — nothing touches the
node until the user clicks Apply.

- Read the draft with \`ui_code_get_state\` (code, inputs, outputs, packages).
- Edit with \`ui_code_set_code\` (replace the code body),
  \`ui_code_set_ports\` (declare input/output handles), and
  \`ui_code_set_packages\` (declare sandbox packages).
- Check your work with the server tools: \`validate_code\` after every edit,
  \`run_code\` to debug with sample inputs, \`test_code\` for regression cases.

Code contract: declared inputs arrive on the \`inputs\` object
(\`inputs.<name>\`); the returned object's keys become the node's output
handles, so every declared output must be set on every return path; \`yield\`
streams items; a sandbox package must be declared (ui_code_set_packages)
before its import resolves.`;

interface CodeAssistantChatPanelProps {
  /** The Code node whose draft the ui_code_* tools edit. */
  nodeId: string;
  /** Kept for the dialog's call site. Not bound onto the chat thread. */
  workflowId: string;
}

const CodeAssistantChatPanel = ({ nodeId }: CodeAssistantChatPanelProps) => {
  const getSelection = useCallback(
    () => ({ node_ids: [nodeId] }),
    [nodeId]
  );

  const systemPrompt = useMemo(
    () => codeAssistantSystemPrompt(nodeId),
    [nodeId]
  );

  return (
    <AssistantChatPanel
      chatSource="code_assistant"
      getSelection={getSelection}
      systemPrompt={systemPrompt}
      welcomeTitle="Code Assistant"
      welcomeBody='Ask me to write or change this node code — e.g. "merge the two lists on id", "add an error output", or "test this with a sample list".'
    />
  );
};

export default memo(CodeAssistantChatPanel);
