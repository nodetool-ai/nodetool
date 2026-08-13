/**
 * Code generation router — tRPC.
 *
 * One-shot glue around `CodePlanner`: resolve the caller's provider, drain the
 * planner, return the validated submission or the typed failure. No generation
 * logic lives here — the prompt, the submit tool, the validation rounds and the
 * failure taxonomy are all in `@nodetool-ai/agents`.
 *
 * This dialog needs an atomic result with no chat thread or message-history
 * write, so it uses a tRPC mutation instead of the chat stream.
 *
 * Procedures:
 *   generate (mutation) — CodeGenResponse
 */

import { createLogger } from "@nodetool-ai/config";
import { CodePlanner } from "@nodetool-ai/agents";
import {
  getProvider,
  isProviderConfigured,
  type BaseProvider
} from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  codeGenRequest,
  codeGenResponse,
  type CodeGenError,
  type CodeGenResponse
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const log = createLogger("nodetool.websocket.trpc.code-gen");

/**
 * Concurrent generations per user. Each one holds an LLM connection for the
 * length of up to three feedback rounds, so a stuck dialog (or a retry loop in
 * the client) must not be able to occupy the provider indefinitely.
 */
const MAX_IN_FLIGHT_PER_USER = 2;

/** Hint the client shows before letting the user press Generate again. */
const RETRY_AFTER_MS = 5000;

const inFlightByUser = new Map<string, number>();

function acquireSlot(userId: string): boolean {
  const running = inFlightByUser.get(userId) ?? 0;
  if (running >= MAX_IN_FLIGHT_PER_USER) return false;
  inFlightByUser.set(userId, running + 1);
  return true;
}

function releaseSlot(userId: string): void {
  const running = inFlightByUser.get(userId) ?? 0;
  if (running <= 1) inFlightByUser.delete(userId);
  else inFlightByUser.set(userId, running - 1);
}

/** Test seam: the cap is process-wide state that survives between cases. */
export function resetCodeGenInFlight(): void {
  inFlightByUser.clear();
}

function errorResponse(error: CodeGenError): CodeGenResponse {
  return { status: "error", error };
}

/** Token/cost totals for one generation — the only usage we keep. */
interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Sum token counts off the provider's `llm_call` events and drop everything
 * else. Those events carry the full prompt and the model's reply; only the
 * counters may be logged, so the payload never leaves this closure.
 */
function captureUsage(provider: BaseProvider): UsageTotals {
  const totals: UsageTotals = { inputTokens: 0, outputTokens: 0 };
  provider.setMessageEmitter((msg) => {
    const call = msg as {
      type?: string;
      tokens_input?: number | null;
      tokens_output?: number | null;
    };
    if (call?.type !== "llm_call") return;
    totals.inputTokens += call.tokens_input ?? 0;
    totals.outputTokens += call.tokens_output ?? 0;
  });
  return totals;
}

type ProviderResolution =
  | { ok: true; provider: BaseProvider }
  | { ok: false; error: CodeGenError };

async function resolveUserProvider(
  providerId: string,
  userId: string
): Promise<ProviderResolution> {
  const getSecret = (key: string) =>
    getStoredSecret(key, userId).then((value) => value ?? undefined);
  try {
    if (!(await isProviderConfigured(providerId, getSecret))) {
      return {
        ok: false,
        error: {
          code: "provider_unavailable",
          message: `Provider "${providerId}" is not configured. Add its API key in Settings.`,
          provider: providerId
        }
      };
    }
    return { ok: true, provider: await getProvider(providerId, getSecret) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "provider_unavailable",
        message: error instanceof Error ? error.message : String(error),
        provider: providerId
      }
    };
  }
}

export const codeGenRouter = router({
  generate: protectedProcedure
    .input(codeGenRequest)
    .output(codeGenResponse)
    .mutation(async ({ ctx, input, signal }): Promise<CodeGenResponse> => {
      if (!acquireSlot(ctx.userId)) {
        return errorResponse({
          code: "rate_limited",
          message: `Another code generation is already running (limit ${MAX_IN_FLIGHT_PER_USER}). Wait for it to finish.`,
          retryAfterMs: RETRY_AFTER_MS
        });
      }

      const startedAt = Date.now();
      let response: CodeGenResponse;
      let usage: UsageTotals = { inputTokens: 0, outputTokens: 0 };
      let costUsd = 0;

      try {
        const resolved = await resolveUserProvider(input.provider, ctx.userId);
        if (!resolved.ok) {
          response = errorResponse(resolved.error);
        } else {
          const provider = resolved.provider;
          usage = captureUsage(provider);
          const planner = new CodePlanner({
            provider,
            model: input.model,
            instruction: input.instruction,
            inputs: input.inputs,
            expectedOutput: input.expectedOutput,
            currentCode: input.currentCode,
            currentInputs: input.currentInputs,
            currentOutputs: input.currentOutputs,
            sampleValues: input.sampleValues,
            signal
          });

          // Progress messages have no client on this transport: the dialog gets
          // one atomic result. Drain them so the planner runs to completion.
          const generation = planner.plan();
          let next = await generation.next();
          while (!next.done) next = await generation.next();
          response = next.value;
          costUsd = provider.getTotalCost();
        }
      } catch (error) {
        response = errorResponse({
          code: "internal",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        releaseSlot(ctx.userId);
      }

      // Usage metadata only: no instruction, no sample values, no generated code.
      log.info("code generation finished", {
        provider: input.provider,
        model: input.model,
        status: response.status,
        failureCode:
          response.status === "error" ? response.error.code : undefined,
        durationMs: Date.now() - startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd
      });

      return response;
    })
});
