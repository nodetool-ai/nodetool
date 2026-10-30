import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UiDocumentRef } from "@nodetool-ai/protocol";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";

interface AssetAgentPanelProps {
  /** The asset editor this assistant sits beside. */
  type: "svg" | "audio";
  assetId: string;
  title?: string | null;
}

const CHAT_SOURCE = {
  svg: "svg_assistant",
  audio: "audio_assistant"
} as const;

/**
 * The assistant docked beside an SVG or audio editor. It names the asset as
 * the focused document, so the `ui_svg_*` and `ui_audio_*` tools get its id.
 */
const AssetAgentPanel = ({ type, assetId, title }: AssetAgentPanelProps) => {
  const { t } = useTranslation();
  const focused = useMemo<UiDocumentRef>(
    () => ({ type, id: assetId, title: title || null }),
    [type, assetId, title]
  );

  return (
    <AssistantChatPanel
      chatSource={CHAT_SOURCE[type]}
      focused={focused}
      welcomeTitle={t(`i18n-next51.${type}.assistantWelcomeTitle`)}
      welcomeBody={t(`i18n-next51.${type}.assistantWelcomeBody`)}
    />
  );
};

export default memo(AssetAgentPanel);
