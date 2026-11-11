/**
 * The chat presentation of a step app (`presentation: "chat"`).
 *
 * The app agent owns the loop. The user sees the app's steps bar, a
 * conversation, and the step cards the agent shows in it. A press inside a
 * card, or on an earlier step of the bar, is sent to the agent as an app
 * event; the agent decides what runs and which step comes next, so a failure,
 * a question or a missing value is a turn in the conversation rather than a
 * dead end on a page.
 *
 * Rendered inside `AppRuntimeContext`: the cards and the page share the one
 * runtime store, so switching to the page view keeps every value.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Render, type Data } from "@puckeditor/core";
import {
  buildChatAppSystemPrompt,
  chatAppSnapshot,
  chatModelVariableIds,
  formatChatAppEvent,
  previewAppValue,
  resolveBinding,
  settledInvocation,
  type ApplicationDocument,
  type BindingRef,
  type ChatAppEvent,
  type ChatAppLayout,
  type ChatAppSettled
} from "@nodetool-ai/app-runtime";

import ChatView from "../../chat/containers/ChatView";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import type { ChatOutgoingMessage } from "../../../stores/MediaGenerationStore";
import type { LanguageModel } from "../../../stores/ApiTypes";
import { useChatViewThread } from "../../../hooks/chat/useChatViewThread";
import useThreadModel from "../../../hooks/chat/useThreadModel";
import type { BuildUiContextOptions } from "../../../lib/chat/uiContext";
import {
  AppRuntimeContext,
  useAppRuntimeContext
} from "../runtime/AppRuntimeContext";
import { useAppConfig } from "../puck/config";
import { StepperWidget, type StepperStep } from "../puck/widgets";
import {
  Box,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  ScrollArea,
  SPACING,
  Text
} from "../../ui_primitives";
import {
  setChatAppHandler,
  type ChatAppHandler,
  type ChatAppRunResult
} from "./chatAppBridge";
import { ChatAppContext, type ChatAppContextValue } from "./ChatAppContext";
import AppRestartButton from "../AppRestartButton";
import { ChatAppStepBody } from "./ChatAppStepCard";
import "./registerChatAppMessages";

type ChatViewStatus = React.ComponentProps<typeof ChatView>["status"];

const THREAD_KEY_PREFIX = "nodetool.chat-app-thread.v1.";

const readThreadId = (appRunId: string): string | null => {
  try {
    return window.localStorage.getItem(THREAD_KEY_PREFIX + appRunId);
  } catch {
    return null;
  }
};

const writeThreadId = (appRunId: string, threadId: string): void => {
  try {
    window.localStorage.setItem(THREAD_KEY_PREFIX + appRunId, threadId);
  } catch {
    // Storage blocked: the next visit starts a new conversation.
  }
};

const RenderHeader = React.memo(Render);

type SettledRun = NonNullable<ReturnType<typeof settledInvocation>>;

/**
 * How long ui_app_run_operation waits for a run. Tool calls have their own
 * deadline (60 s for the Claude agent provider), so a longer run returns
 * "running" and reports back with a settled app event.
 */
const RUN_WAIT_MS = 40_000;

interface ChatAppViewProps {
  document: ApplicationDocument;
  layout: ChatAppLayout;
  appRunId: string;
  title: string;
  /** Switch this app to its page presentation. */
  onShowPage?: () => void;
}

