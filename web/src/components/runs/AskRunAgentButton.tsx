import { useState } from "react";
import { useTranslation } from "react-i18next";
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

export function AskRunAgentButton({ runId, spanId, label }: AskRunAgentButtonProps): React.ReactElement {
  const { t } = useTranslation();
  const buttonLabel = label ?? t("screen_editor.askAgent");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createThread = useGlobalChatStore((state) => state.createNewThread);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const open = async (): Promise<void> => {
    setOpening(true);
    setError(null);
    try {
      const projectId = creationProjectId();
      const threadId = await createThread(t("screen_editor.inspectRun"), undefined, { projectId, makeCurrent: false });
      const drafts = useChatDraftStore.getState();
      const reference: UiRunReference = { run_id: runId };
      if (spanId) { reference.span_id = spanId; }
      drafts.setRunReference(threadId, reference);
      drafts.setDraft(threadId, spanId ? t("screen_editor.diagnoseSpanDraft") : t("screen_editor.diagnoseSelectedRunDraft"));
      openTab({ type: "chat", ref: threadId, title: t("screen_editor.inspectRun"), mode: "view", projectId });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("screen_editor.couldNotOpenRunChat"));
    } finally {
      setOpening(false);
    }
  };
  return <FlexColumn>
    <EditorButton disabled={opening} onClick={() => void open()}>{buttonLabel}</EditorButton>
    {error ? <AlertBanner severity="error" action={<ReportBugButton context={{ source: "operation-failure", summary: t("screen_editor.runChatCouldNotOpen"), errorText: error }} />}>
      {error}
    </AlertBanner> : null}
  </FlexColumn>;
}
