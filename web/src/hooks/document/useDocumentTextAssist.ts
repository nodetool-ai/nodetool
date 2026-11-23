/**
 * The model call behind the document editor's selection prompt (document
 * editor PRD R10). One conversation per selection: the first turn carries
 * the whole document, a follow-up refines the previous answer. The chat's
 * selected model answers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { isString } from "../../utils/typePredicates";
import {
  DOCUMENT_ASSIST_SYSTEM_PROMPT,
  buildDocumentAssistPrompt,
  parseDocumentAssistReply,
  type AssistReply,
  type DocumentAssistRequest
} from "../../components/documentEditor/documentAssist";

const MAX_TOKENS = 2000;

export type DocumentTextAssistError = "no_model" | "empty" | "failed";

export interface DocumentTextAssist {
  status: "idle" | "running" | "error";
  error: DocumentTextAssistError | null;
  errorDetail: string | null;
  reply: AssistReply | null;
  ask: (request: DocumentAssistRequest) => Promise<void>;
  followUp: (instruction: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function useDocumentTextAssist(): DocumentTextAssist {
  const [status, setStatus] = useState<DocumentTextAssist["status"]>("idle");
  const [error, setError] = useState<DocumentTextAssistError | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [reply, setReply] = useState<AssistReply | null>(null);
  const turns = useRef<Turn[]>([]);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const send = useCallback(
    async (next: Turn[]): Promise<void> => {
      cancel();
      const model = useGlobalChatStore.getState().selectedModel;
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
          {
            provider: model.provider,
            model: model.id,
            system: DOCUMENT_ASSIST_SYSTEM_PROMPT,
            messages: next,
            max_tokens: MAX_TOKENS
          },
          undefined,
          own.signal
        );
        if (own.signal.aborted) return;
        const text = isString(answer.text) ? answer.text : "";
        const parsed = parseDocumentAssistReply(text);
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
        if (controller.current === own) controller.current = null;
      }
    },
    [cancel]
  );

  const ask = useCallback(
    (request: DocumentAssistRequest) => {
      setReply(null);
      return send([{ role: "user", content: buildDocumentAssistPrompt(request) }]);
    },
    [send]
  );

  const followUp = useCallback(
    (instruction: string) =>
      send([
        ...turns.current,
        { role: "user", content: `Follow-up instruction: ${instruction.trim()}\nReply in the same format.` }
      ]),
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
