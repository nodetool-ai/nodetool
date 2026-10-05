import { useState } from "react";
import type { UiRunReference } from "@nodetool-ai/protocol";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useChatDraftStore from "../../stores/ChatDraftStore";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { AlertBanner, EditorButton, FlexColumn } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

export interface AskRunAgentButtonProps {
  runId: string;
  spanId?: string;
  label?: string;
}

export function AskRunAgentButton({ runId, spanId, label = "Ask the agent" }: AskRunAgentButtonProps): React.ReactElement {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createThread = useGlobalChatStore((state) => state.createNewThread);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const open = async (): Promise<void> => {
    setOpening(true);
    setError(null);
    try {
      const projectId = creationProjectId();
      const threadId = await createThread("Inspect run", undefined, { projectId, makeCurrent: false });
      const drafts = useChatDraftStore.getState();
      const reference: UiRunReference = { run_id: runId };
      if (spanId) { reference.span_id = spanId; }
      drafts.setRunReference(threadId, reference);
      drafts.setDraft(threadId, spanId ? "Help me diagnose this span in the selected run." : "Help me diagnose the selected run.");
      openTab({ type: "chat", ref: threadId, title: "Inspect run", mode: "view", projectId });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not open run chat");
    } finally {
      setOpening(false);
    }
  };
  return <FlexColumn>
    <EditorButton disabled={opening} onClick={() => void open()}>{label}</EditorButton>
    {error ? <AlertBanner severity="error" action={<ReportBugButton context={{ source: "operation-failure", summary: "Run chat could not open", errorText: error }} />}>
      {error}
    </AlertBanner> : null}
  </FlexColumn>;
}
