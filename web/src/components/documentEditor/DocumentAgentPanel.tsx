/**
 * The assistant docked beside the document editor (document editor PRD R7).
 * It names the document as the focused document and sends the selected
 * text with each message. Before a message goes out, the open draft is
 * saved, so the agent reads what the user sees (R8).
 */
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";

interface DocumentAgentPanelProps {
  assetId: string;
  title?: string | null;
  /** Saves the open draft. */
  flush: () => Promise<void>;
  /** The selected text, read when a message is sent. */
  getSelectedText: () => string;
}

const DocumentAgentPanel = ({ assetId, title, flush, getSelectedText }: DocumentAgentPanelProps) => {
  const { t } = useTranslation();
  const focused = useMemo<UiDocumentRef>(
    () => ({ type: "document", id: assetId, title: title || null }),
    [assetId, title]
  );
  const getSelection = useCallback((): UiContext["selection"] => {
    const text = getSelectedText().trim();
    return text ? { text } : undefined;
  }, [getSelectedText]);

  return (
    <AssistantChatPanel
      chatSource="document_assistant"
      focused={focused}
      getSelection={getSelection}
      beforeSend={flush}
      welcomeTitle={t("documentEditor.agent.welcomeTitle")}
      welcomeBody={t("documentEditor.agent.welcomeBody")}
    />
  );
};

export default memo(DocumentAgentPanel);
