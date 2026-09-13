import { describe, expect, it } from "vitest";
import { ProcessingContext } from "../src/context.js";
import { ProviderQueueTerminalError } from "../src/providers/provider-queue.js";

describe("generation acceptance ordering", () => {
  it("awaits durable acceptance before invoking a provider call", async () => {
    const events: string[] = [];
    const context = new ProcessingContext({ jobId: "job-acceptance" });
    await context.runGenerationWith(
      {
        provider: "ephemeral",
        capability: "text_to_image",
        model: "test",
        params: { prompt: "x" }
      },
      async () => {
        events.push("provider");
        return new Uint8Array([1, 2, 3]);
      },
      {
        withoutProvider: true,
        onGenerationAccepted: async () => {
          await Promise.resolve();
          events.push("accepted");
        }
      }
    );
    expect(events).toEqual(["accepted", "provider"]);
  });

  it("does not pay twice when durable acceptance returns an existing row", async () => {
    const context = new ProcessingContext({ jobId: "job-duplicate" });
    let providerCalls = 0;

    await expect(
      context.runGenerationWith(
        {
          id: "request-1",
          provider: "ephemeral",
          capability: "text_to_image",
          model: "test",
          params: { prompt: "x" }
        },
        async () => {
          providerCalls += 1;
          return new Uint8Array([1]);
        },
        {
          withoutProvider: true,
          onGenerationAccepted: () => ({
            skipProvider: true,
            existingGenerationId: "generation-existing"
          })
        }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        generationId: "generation-existing"
      })
    );

    expect(providerCalls).toBe(0);
  });

  it("only finalizes a durable failure after an authoritative provider terminal", async () => {
    const finalized: string[] = [];
    const context = new ProcessingContext({ jobId: "job-terminal" });

    await expect(
      context.runGenerationWith(
        {
          provider: "ephemeral",
          capability: "text_to_image",
          model: "test",
          params: { prompt: "x" }
        },
        async () => {
          throw new ProviderQueueTerminalError(
            "ephemeral",
            "provider-request-1",
            "failed"
          );
        },
        {
          withoutProvider: true,
          onGenerationAccepted: () => ({ durable: true }),
          onGenerationTerminal: ({ status }) => {
            finalized.push(status);
          }
        }
      )
    ).rejects.toThrow("did not succeed");

    expect(finalized).toEqual(["failed"]);
  });

  it("keeps a transport failure recoverable for a durable host", async () => {
    const finalized: string[] = [];
    const context = new ProcessingContext({ jobId: "job-transport" });

    await expect(
      context.runGenerationWith(
        {
          provider: "ephemeral",
          capability: "text_to_image",
          model: "test",
          params: { prompt: "x" }
        },
        async () => {
          throw new Error("poll timed out");
        },
        {
          withoutProvider: true,
          onGenerationAccepted: () => ({ durable: true }),
          onGenerationTerminal: ({ status }) => {
            finalized.push(status);
          }
        }
      )
    ).rejects.toThrow("poll timed out");

    expect(finalized).toEqual(["recovering"]);
  });

  it("detaches an aborted waiter without claiming provider cancellation", async () => {
    const finalized: string[] = [];
    const controller = new AbortController();
    const context = new ProcessingContext({ jobId: "job-abort" });

    await expect(
      context.runGenerationWith(
        {
          provider: "ephemeral",
          capability: "text_to_image",
          model: "test",
          params: { prompt: "x" },
          signal: controller.signal
        },
        async () => {
          controller.abort(new Error("caller detached"));
          throw controller.signal.reason;
        },
        {
          withoutProvider: true,
          onGenerationAccepted: () => ({ durable: true }),
          onGenerationTerminal: ({ status }) => {
            finalized.push(status);
          }
        }
      )
    ).rejects.toThrow("caller detached");

    expect(finalized).toEqual(["recovering"]);
    expect(
      context
        .getMessages()
        .filter((message) => message.type === "prediction")
        .at(-1)
    ).toEqual(expect.objectContaining({ status: "running" }));
  });

  it("keeps non-durable provider failures terminal when a shared hook declines them", async () => {
    const finalized: string[] = [];
    const context = new ProcessingContext({
      jobId: "job-non-durable",
      generationLifecycle: {
        onGenerationAccepted: () => undefined,
        onGenerationTerminal: ({ status }) => {
          finalized.push(status);
        }
      }
    });

    await expect(
      context.runGenerationWith(
        {
          provider: "other_provider",
          capability: "text_to_image",
          model: "test",
          params: { prompt: "x" }
        },
        async () => {
          throw new Error("ordinary provider failure");
        },
        { withoutProvider: true }
      )
    ).rejects.toThrow("ordinary provider failure");

    expect(finalized).toEqual([]);
    expect(
      context
        .getMessages()
        .filter((message) => message.type === "prediction")
        .at(-1)
    ).toEqual(expect.objectContaining({ status: "failed" }));
  });
});
