/**
 * The writing assistant's request state for one TextArea.
 *
 * `run` sends one `generate_text` request with the chat model and keeps the
 * reply as a proposal. The field does not change until the caller applies
 * the proposal, so a follow-up instruction refines the proposal, not the
 * field.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";

import useGlobalChatStore from "../stores/GlobalChatStore";
import { rpcRequest } from "../lib/websocket/rpcRequest";
import {
  TEXT_ASSIST_MAX_TOKENS,
  TEXT_ASSIST_SYSTEM_PROMPT,
  buildTextAssistPrompt,
  cleanTextAssistReply,
  type TextAssistField
} from "../utils/textAssist";

export type TextAssistStatus = "idle" | "running" | "error";

export interface UseTextAssistResult {
  readonly proposal: string | null;
  readonly status: TextAssistStatus;
  readonly error: string | null;
  /** Rewrites `source` by `instruction` and stores the reply as the proposal. */
  readonly run: (instruction: string, source: string) => Promise<void>;
  readonly cancel: () => void;
  /** Drops the proposal and any error. */
  readonly reset: () => void;
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export const useTextAssist = (field: TextAssistField): UseTextAssistResult => {
  const [proposal, setProposal] = useState<string | null>(null);
  const [status, setStatus] = useState<TextAssistStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback((): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(
    async (instruction: string, source: string): Promise<void> => {
      const model = useGlobalChatStore.getState().selectedModel;
      if (!isModelSelected(model)) {
        setError("Pick a model below before you ask the assistant.");
        setStatus("error");
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("running");
      setError(null);
      try {
        const answer = await rpcRequest(
          "generate_text",
          {
            provider: model.provider,
            model: model.id,
            system: TEXT_ASSIST_SYSTEM_PROMPT,
            prompt: buildTextAssistPrompt({ field, text: source, instruction }),
            max_tokens: TEXT_ASSIST_MAX_TOKENS
          },
          undefined,
          controller.signal
        );
        const text = cleanTextAssistReply(
          typeof answer.text === "string" ? answer.text : ""
        );
        if (!text) {
          throw new Error("The model returned no text. Try again or pick another model.");
        }
        setProposal(text);
        setStatus("idle");
      } catch (err) {
        if (isAbort(err)) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [field]
  );

  const reset = useCallback((): void => {
    setProposal(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { proposal, status, error, run, cancel, reset };
};

export default useTextAssist;
