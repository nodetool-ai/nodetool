/**
 * A mock provider whose *loop* is the real one.
 *
 * `generateMessages` replays a scripted turn, but `generateLoop` delegates to
 * `BaseProvider.prototype.generateLoop`, so everything the loop owns is
 * genuinely exercised: tool-call rounds, the terminal chunk, and — what the
 * budget work needs — the reserve-before-a-turn / commit-after admission.
 *
 * `costPerTurn` is what makes a budget assertion mean something. The loop
 * reconciles a reservation against `getTotalCost()`'s delta, so a provider that
 * never moves that number books every turn as free and no USD cap ever binds.
 *
 * Three test files carried a copy of this each; this is the one they share.
 */

import { vi } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";

export type MockStreamItem =
  | { type: "chunk"; content: string; done?: boolean }
  | { id: string; name: string; args: Record<string, unknown> };

export interface LoopingMockProviderOptions {
  /** Provider id. Pricing is looked up against it, so "openai" prices. */
  provider?: string;
  /** USD the provider reports as billed for every turn it completes. */
  costPerTurn?: number;
  /**
   * Replay the last scripted turn once the script runs out, instead of
   * answering with nothing. For a fan-out where every child runs one turn.
   */
  repeatLast?: boolean;
  /** Awaited before a turn produces anything — holds a loop open. */
  gate?: (call: number) => Promise<void> | void;
  /** Notified as a turn's stream opens and as it closes. */
  onTurnStart?: (call: number) => void;
  onTurnEnd?: (call: number) => void;
}

/** Turns actually made, for a test that counts them. */
export interface LoopingMockProvider extends BaseProvider {
  readonly turnsStarted: number;
}

export function createLoopingMockProvider(
  responseSequence: MockStreamItem[][],
  options: LoopingMockProviderOptions = {}
): LoopingMockProvider {
  const costPerTurn = options.costPerTurn ?? 0;
  let callIndex = 0;
  let totalCost = 0;
  let turnsStarted = 0;

  return {
    provider: options.provider ?? "mock",
    hasToolSupport: async () => true,
    getTotalCost: () => totalCost,
    get turnsStarted() {
      return turnsStarted;
    },
    generateMessages: async function* () {
      const call = callIndex++;
      turnsStarted++;
      options.onTurnStart?.(call);
      try {
        await options.gate?.(call);
        const items =
          responseSequence[call] ??
          (options.repeatLast
            ? responseSequence[responseSequence.length - 1]
            : undefined) ??
          [];
        for (const item of items) {
          yield item;
        }
        totalCost += costPerTurn;
      } finally {
        options.onTurnEnd?.(call);
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
    },
    // The loop's admission point. Borrowed from the base class for the same
    // reason `generateLoop` is: a hand-written stand-in would estimate prompt
    // tokens differently and the reservation under test would not be the one
    // production makes.
    _admitTurn(...args: any[]) {
      return (BaseProvider.prototype as any)._admitTurn.apply(this, args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}