/** The handler the agent's `ui_app_run_*` tools call. */
const useChatAppHandler = (
  document: ApplicationDocument,
  layout: ChatAppLayout,
  appRunId: string,
  onSettled: (settled: ChatAppSettled) => void,
  chatModel: LanguageModel | null
): void => {
  const chatModelRef = useRef(chatModel);
  chatModelRef.current = chatModel;
  const runtime = useAppRuntimeContext();
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    const { store } = runtimeRef.current;
    const handler: ChatAppHandler = {
      getState: () => chatAppSnapshot(document, layout, store.getState()),
      showStep: (step) => {
        const entry = layout.steps.find((candidate) => candidate.value === step);
        if (!entry) {
          throw new Error(
            `Unknown step "${step}". Steps: ${layout.steps.map((s) => s.value).join(", ")}.`
          );
        }
        store.getState().dispatchEvent({
          type: "setVariable",
          variableId: layout.stepVariableId,
          value: step
        });
        return { step, title: entry.title };
      },
      setInputs: (values) => {
        const written: string[] = [];
        const unknown: string[] = [];
        for (const [key, value] of Object.entries(values)) {
          if (key === layout.stepVariableId) {
            unknown.push(key);
            continue;
          }
          if (document.variables.some((variable) => variable.id === key)) {
            store.getState().dispatchEvent({ type: "setVariable", variableId: key, value });
            written.push(key);
            continue;
          }
          const ref: BindingRef | null = resolveBinding(key, runtimeRef.current.scope, "write");
          if (ref && ref.kind === "input") {
            runtimeRef.current.write(ref, value);
            written.push(key);
            continue;
          }
          unknown.push(key);
        }
        return { written, unknown };
      },
      runOperation: async (operationId, signal) => {
        const operation = document.operations.find((op) => op.id === operationId);
        if (!operation) {
          throw new Error(
            `Unknown operation "${operationId}". Operations: ${document.operations.map((op) => op.id).join(", ")}.`
          );
        }
        if (operation.agentTask) {
          throw new Error(
            `"${operation.name}" is your task, not a run. Do it yourself as the system prompt describes, then write the result with ui_app_run_set_inputs.`
          );
        }
        // The chat's model does the app's language-model work.
        const chatModel = chatModelRef.current;
        if (chatModel?.provider && chatModel.id) {
          for (const variableId of chatModelVariableIds(document)) {
            store.getState().dispatchEvent({
              type: "setVariable",
              variableId,
              value: {
                type: "language_model",
                provider: chatModel.provider,
                id: chatModel.id,
                name: chatModel.name ?? chatModel.id
              }
            });
          }
        }
        const startState = store.getState();
        const startActive = startState.activeInvocation[operationId];
        const before = startActive
          ? (startState.invocationAliases[startActive] ?? startActive)
          : undefined;
        const stepBefore = startState.variables[layout.stepVariableId];
        runtimeRef.current.dispatch({ kind: "run", operationId });

        const result = (
          settled: SettledRun
        ): ChatAppRunResult & { status: ChatAppSettled["status"] } => {
          const state = store.getState();
          const invocation = state.invocations[settled.id];
          const outputs: Record<string, unknown> = {};
          for (const key of invocation?.variableKeys ?? []) {
            const value = previewAppValue(state.variables[key]);
            if (key !== layout.stepVariableId && value !== null) outputs[key] = value;
          }
          for (const [key, slot] of Object.entries(state.outputs)) {
            const value = previewAppValue(slot.value);
            if (key.startsWith(`${operationId}:`) && slot.invocationId === settled.id && value !== null) {
              outputs[key] = value;
            }
          }
          const stepAfter = state.variables[layout.stepVariableId];
          const status = settled.status === "completed" || settled.status === "cancelled"
            ? settled.status
            : "failed";
          const run: ChatAppRunResult & { status: ChatAppSettled["status"] } = {
            operation_id: operationId,
            status,
            outputs
          };
          if (settled.error) run.error = settled.error;
          const runId = state.runReferences[operationId]?.runId;
          if (runId) run.run_id = runId;
          if (stepAfter !== stepBefore && typeof stepAfter === "string") run.step = stepAfter;
          return run;
        };

        // Wait for the run, but not past the tool call's own deadline. A run
        // that outlives the wait reports back as a settled app event.
        const outcome = await new Promise<SettledRun | "aborted" | "waiting">((resolve) => {
          let done = false;
          const finish = (value: SettledRun | "aborted" | "waiting") => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            if (value !== "waiting") unsubscribe();
            resolve(value);
          };
          const check = () => {
            const settled = settledInvocation(store.getState(), operationId, before);
            if (!settled) return;
            if (done) {
              unsubscribe();
              const run = result(settled);
              const report: ChatAppSettled = { operationId, status: run.status };
              if (run.error) report.error = run.error;
              if (run.step) report.step = run.step;
              onSettledRef.current(report);
              return;
            }
            finish(settled);
          };
          const abort = () => finish("aborted");
          const unsubscribe = store.subscribe(check);
          const timer = setTimeout(() => finish("waiting"), RUN_WAIT_MS);
          signal.addEventListener("abort", abort, { once: true });
          check();
        });
        if (outcome === "aborted") {
          return { operation_id: operationId, status: "cancelled", error: "The agent stopped waiting." };
        }
        if (outcome === "waiting") {
          return {
            operation_id: operationId,
            status: "running",
            note: "Still running. Tell the user and end the turn: an app event with settled arrives when it ends."
          };
        }
        return result(outcome);
      },
      cancelOperation: async (operationId) => {
        runtimeRef.current.dispatch({ kind: "cancel", operationId });
      }
    };
    setChatAppHandler(appRunId, handler);
    return () => setChatAppHandler(appRunId, null);
  }, [appRunId, document, layout]);
};

