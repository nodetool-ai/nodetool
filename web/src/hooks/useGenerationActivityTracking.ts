/**
 * Feeds GenerationActivityStore from the socket, so the bottom panel's
 * Generations view lists every media generation without each surface
 * reporting its own.
 *
 * Three streams reach it:
 * - `generate_media` commands this client sends (editors, guided flows,
 *   frontend tools), settled by their `rpc_response`.
 * - `chat_message` commands in a media mode, settled when the thread's turn
 *   ends.
 * - `prediction` messages a workflow run or a chat agent reports for a media
 *   capability, settled by their terminal status.
 *
 * A `generate_media` reply goes to the socket that asked, so a reload or a
 * dropped connection loses it. Those requests are looked up by request id
 * until the server row settles, the same recovery the storyboard uses.
 */
import { useEffect } from "react";
import {
  useGenerationActivityStore,
  mediaKindOf,
  type GenerationActivity,
  type GenerationActivitySource
} from "../stores/GenerationActivityStore";
import useGlobalChatStore from "../stores/GlobalChatStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../stores/WorkspaceTabsStore";
import { getThreadRuntime } from "../core/chat/threadRuntime";
import { isMediaPredictionCapability } from "../core/chat/mediaPrediction";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../lib/websocket/GlobalWebSocketManager";
import {
  isSettled,
  lookupGenerations,
  type GenerationLookupStatus
} from "../lib/websocket/lookupGenerations";
import { rpcRequest } from "../lib/websocket/rpcRequest";
import { isObjectLike, isString } from "../utils/typePredicates";

/** How long before the first lookup of a request whose reply may be lost. */
const FIRST_LOOKUP_MS = 3_000;
const MAX_LOOKUP_MS = 15_000;

const readString = (value: unknown): string | null =>
  isString(value) && value.length > 0 ? value : null;

const readRecord = (value: unknown): Record<string, unknown> =>
  isObjectLike(value) && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isString) : [];

const readAssetIds = readStrings;

/** A `generate_media` request's settings: everything but the prompt. */
const readRequestSettings = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const { prompt: _prompt, ...settings } = data;
  return settings;
};

/** The active workspace tab, which is where a request was started from. */
const activeTabSource = (): GenerationActivitySource | null => {
  const tab = useWorkspaceTabsStore.getState().getActiveTab();
  return tab ? { type: tab.type, ref: tab.ref, title: tab.title } : null;
};

const chatSource = (threadId: string): GenerationActivitySource => ({
  type: "chat",
  ref: threadId,
  title: useGlobalChatStore.getState().threads[threadId]?.title ?? ""
});

/** An open tab showing `ref`, so a workflow run's prediction gets its name. */
const tabSourceFor = (
  type: WorkspaceTabType,
  ref: string
): GenerationActivitySource => {
  const tab = useWorkspaceTabsStore
    .getState()
    .tabs.find((item) => item.type === type && item.ref === ref);
  return { type, ref, title: tab?.title ?? "" };
};

const settledStatus = (
  status: GenerationLookupStatus | string
): "generated" | "failed" | "cancelled" | null => {
  switch (status) {
    case "completed":
      return "generated";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "needs_attention":
    case "interrupted":
      return "failed";
    default:
      return null;
  }
};

/** A started `generate_media` request, or null for any other command. */
export const generationFromCommand = (
  message: Record<string, unknown>,
  source: GenerationActivitySource | null,
  now: number = Date.now()
): GenerationActivity | null => {
  const data = readRecord(message.data);
  if (message.command === "generate_media") {
    const id = readString(message.request_id);
    if (!id) {
      return null;
    }
    const generation: GenerationActivity = {
      id,
      channel: "rpc",
      request: readRequestSettings(data),
      status: "generating",
      kind: mediaKindOf(readString(data.mode)),
      prompt: readString(data.prompt),
      model: readString(data.model),
      source,
      threadId: null,
      startedAt: now,
      endedAt: null,
      assetIds: [],
      error: null
    };
    const presetIds = readStrings(data.preset_ids);
    if (presetIds.length > 0) {
      generation.preset_ids = presetIds;
    }
    return generation;
  }
  if (message.command === "chat_message") {
    const media = readRecord(data.media_generation);
    const mode = readString(media.mode);
    const id = readString(data.id);
    const threadId = readString(data.thread_id);
    if (!mode || mode === "chat" || !id || !threadId) {
      return null;
    }
    const content = data.content;
    const prompt = isString(content)
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => readString(readRecord(part).text))
            .filter(isString)
            .join(" ")
        : null;
    return {
      id,
      channel: "chat",
      status: "generating",
      kind: mediaKindOf(mode),
      prompt: prompt || null,
      model: readString(media.model) ?? readString(data.model),
      source: chatSource(threadId),
      threadId,
      startedAt: now,
      endedAt: null,
      assetIds: [],
      error: null
    };
  }
  return null;
};

/** Ids of `generate_media` requests whose reply can still reach this socket. */
const liveRequests = new Set<string>();

const handleSend = (message: Record<string, unknown>): void => {
  const generation = generationFromCommand(message, activeTabSource());
  if (!generation) {
    return;
  }
  if (generation.channel === "rpc") {
    liveRequests.add(generation.id);
  }
  useGenerationActivityStore.getState().start(generation);
};

