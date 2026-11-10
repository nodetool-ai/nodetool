/**
 * An app event in the thread. The model reads the JSON the turn carries; the
 * user sees what they pressed and what it asked for.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { parseChatAppEvent } from "@nodetool-ai/app-runtime";

import type { UserTurnRendererProps } from "../../chat/message/messageExtensions";
import { Chip, FlexRow, SPACING } from "../../ui_primitives";
import { useChatApp } from "./ChatAppContext";

const ChatAppEventChip: React.FC<UserTurnRendererProps> = ({ text }) => {
  const { t } = useTranslation();
  const chat = useChatApp();
  const event = parseChatAppEvent(text);
  if (!event) return null;
  const stepTitle = (value: string) =>
    chat?.layout.steps.find((step) => step.value === value)?.title ?? value;
  const operationName = (id: string) =>
    chat?.document.operations.find((operation) => operation.id === id)?.name ?? id;
  const asks = event.requests.map((request) =>
    request.kind === "step"
      ? t("i18n-next8.appBuilder.chatApp.asksForStep", { title: stepTitle(request.step) })
      : t("i18n-next8.appBuilder.chatApp.asksToRun", { name: operationName(request.operationId) })
  );
  const label = event.settled
    ? t(`i18n-next8.appBuilder.chatApp.settled.${event.settled.status}`, {
        name: operationName(event.settled.operationId)
      })
    : [
        t("i18n-next8.appBuilder.chatApp.pressed", { control: event.control }),
        ...asks
      ].join(" · ");
  return (
    <FlexRow justify="flex-end" fullWidth sx={{ py: SPACING.xs }}>
      <Chip compact label={label} data-testid="chat-app-event" />
    </FlexRow>
  );
};

export default ChatAppEventChip;