/** The steps bar. Choosing a step asks the agent to show it. */
const ChatAppStepsBar: React.FC<{
  document: ApplicationDocument;
  layout: ChatAppLayout;
  sendEvent: (event: ChatAppEvent) => void;
}> = ({ document, layout, sendEvent }) => {
  const { t } = useTranslation();
  const runtime = useAppRuntimeContext();
  const stepperProps = useMemo(() => {
    const item = document.ui.content.find(
      (candidate) =>
        (candidate as { type?: string }).type === "Stepper"
    ) as { props?: Record<string, unknown> } | undefined;
    return item?.props ?? {};
  }, [document]);
  const write = useCallback(
    (ref: BindingRef, value: unknown) => {
      const current = runtime.store.getState().variables[layout.stepVariableId];
      if (
        ref.kind === "variable" &&
        ref.variableId === layout.stepVariableId &&
        current != null &&
        value !== current
      ) {
        sendEvent({
          control: t("i18n-next8.appBuilder.chatApp.stepsBar"),
          requests: [{ kind: "step", step: String(value) }]
        });
        return;
      }
      runtime.write(ref, value);
    },
    [layout.stepVariableId, runtime, sendEvent, t]
  );
  const value = useMemo(() => ({ ...runtime, write }), [runtime, write]);
  return (
    <AppRuntimeContext.Provider value={value}>
      <StepperWidget
        id={layout.stepperId}
        binding={layout.stepBinding}
        steps={layout.steps.map(({ value: stepValue, title }): StepperStep => ({ value: stepValue, title }))}
        allowBack={stepperProps.allowBack !== false}
      />
    </AppRuntimeContext.Provider>
  );
};

