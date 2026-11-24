/**
 * The assistant docked beside the document editor (document editor PRD D2, R7,
 * R8, R9). It names the document as the focused document, sends the selected
 * text with each message, flushes the open draft before sending, and exposes
 * the staged-approval vs direct-apply toggle in the panel header.
 */
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import { useDocumentProposalStore } from "../../stores/DocumentProposalStore";
import { EditorButton } from "../ui_primitives";
import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";

interface DocumentAgentPanelProps {
  assetId: string;
  title?: string | null;
  /** Saves the open draft. */
  flush: () => Promise<void>;
  /** The selected text, read when a message is sent. */
  getSelectedText: () => string;
}

const DocumentAgentPanel = ({
  assetId,
  title,
  flush,
  getSelectedText
}: DocumentAgentPanelProps) => {
  const { t } = useTranslation();
  const directApply = useDocumentProposalStore((state) => state.directApply);
  const setDirectApply = useDocumentProposalStore(
    (state) => state.setDirectApply
  );

  const focused = useMemo<UiDocumentRef>(
    () => ({ type: "document", id: assetId, title: title || null }),
    [assetId, title]
  );
  const getSelection = useCallback((): UiContext["selection"] => {
    const text = getSelectedText().trim();
    return text ? { text } : undefined;
  }, [getSelectedText]);

  const toggleDirectApply = useCallback(() => {
    setDirectApply(!directApply);
  }, [directApply, setDirectApply]);

  const headerActions = useMemo(
    () => (
      <EditorButton
        density="compact"
        variant={directApply ? "contained" : "outlined"}
        aria-pressed={directApply}
        tooltip={
          directApply
            ? t(
                "documentEditor.agent.directApplyTooltip",
                "Direct apply is on: assistant edits write immediately. Click to require approval first."
              )
            : t(
                "documentEditor.agent.stagedApprovalTooltip",
                "Review changes is on: assistant edits open as a proposal to accept, edit, or reject. Click for direct apply."
              )
        }
        onClick={toggleDirectApply}
      >
        {directApply
          ? t("documentEditor.agent.directApply", "Direct apply")
          : t("documentEditor.agent.stagedApproval", "Review changes")}
      </EditorButton>
    ),
    [directApply, t, toggleDirectApply]
  );

  return (
    <AssistantChatPanel
      chatSource="document_assistant"
      focused={focused}
      getSelection={getSelection}
      beforeSend={flush}
      documentEditMode={directApply ? "direct" : "staged"}
      headerActions={headerActions}
      welcomeTitle={t("documentEditor.agent.welcomeTitle")}
      welcomeBody={t("documentEditor.agent.welcomeBody")}
    />
  );
};

export default memo(DocumentAgentPanel);
