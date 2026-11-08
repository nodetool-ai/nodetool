/**
 * A chat app's step, rendered in the thread.
 *
 * The card is the step's own widgets, rendered with Puck's `<Render>` against
 * the app's live runtime, so media, forms, uploads, galleries and storyboards
 * work as they do on the page. The newest card is open. An earlier card folds
 * to its title, because the values it would show are the live ones, not the
 * ones it held then.
 */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Render, type Data } from "@puckeditor/core";

import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { Message } from "../../../stores/ApiTypes";
import type { InlineToolWidgetProps } from "../../chat/message/messageExtensions";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { useAppConfig } from "../puck/config";
import {
  Box,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../../ui_primitives";
import { pickStepItems } from "@nodetool-ai/app-runtime";

import { useChatApp } from "./ChatAppContext";
import { useCardRuntime } from "./useCardRuntime";

export const SHOW_STEP_TOOL = "ui_app_run_show_step";

const NO_MESSAGES: Message[] = [];

const RenderStep = React.memo(Render);

/** The id of the thread's newest show-step call. */
const latestShowStepId = (messages: Message[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const calls = messages[index]?.tool_calls;
    if (!Array.isArray(calls)) continue;
    for (let call = calls.length - 1; call >= 0; call--) {
      if (calls[call]?.name === SHOW_STEP_TOOL && calls[call]?.id) {
        return String(calls[call]?.id);
      }
    }
  }
  return null;
};

interface StepBodyProps {
  step: string;
  /** Widget ids to show; all of the step's widgets when absent. */
  only?: string[];
}

/** The step's widgets over the card runtime, which hands presses to the agent. */
export const ChatAppStepBody: React.FC<StepBodyProps> = ({ step, only }) => {
  const chat = useChatApp();
  const config = useAppConfig();
  const runtime = useCardRuntime(step);
  const items = chat?.layout.steps.find((entry) => entry.value === step)?.items;
  const onlyKey = only?.join("\n") ?? "";
  const data = useMemo<Data>(() => {
    const shown = items && onlyKey ? pickStepItems(items, onlyKey.split("\n")) : (items ?? []);
    return { root: { props: {} }, content: shown as Data["content"] };
  }, [items, onlyKey]);
  if (!items) return null;
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <Box className="appbuilder-runtime chat-app-step" sx={{ containerType: "inline-size" }}>
        <RenderStep config={config} data={data} />
      </Box>
    </AppRuntimeContext.Provider>
  );
};

const stringArg = (args: unknown, key: string): string | undefined => {
  if (!args || typeof args !== "object") return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const stringListArg = (args: unknown, key: string): string[] | undefined => {
  if (!args || typeof args !== "object") return undefined;
  const value = (args as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
  return list.length ? list : undefined;
};

const ChatAppStepCard: React.FC<InlineToolWidgetProps> = ({
  toolCall,
  threadId
}) => {
  const { t } = useTranslation();
  const chat = useChatApp();
  const runtime = React.useContext(AppRuntimeContext);
  const messages = useGlobalChatStore((state) =>
    threadId ? (state.messageCache[threadId] ?? NO_MESSAGES) : NO_MESSAGES
  );
  const latest = useMemo(() => latestShowStepId(messages), [messages]);
  const isLatest = Boolean(toolCall.id) && String(toolCall.id) === latest;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? isLatest;

  const step = stringArg(toolCall.args, "step") ?? "";
  const note = stringArg(toolCall.args, "note");
  const only = stringListArg(toolCall.args, "only");
  const appRunId = stringArg(toolCall.args, "app_run_id");
  const index = chat?.layout.steps.findIndex((entry) => entry.value === step) ?? -1;
  const entry = index >= 0 ? chat?.layout.steps[index] : undefined;

  if (!chat || !runtime || (appRunId && appRunId !== chat.appRunId) || !entry) {
    return (
      <Caption color="secondary" sx={{ display: "block", py: SPACING.xs }}>
        {t("i18n-next8.appBuilder.chatApp.stepShown", { step: entry?.title ?? step })}
      </Caption>
    );
  }

  return (
    <FlexColumn gap={SPACING.sm} fullWidth sx={{ my: SPACING.sm }}>
      {note ? <Text>{note}</Text> : null}
      <Card
        variant="outlined"
        padding={open ? "normal" : "compact"}
        data-testid={`chat-app-card-${step}`}
        aria-label={t("i18n-next8.appBuilder.chatApp.stepLabel", {
          index: index + 1,
          total: chat.layout.steps.length,
          title: entry.title
        })}
      >
        <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
          <Caption color="secondary">
            {t("i18n-next8.appBuilder.chatApp.stepLabel", {
              index: index + 1,
              total: chat.layout.steps.length,
              title: entry.title
            })}
          </Caption>
          {!isLatest ? (
            <EditorButton variant="text" onClick={() => setExpanded(!open)}>
              {open
                ? t("i18n-next8.appBuilder.chatApp.hide")
                : t("i18n-next8.appBuilder.chatApp.show")}
            </EditorButton>
          ) : null}
        </FlexRow>
        {open ? (
          <Box sx={{ pt: SPACING.sm }}>
            <ChatAppStepBody step={step} only={only} />
          </Box>
        ) : null}
      </Card>
    </FlexColumn>
  );
};

export default ChatAppStepCard;