const ChatAppView: React.FC<ChatAppViewProps> = ({
  document,
  layout,
  appRunId,
  title,
  onShowPage
}) => {
  const { t } = useTranslation();
  const config = useAppConfig();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const connect = useGlobalChatStore((state) => state.connect);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const {
    threadId,
    messages,
    runtime,
    selectThread,
    sendMessage,
    stopGeneration
  } = useChatViewThread({ isolated: true });
  const { model, setModel } = useThreadModel(threadId);

  // Runs that outlived their tool call, waiting for the agent to be free.
  const [settledRuns, setSettledRuns] = useState<ChatAppSettled[]>([]);
  const queueSettled = useCallback((settled: ChatAppSettled) => {
    setSettledRuns((queue) => [...queue, settled]);
  }, []);
  useChatAppHandler(document, layout, appRunId, queueSettled, model);

  const startThread = useCallback(async () => {
    const id = await createNewThread(title, null, { makeCurrent: false });
    writeThreadId(appRunId, id);
    selectThread(id);
    return id;
  }, [appRunId, createNewThread, selectThread, title]);

  // One conversation per app run, kept across reloads.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    connect()
      .then(() => {
        const stored = readThreadId(appRunId);
        if (stored) {
          selectThread(stored);
          return undefined;
        }
        return startThread();
      })
      .catch((error: unknown) => {
        console.error("Chat app: could not open the conversation", error);
      });
  }, [appRunId, connect, selectThread, startThread]);

  const systemPrompt = useMemo(
    () => buildChatAppSystemPrompt(document, layout, { appRunId, title }),
    [appRunId, document, layout, title]
  );
  const uiContext = useCallback(
    (): BuildUiContextOptions => ({
      focused: { type: "app_run", id: appRunId, title }
    }),
    [appRunId, title]
  );

  const sendEvent = useCallback(
    (event: ChatAppEvent) => {
      const outgoing: ChatOutgoingMessage = {
        type: "message",
        name: "",
        role: "user",
        provider: model?.provider as ChatOutgoingMessage["provider"],
        model: model?.id,
        content: [{ type: "text", text: formatChatAppEvent(event) }],
        system_prompt: systemPrompt,
        ui_context: {
          focused: { type: "app_run", id: appRunId, title },
          open: [],
          selection: null,
          source: "app_run"
        },
        media_generation: null
      };
      sendMessage(outgoing).catch((error: unknown) => {
        addNotification({
          type: "error",
          content: t("i18n-next8.appBuilder.chatApp.sendFailed", {
            error: error instanceof Error ? error.message : String(error)
          })
        });
      });
    },
    [addNotification, appRunId, model, sendMessage, systemPrompt, t, title]
  );

  const agentBusy = runtime.status === "loading" || runtime.status === "streaming";
  useEffect(() => {
    if (agentBusy || settledRuns.length === 0) return;
    const [next, ...rest] = settledRuns;
    setSettledRuns(rest);
    const operation = document.operations.find((op) => op.id === next.operationId);
    sendEvent({ control: operation?.name ?? next.operationId, requests: [], settled: next });
  }, [agentBusy, document.operations, sendEvent, settledRuns]);

  const context = useMemo<ChatAppContextValue>(
    () => ({ appRunId, document, layout, threadId, sendEvent }),
    [appRunId, document, layout, sendEvent, threadId]
  );

  const header = useMemo<Data>(
    () => ({ root: { props: {} }, content: layout.header as Data["content"] }),
    [layout.header]
  );

  const viewStatus: ChatViewStatus =
    runtime.status === "idle" || runtime.status === "stopping"
      ? "connected"
      : runtime.status;

  const firstStep = layout.steps[0]?.value ?? "";
  // Before the first turn, the first step is on screen at once, without a
  // model call. A press in it starts the conversation like any other.
  const starter = (
    <ScrollArea thin sx={{ flex: 1, minHeight: 0, width: "100%" }}>
      <FlexColumn gap={SPACING.md} fullWidth sx={{ px: SPACING.lg, py: SPACING.md }}>
        <Text color="secondary">{t("i18n-next8.appBuilder.chatApp.starter")}</Text>
        <Card variant="outlined" padding="normal" data-testid={`chat-app-card-${firstStep}`}>
          <ChatAppStepBody step={firstStep} />
        </Card>
      </FlexColumn>
    </ScrollArea>
  );

  return (
    <ChatAppContext.Provider value={context}>
      <FlexColumn
        gap={0}
        fullWidth
        data-testid="chat-app"
        sx={{ height: "100%", minHeight: 0 }}
      >
        <FlexColumn
          gap={SPACING.sm}
          fullWidth
          sx={{ px: SPACING.xl, pt: SPACING.md, pb: SPACING.sm, borderBottom: "1px solid", borderColor: "divider" }}
        >
          <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
            <Text weight={600}>{title}</Text>
            <FlexRow gap={SPACING.xs}>
              <EditorButton variant="text" onClick={() => void startThread()}>
                {t("i18n-next8.appBuilder.chatApp.newChat")}
              </EditorButton>
              <AppRestartButton onRestarted={() => void startThread()} />
              {onShowPage ? (
                <EditorButton variant="text" onClick={onShowPage}>
                  {t("i18n-next8.appBuilder.chatApp.pageView")}
                </EditorButton>
              ) : null}
            </FlexRow>
          </FlexRow>
          {layout.header.length > 0 ? (
            <Box className="appbuilder-runtime">
              <RenderHeader config={config} data={header} />
            </Box>
          ) : null}
          <ChatAppStepsBar document={document} layout={layout} sendEvent={sendEvent} />
        </FlexColumn>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ChatView
            status={viewStatus}
            messages={messages}
            sendMessage={sendMessage}
            progress={runtime.progress.current}
            total={runtime.progress.total}
            progressMessage={runtime.statusMessage}
            runningToolCallId={runtime.runningToolCallId}
            model={model}
            onModelChange={setModel}
            onStop={stopGeneration}
            onNewChat={() => void startThread()}
            currentPlanningUpdate={runtime.planningUpdate}
            currentTaskUpdate={runtime.taskUpdate}
            currentLogUpdate={runtime.logUpdate}
            systemPrompt={systemPrompt}
            chatSource="app_run"
            uiContext={uiContext}
            requireToolSupport
            noMessagesPlaceholder={starter}
            composerPlaceholder={t("i18n-next8.appBuilder.chatApp.composerPlaceholder")}
            threadId={threadId}
            key={threadId ?? "no-thread"}
          />
        </Box>
      </FlexColumn>
    </ChatAppContext.Provider>
  );
};

export default ChatAppView;
