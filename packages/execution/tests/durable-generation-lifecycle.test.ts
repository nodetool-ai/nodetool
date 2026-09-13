import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GenerationAttempt,
  GenerationOutput,
  Prediction,
  initTestDb
} from "@nodetool-ai/models";
import {
  ProcessingContext,
  GenerationAlreadyAcceptedError
} from "@nodetool-ai/runtime";
import {
  createDurableGenerationLifecycle,
  createFalGenerationLifecycleHooks
} from "../src/generation-lifecycle.js";

describe("DurableGenerationLifecycle", () => {
  beforeEach(() => initTestDb({ strictProjects: true }));

  it("returns one accepted generation and fences competing workers", async () => {
    const lifecycle = createDurableGenerationLifecycle();
    const input = {
      user_id: "u1",
      provider: "fal_ai",
      model: "flux",
      idempotency_key: "same-request",
      input_fingerprint: "fingerprint"
    };
    const first = await lifecycle.accept(input);
    const second = await lifecycle.accept(input);
    expect(second.created).toBe(false);
    expect(second.generation.id).toBe(first.generation.id);
    const claimed = await lifecycle.claim(first.generation.id, "worker-a", {
      now: "2026-09-13T10:00:00.000Z",
      expiresAt: "2026-09-13T10:01:00.000Z"
    });
    expect(claimed?.lease_version).toBe(1);
    expect(
      await lifecycle.claim(first.generation.id, "worker-b", {
        now: "2026-09-13T10:00:30.000Z",
        expiresAt: "2026-09-13T10:01:30.000Z"
      })
    ).toBeNull();
  });

  it("accepts FAL before the call and reuses the accepted id without a second call", async () => {
    const lifecycle = createFalGenerationLifecycleHooks({
      userId: "u1",
      callbacks: false
    });
    const context = new ProcessingContext({
      jobId: "job-fal",
      userId: "u1",
      generationLifecycle: lifecycle
    });
    const events: string[] = [];
    const request = {
      provider: "fal_ai",
      capability: "text_to_image" as const,
      model: "fal-ai/flux/dev",
      origin: { request_id: "client-request-1" },
      params: { prompt: "a lighthouse" }
    };
    const first = await context.runGenerationWith(
      request,
      async () => {
        events.push("paid-post");
        return new Uint8Array([1]);
      },
      { withoutProvider: true }
    );
    expect(events).toEqual(["paid-post"]);

    await expect(
      context.runGenerationWith(
        { ...request, id: "different-local-id" },
        async () => {
          events.push("paid-post-again");
          return new Uint8Array([2]);
        },
        { withoutProvider: true }
      )
    ).rejects.toMatchObject({
      name: "GenerationAlreadyAcceptedError",
      generationId: first.id
    } satisfies Partial<GenerationAlreadyAcceptedError>);
    expect(events).toEqual(["paid-post"]);
  });

  it("uses decoder identities, fences output saves, and schedules raw-output recovery", async () => {
    const lifecycle = createDurableGenerationLifecycle();
    vi.spyOn(lifecycle, "claim").mockResolvedValue({
      lease_version: 3
    } as Prediction);
    vi.spyOn(lifecycle, "claimAttempt").mockResolvedValue({
      lease_version: 4
    } as GenerationAttempt);
    vi.spyOn(lifecycle, "renew").mockResolvedValue(true);
    vi.spyOn(lifecycle, "renewAttempt").mockResolvedValue(true);
    const transitionAttempt = vi
      .spyOn(lifecycle, "transitionAttempt")
      .mockResolvedValue({} as GenerationAttempt);
    const transitionGeneration = vi
      .spyOn(lifecycle, "transition")
      .mockResolvedValue({} as Prediction);
    const saveOutput = vi
      .spyOn(lifecycle, "saveOutput")
      .mockResolvedValue({} as GenerationOutput);
    vi.spyOn(GenerationOutput, "upsertOutput").mockResolvedValue(
      new GenerationOutput({ id: "output-1" })
    );

    const hooks = createFalGenerationLifecycleHooks({
      userId: "u1",
      callbacks: false,
      lifecycle
    });
    await hooks.onGenerationAccepted?.({
      generationId: "live-recovery-generation",
      request: {
        provider: "fal_ai",
        capability: "text_to_image",
        model: "fal-ai/flux/dev",
        params: { prompt: "a lighthouse" }
      }
    });
    await hooks.onGenerationTerminal?.({
      generationId: "live-recovery-generation",
      request: {
        provider: "fal_ai",
        capability: "text_to_image",
        model: "fal-ai/flux/dev",
        params: { prompt: "a lighthouse" }
      },
      status: "completed",
      output: { images: [{ url: "https://fal.example/image.png" }], seed: 7 },
      receipt: null,
      assetIds: []
    });

    expect(GenerationOutput.upsertOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output_key: "images",
        output_index: 0,
        output_type: "media",
        provider_ref: "https://fal.example/image.png"
      })
    );
    expect(saveOutput).toHaveBeenCalledWith(
      "output-1",
      expect.objectContaining({ status: "retrying" }),
      {
        attemptId: expect.any(String),
        workerId: expect.any(String),
        leaseVersion: 4
      }
    );
    expect(transitionAttempt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      4,
      expect.objectContaining({
        provider_status: "succeeded",
        next_check_at: expect.any(String),
        raw_result_ref: expect.any(String)
      })
    );
    expect(transitionGeneration).toHaveBeenLastCalledWith(
      "live-recovery-generation",
      expect.any(String),
      3,
      expect.objectContaining({
        status: "recovering",
        output_status: "retrying",
        next_check_at: expect.any(String)
      })
    );
  });

  it("preserves media positions when only a later live asset save succeeds", async () => {
    const lifecycle = createDurableGenerationLifecycle();
    vi.spyOn(lifecycle, "claim").mockResolvedValue({
      lease_version: 3
    } as Prediction);
    vi.spyOn(lifecycle, "claimAttempt").mockResolvedValue({
      lease_version: 4
    } as GenerationAttempt);
    vi.spyOn(lifecycle, "renew").mockResolvedValue(true);
    vi.spyOn(lifecycle, "renewAttempt").mockResolvedValue(true);
    vi.spyOn(lifecycle, "transitionAttempt").mockResolvedValue(
      {} as GenerationAttempt
    );
    vi.spyOn(lifecycle, "transition").mockResolvedValue({} as Prediction);
    const saveOutput = vi
      .spyOn(lifecycle, "saveOutput")
      .mockResolvedValue({} as GenerationOutput);
    vi.spyOn(GenerationOutput, "upsertOutput").mockImplementation(
      async (input) =>
        new GenerationOutput({
          id: `output-${input.output_index}`
        })
    );
    const hooks = createFalGenerationLifecycleHooks({
      userId: "u1",
      callbacks: false,
      lifecycle
    });
    const request = {
      provider: "fal_ai",
      capability: "text_to_image",
      model: "fal-ai/flux/dev",
      params: {}
    } as const;
    await hooks.onGenerationAccepted?.({
      generationId: "partial-assets-generation",
      request
    });
    await hooks.onGenerationTerminal?.({
      generationId: "partial-assets-generation",
      request,
      status: "completed",
      output: {
        images: [
          { url: "https://fal.example/first.png" },
          { url: "https://fal.example/second.png" }
        ]
      },
      receipt: null,
      assetIds: [null, "asset-second"]
    });

    expect(saveOutput).toHaveBeenCalledWith(
      "output-0",
      expect.objectContaining({ status: "retrying", asset_id: null }),
      expect.any(Object)
    );
    expect(saveOutput).toHaveBeenCalledWith(
      "output-1",
      expect.objectContaining({ status: "ready", asset_id: "asset-second" }),
      expect.any(Object)
    );
  });

  it("renews both live leases and stops the heartbeat after terminal finalization", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = createDurableGenerationLifecycle();
      vi.spyOn(lifecycle, "claim").mockResolvedValue({
        lease_version: 1
      } as Prediction);
      vi.spyOn(lifecycle, "claimAttempt").mockResolvedValue({
        lease_version: 1
      } as GenerationAttempt);
      const renew = vi.spyOn(lifecycle, "renew").mockResolvedValue(true);
      const renewAttempt = vi
        .spyOn(lifecycle, "renewAttempt")
        .mockResolvedValue(true);
      vi.spyOn(lifecycle, "transitionAttempt").mockResolvedValue(
        {} as GenerationAttempt
      );
      vi.spyOn(lifecycle, "transition").mockResolvedValue({} as Prediction);
      vi.spyOn(lifecycle, "saveOutput").mockResolvedValue(
        {} as GenerationOutput
      );
      vi.spyOn(GenerationOutput, "upsertOutput").mockResolvedValue(
        new GenerationOutput({ id: "output-1" })
      );
      const hooks = createFalGenerationLifecycleHooks({
        userId: "u1",
        callbacks: false,
        lifecycle
      });
      await hooks.onGenerationAccepted?.({
        generationId: "live-heartbeat-generation",
        request: {
          provider: "fal_ai",
          capability: "text_to_image",
          model: "fal-ai/flux/dev",
          params: {}
        }
      });
      await vi.advanceTimersByTimeAsync(40_000);
      expect(renew).toHaveBeenCalled();
      expect(renewAttempt).toHaveBeenCalled();
      await hooks.onGenerationTerminal?.({
        generationId: "live-heartbeat-generation",
        request: {
          provider: "fal_ai",
          capability: "text_to_image",
          model: "fal-ai/flux/dev",
          params: {}
        },
        status: "completed",
        output: { images: [{ url: "https://fal.example/image.png" }] },
        receipt: null,
        assetIds: ["asset-1"]
      });
      const renewCount = renew.mock.calls.length;
      await vi.advanceTimersByTimeAsync(40_000);
      expect(renew).toHaveBeenCalledTimes(renewCount);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the heartbeat and schedules recovery after a transport failure", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = createDurableGenerationLifecycle();
      vi.spyOn(lifecycle, "claim").mockResolvedValue({
        lease_version: 1
      } as Prediction);
      vi.spyOn(lifecycle, "claimAttempt").mockResolvedValue({
        lease_version: 1
      } as GenerationAttempt);
      const renew = vi.spyOn(lifecycle, "renew").mockResolvedValue(true);
      vi.spyOn(lifecycle, "renewAttempt").mockResolvedValue(true);
      const transition = vi
        .spyOn(lifecycle, "transition")
        .mockResolvedValue({} as Prediction);
      const transitionAttempt = vi
        .spyOn(lifecycle, "transitionAttempt")
        .mockResolvedValue({} as GenerationAttempt);
      const hooks = createFalGenerationLifecycleHooks({
        userId: "u1",
        callbacks: false,
        lifecycle
      });
      const request = {
        provider: "fal_ai",
        capability: "text_to_image",
        model: "fal-ai/flux/dev",
        params: {}
      } as const;
      await hooks.onGenerationAccepted?.({
        generationId: "transport-recovery-generation",
        request
      });
      await hooks.onGenerationTerminal?.({
        generationId: "transport-recovery-generation",
        request,
        status: "recovering",
        error: "poll timed out",
        receipt: null,
        assetIds: []
      });
      expect(transition).toHaveBeenLastCalledWith(
        "transport-recovery-generation",
        expect.any(String),
        1,
        expect.objectContaining({
          status: "recovering",
          next_check_at: expect.any(String)
        })
      );
      expect(transitionAttempt).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(String),
        1,
        expect.objectContaining({
          last_error: "poll timed out",
          next_check_at: expect.any(String)
        })
      );
      await vi.advanceTimersByTimeAsync(40_000);
      expect(renew).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
