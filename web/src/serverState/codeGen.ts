/**
 * Server state for Code Node AI authoring.
 *
 * One mutation over `codeGen.generate`. The server answers with a typed
 * `CodeGenResponse` — provider and model problems never throw — so the only
 * rejections left are transport ones: an aborted fetch, a dropped connection,
 * or tRPC `UNAUTHORIZED`. `useGenerateCode` folds those into the same
 * discriminated shape, extended with the two failures only a client can see
 * (`offline`, `unauthorized`), so the dialog renders one union.
 *
 * Nothing is cached: each generation is a fresh request against the model.
 */
import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import { trpcClient } from "../trpc/client";

export const codeGenMutationKey = ["code-gen", "generate"] as const;

/** Failures the client adds to the server's `CodeGenError` union. */
export type CodeGenClientErrorCode = "offline" | "unauthorized";

export type CodeGenFailure =
  | codeGen.CodeGenError
  | { code: CodeGenClientErrorCode; message: string };

export type CodeGenResult =
  | { status: "ok"; submission: codeGen.CodeGenSubmission }
  | { status: "error"; error: CodeGenFailure };

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";

const hasTRPCCode = (error: unknown, code: string): boolean => {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === "string" && data.code === code;
};

/** Map a thrown transport error onto the failure union the dialog renders. */
export function toCodeGenFailure(error: unknown): CodeGenFailure {
  if (isAbort(error)) {
    return { code: "aborted", message: "Generation cancelled." };
  }
  if (hasTRPCCode(error, "UNAUTHORIZED")) {
    return { code: "unauthorized", message: "Sign in to generate code." };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { code: "offline", message: "No network connection." };
  }
  return {
    code: "internal",
    message: error instanceof Error ? error.message : "Generation failed."
  };
}

export interface UseGenerateCodeResult {
  generate: (request: codeGen.CodeGenRequest) => void;
  /** Abort the in-flight request; the server-side generation stops with it. */
  cancel: () => void;
  reset: () => void;
  result: CodeGenResult | undefined;
  isPending: boolean;
}

/**
 * Run one code generation. The mutation never rejects — every outcome arrives
 * as a `CodeGenResult`, so callers branch on `status` instead of juggling
 * `error` and `data`.
 */
export function useGenerateCode(): UseGenerateCodeResult {
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationKey: codeGenMutationKey,
    mutationFn: async (
      request: codeGen.CodeGenRequest
    ): Promise<CodeGenResult> => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        return await trpcClient.codeGen.generate.mutate(request, {
          signal: controller.signal
        });
      } catch (error) {
        return { status: "error", error: toCodeGenFailure(error) };
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    }
  });

  const { mutate, reset: resetMutation } = mutation;

  const generate = useCallback(
    (request: codeGen.CodeGenRequest) => {
      mutate(request);
    },
    [mutate]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    resetMutation();
  }, [cancel, resetMutation]);

  return {
    generate,
    cancel,
    reset,
    result: mutation.data,
    isPending: mutation.isPending
  };
}
