import { describe, expect, it } from "vitest";
import { BaseProvider } from "../src/providers/base-provider.js";
import { recordGenerationReceipt } from "../src/generation-receipt.js";
import { ProcessingContext } from "../src/context.js";
import { inAppRunCostAccount } from "../src/run-context.js";
import { setLastUsage } from "../src/tracing-helpers.js";
import type { AppRunContext } from "../src/run-context.js";

const RUN: AppRunContext = {
  userId: "owner",
  instanceId: "i".repeat(32),
  appRunId: "a".repeat(32),
  traceId: "b".repeat(32),
  origin: "ui"
};

describe("app run context inheritance", () => {
  it("keeps identity, secrets and cancellation across children without sharing variable bags", async () => {
    const controller = new AbortController();
    const parent = new ProcessingContext({
      jobId: "parent",
      userId: "owner",
      appRunContext: RUN,
      variables: { permission: "approved" },
      secretResolver: () => "resolved-provider-secret"
    });
    parent.signal = controller.signal;
    const child = parent.copy({ jobId: "child" });
    const sibling = parent.copy();
    expect(Object.isFrozen(parent.appRunContext)).toBe(true);
    expect(child.appRunContext).toEqual(RUN);
    child.set("permission", "child-only");
    expect(parent.get("permission")).toBe("approved");
    await child.getSecret("API_KEY");
    expect([...parent.getResolvedSecretValues()]).toEqual([
      "resolved-provider-secret"
    ]);
    expect([...sibling.getResolvedSecretValues()]).toEqual([
      "resolved-provider-secret"
    ]);
    controller.abort();
    expect(child.signal.aborted).toBe(true);
  });

  it("preserves the durable acceptance hook when a child generates media", async () => {
    const accepted: string[] = [];
    const parent = new ProcessingContext({
      jobId: "parent",
      userId: "owner",
      appRunContext: RUN,
      persistOutputAssets: false,
      generationLifecycle: {
        onGenerationAccepted: async ({ generationId }) => {
          accepted.push(generationId);
        }
      }
    });
    const child = parent.copy();
    const result = await child.runGenerationWith(
      {
        id: "generation",
        provider: "custom",
        model: "fixture",
        capability: "text_to_image",
        nodeId: "node"
      },
      async () => new Uint8Array([1, 2, 3]),
      { withoutProvider: true }
    );
    expect(accepted).toEqual(["generation"]);
    expect(result.output).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("finalizes accepted legacy encoded-audio failures under the app run", async () => {
    const outcomes: Array<{ status: string; cost: number | null }> = [];
    class FailedAudioProvider extends BaseProvider {
      constructor() {
        super("fake");
      }
      async generateMessage(): Promise<never> {
        throw new Error("unused");
      }
      async *generateMessages(): AsyncGenerator<never> {
        throw new Error("unused");
      }
      override async textToSpeechEncoded(): Promise<never> {
        recordGenerationReceipt({ cost: { amount: 0.03, currency: "USD" } });
        throw new Error("Audio provider failed");
      }
    }
    const context = new ProcessingContext({
      jobId: "audio",
      userId: "owner",
      appRunContext: RUN,
      generationLifecycle: {
        onGenerationAccepted: async () => undefined,
        onGenerationTerminal: async (terminal) => {
          outcomes.push({
            status: terminal.status,
            cost: terminal.receipt?.cost?.amount ?? null
          });
        }
      }
    });
    context.registerProvider("fake", new FailedAudioProvider());
    await expect(
      context.textToSpeechEncoded({
        provider: "fake",
        model: "fixture",
        capability: "text_to_speech",
        params: { text: "hello" }
      })
    ).rejects.toThrow("Audio provider failed");
    expect(outcomes).toEqual([{ status: "failed", cost: 0.03 }]);
  });

  it("shares document references and LLM accounting with copied children", async () => {
    const parent = new ProcessingContext({
      jobId: "parent",
      userId: "owner",
      appRunContext: RUN,
      modelInterfaces: {
        createStoryboard: async () => ({ id: "storyboard" }),
        updateStoryboard: async () => ({ id: "storyboard" }),
        updateScript: async () => null
      }
    });
    const child = parent.copy();
    await child.createStoryboard({ name: "Fixture", document: {} });
    await child.updateStoryboard("storyboard", { document: {} });
    await child.updateScript("missing", { document: {} });
    expect(parent.getAppRunDocuments()).toEqual([
      { kind: "storyboard", id: "storyboard" }
    ]);
    await inAppRunCostAccount(child.appRunCostAccount, async () => {
      setLastUsage({
        inputTokens: 2,
        outputTokens: 1,
        totalTokens: 3,
        cost: 0.25
      });
    });
    expect(parent.getAppRunLlmCost()).toBe(0.25);
    await inAppRunCostAccount(child.appRunCostAccount, async () => {
      setLastUsage({ inputTokens: 2, outputTokens: 1, totalTokens: 3 });
    });
    expect(parent.getAppRunLlmCost()).toBeNull();
  });
});
