import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "./state/useSketchStore";

/**
 * Chat surface for the image / sketch editor. The shared assistant panel
 * sends `ui_context` with this document, the active layers, and
 * `source: sketch_assistant`.
 */
const SketchAgentPanel = () => {
  const { t } = useTranslation();
  const documentId = useSketchSessionStore((s) => s.documentId);
  const name = useSketchSessionStore((s) => s.name);

  const focused = useMemo<UiDocumentRef | null>(
    () =>
      documentId
        ? { type: "sketch", id: documentId, title: name || null }
        : null,
    [documentId, name]
  );

  const getSelection = useCallback(() => {
    const { selectedLayerIds, document } = useSketchStore.getState();
    const ids =
      selectedLayerIds.length > 0
        ? selectedLayerIds
        : document.activeLayerId
          ? [document.activeLayerId]
          : [];
    return ids.length > 0 ? { layer_ids: ids } : null;
  }, []);

  return (
    <AssistantChatPanel
      chatSource="sketch_assistant"
      focused={focused}
      getSelection={getSelection}
      workflowId={documentId}
      docsTopic="sketches"
      docsLabel={t("i18n-cont-sketch-03.agent.docsLabel")}
      welcomeTitle={t("i18n-cont-sketch-03.agent.welcomeTitle")}
      welcomeBody={t("i18n-cont-sketch-03.agent.welcomeBody")}
    />
  );
};

export default memo(SketchAgentPanel);
