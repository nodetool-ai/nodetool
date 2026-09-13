import { describe, expect, it } from "vitest";
import {
  recordGenerationBindingAsync,
  recordGenerationProviderResult,
  recordGenerationReceiptAsync,
  runWithGenerationReceipt
} from "../src/generation-receipt.js";

describe("generation receipt provider binding hooks", () => {
  it("awaits acceptance and binding hooks in order", async () => {
    const events: string[] = [];
    const result = await runWithGenerationReceipt(
      async () => {
        await recordGenerationReceiptAsync(
          { provider_request_id: "req-1" },
          { phase: "submit" }
        );
        events.push("provider-after-submit");
        await recordGenerationBindingAsync({ phase: "bind" });
        events.push("provider-after-bind");
        return "ok";
      },
      {
        onProviderRequestAccepted: async (submission) => {
          expect(submission).toEqual({ phase: "submit" });
          await Promise.resolve();
          events.push("host-accepted");
        },
        onProviderRequestBound: async (binding) => {
          expect(binding).toEqual({ phase: "bind" });
          await Promise.resolve();
          events.push("host-bound");
        }
      }
    );

    expect(result.value).toBe("ok");
    expect(result.receipt).toEqual({ provider_request_id: "req-1" });
    expect(events).toEqual([
      "host-accepted",
      "provider-after-submit",
      "host-bound",
      "provider-after-bind"
    ]);
  });

  it("retains the provider result separately from the caller-facing value", async () => {
    const result = await runWithGenerationReceipt(async () => {
      recordGenerationProviderResult({
        images: [{ url: "https://fal.example/image.png" }]
      });
      return new Uint8Array([1, 2, 3]);
    });

    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.providerResult).toEqual({
      images: [{ url: "https://fal.example/image.png" }]
    });
  });
});
