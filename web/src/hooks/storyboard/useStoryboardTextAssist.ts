/**
 * The model call behind the storyboard text view's selection assistant.
 *
 * One conversation per selection: the first turn carries the whole board, a
 * follow-up refines the previous answer. The board's director model answers;
 * before one is picked, the chat model stands in, as for the script writer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { isString } from "../../utils/typePredicates";
import {
  ASSIST_SYSTEM_PROMPT,
  buildAssistPrompt,
  buildFollowUp,
  parseAssistReply,
  type AssistReply,
  type AssistRequest
} from "../../components/storyboard/text/storyboardTextAssist";

const MAX_TOKENS = 2000;

export type StoryboardTextAssistError = "no_model" | "empty" | "failed";

export interface StoryboardTextAssist {
  status: "idle" | "running" | "error";
  error: StoryboardTextAssistError | null;
  /** The provider's own message, for the bug report. */
  errorDetail: string | null;
  reply: AssistReply | null;
  /** Start a conversation about a selection. */
  ask: (request: AssistRequest) => Promise<void>;
  /** Refine the last answer. */
  followUp: (instruction: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function useStoryboardTextAssist(boardId: string): StoryboardTextAssist {
  const [status, setStatus] = useState<StoryboardTextAssist["status"]>("idle");
  const [error, setError] = useState<StoryboardTextAssistError | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [reply, setReply] = useState<AssistReply | null>(null);
  const turns = useRef<Turn[]>([]);
  const mode = useRef<AssistRequest["selection"]["mode"]>("single");
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const send = useCallback(
    async (next: Turn[]): Promise<void> => {
      cancel();
      const model = useStoryboardStore.getState().boards[boardId]?.directorModel ?? useGlobalChatStore.getState().selectedModel;
      if (!isModelSelected(model)) {
        setStatus("error");
        setError("no_model");
        return;
      }
      const own = new AbortController();
      controller.current = own;
      setStatus("running");
      setError(null);
      setErrorDetail(null);
      try {
        const answer = await rpcRequest(
          "generate_text",
          { provider: model.provider, model: model.id, system: ASSIST_SYSTEM_PROMPT, messages: next, max_tokens: MAX_TOKENS },
          undefined,
          own.signal
        );
        if (own.signal.aborted) {
          return;
        }
        const text = isString(answer.text) ? answer.text : "";
        const parsed = parseAssistReply(text, { mode: mode.current });
        if (!parsed.text) {
          setStatus("error");
          setError("empty");
          return;
        }
        turns.current = [...next, { role: "assistant", content: text }];
        setReply(parsed);
        setStatus("idle");
      } catch (cause) {
        if (own.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
          setStatus("idle");
          return;
        }
        setStatus("error");
        setError("failed");
        setErrorDetail(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (controller.current === own) {
          controller.current = null;
        }
      }
    },
    [boardId, cancel]
  );

  const ask = useCallback(
    (request: AssistRequest) => {
      mode.current = request.selection.mode;
      setReply(null);
      return send([{ role: "user", content: buildAssistPrompt(request) }]);
    },
    [send]
  );

  const followUp = useCallback(
    (instruction: string) => send([...turns.current, { role: "user", content: buildFollowUp(instruction) }]),
    [send]
  );

  const reset = useCallback(() => {
    cancel();
    turns.current = [];
    setReply(null);
    setStatus("idle");
    setError(null);
    setErrorDetail(null);
  }, [cancel]);

  return { status, error, errorDetail, reply, ask, followUp, cancel, reset };
}