const handlePrediction = (message: WebSocketMessage): void => {
  if (!isMediaPredictionCapability(readString(message.capability))) {
    return;
  }
  const id = readString(message.id);
  if (!id) {
    return;
  }
  const store = useGenerationActivityStore.getState();
  const origin = readRecord(message.origin);
  const requestId = readString(origin.request_id);
  const threadId = readString(origin.thread_id) ?? readString(message.thread_id);
  // The request or the media chat turn that caused it is already listed.
  if (requestId && store.generations[requestId]) {
    return;
  }
  if (
    threadId &&
    Object.values(store.generations).some(
      (generation) =>
        generation.channel === "chat" &&
        generation.threadId === threadId &&
        generation.status === "generating"
    )
  ) {
    return;
  }
  const status = readString(message.status) ?? "running";
  const outcome = settledStatus(status);
  if (!store.generations[id]) {
    if (outcome) {
      // The start was missed (sent before this page loaded). Nothing to show
      // but a result, which the surface that ran it already shows.
      return;
    }
    const workflowId = readString(message.workflow_id);
    const params = readRecord(message.params);
    store.start({
      id,
      channel: "prediction",
      status: "generating",
      kind: mediaKindOf(readString(message.capability)),
      prompt: readString(params.prompt),
      model: readString(message.model),
      source: threadId
        ? chatSource(threadId)
        : workflowId
          ? tabSourceFor("workflow", workflowId)
          : null,
      threadId,
      startedAt: Date.now(),
      endedAt: null,
      assetIds: [],
      error: null
    });
    return;
  }
  if (outcome) {
    store.settle(id, {
      status: outcome,
      assetIds: readAssetIds(message.asset_ids),
      error: readString(message.error)
    });
  }
};

const handleMessage = (message: WebSocketMessage): void => {
  if (message.type === "prediction") {
    handlePrediction(message);
    return;
  }
  if (message.type !== "rpc_response") {
    return;
  }
  const id = readString(message.request_id);
  if (!id || !liveRequests.has(id)) {
    return;
  }
  liveRequests.delete(id);
  const error = readRecord(message.error);
  if (Object.keys(error).length > 0) {
    useGenerationActivityStore.getState().settle(id, {
      status: "failed",
      error: readString(error.message)
    });
    return;
  }
  const result = readRecord(message.result);
  useGenerationActivityStore.getState().settle(id, {
    status: "generated",
    assetIds: readAssetIds(result.asset_ids)
  });
};

/** A media chat turn is over once its thread is no longer busy. */
const settleChatTurns = (): void => {
  const store = useGenerationActivityStore.getState();
  const chat = useGlobalChatStore.getState();
  for (const generation of Object.values(store.generations)) {
    if (
      generation.channel !== "chat" ||
      generation.status !== "generating" ||
      !generation.threadId
    ) {
      continue;
    }
    const runtime = getThreadRuntime(chat, generation.threadId);
    if (runtime.status === "error") {
      store.settle(generation.id, { status: "failed", error: runtime.error });
    } else if (runtime.status === "idle") {
      store.settle(generation.id, { status: "generated" });
    }
  }
};

/**
 * Stop one generation the way its channel allows. A prediction from a
 * workflow run is stopped with the run, from the Queue.
 */
export const cancelGeneration = async (
  generation: GenerationActivity
): Promise<void> => {
  if (generation.channel === "rpc") {
    await rpcRequest("cancel_generation", { request_ids: [generation.id] });
  } else if (generation.channel === "chat" && generation.threadId) {
    useGlobalChatStore.getState().stopGeneration(generation.threadId);
  } else {
    return;
  }
  liveRequests.delete(generation.id);
  useGenerationActivityStore
    .getState()
    .settle(generation.id, { status: "cancelled" });
};

/** Start following the socket. Returns the teardown. */
export const startGenerationActivityTracking = (): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = FIRST_LOOKUP_MS;
  let stopped = false;

  // A chat turn or a run's prediction cannot be followed across a reload:
  // its messages went to the old page. Drop them rather than show them
  // running forever.
  const store = useGenerationActivityStore.getState();
  store.remove(
    Object.values(store.generations)
      .filter(
        (generation) =>
          generation.status === "generating" && generation.channel !== "rpc"
      )
      .map((generation) => generation.id)
  );

  const orphanedRequests = (): string[] =>
    Object.values(useGenerationActivityStore.getState().generations)
      .filter(
        (generation) =>
          generation.channel === "rpc" &&
          generation.status === "generating" &&
          !liveRequests.has(generation.id)
      )
      .map((generation) => generation.id);

  const schedule = (): void => {
    if (stopped || timer !== undefined || orphanedRequests().length === 0) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void lookUp();
    }, delay);
  };

  const lookUp = async (): Promise<void> => {
    const ids = orphanedRequests();
    const outcomes = await lookupGenerations(ids);
    for (const [id, outcome] of outcomes) {
      const status = isSettled(outcome.status)
        ? settledStatus(outcome.status)
        : null;
      if (status) {
        useGenerationActivityStore.getState().settle(id, {
          status,
          assetIds: outcome.assetIds,
          error: outcome.error
        });
      }
    }
    delay = Math.min(Math.round(delay * 1.5), MAX_LOOKUP_MS);
    schedule();
  };

  // Replies to the closed socket are gone, so every open request now has to
  // be looked up.
  const handleClose = (): void => {
    liveRequests.clear();
    delay = FIRST_LOOKUP_MS;
    schedule();
  };

  const offSend = globalWebSocketManager.subscribeEvent("send", handleSend);
  const offMessage = globalWebSocketManager.subscribeEvent(
    "message",
    handleMessage
  );
  const offClose = globalWebSocketManager.subscribeEvent("close", handleClose);
  const offChat = useGlobalChatStore.subscribe((state, previous) => {
    if (state.threadRuntime !== previous.threadRuntime) {
      settleChatTurns();
    }
  });
  schedule();

  return () => {
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    offSend();
    offMessage();
    offClose();
    offChat();
  };
};

/** Mount once in the workspace shell. */
export const useGenerationActivityTracking = (): void => {
  useEffect(() => startGenerationActivityTracking(), []);
};
