import { describe, expect, it, vi } from "vitest";
import type { GenerationLifecycleHooks } from "@nodetool-ai/runtime";
import { withGenerationAdmission } from "../src/generation-lifecycle.js";

type AcceptInput = Parameters<NonNullable<GenerationLifecycleHooks["onGenerationAccepted"]>>[0];

const input = {
  request: { provider: "nodetool", capability: "text_to_image", model: "m" }
} as unknown as AcceptInput;

describe("withGenerationAdmission", () => {
  it("admits before the wrapped hook runs", async () => {
    const order: string[] = [];
    const hooks = withGenerationAdmission(
      {
        onGenerationAccepted: async () => {
          order.push("accept");
        }
      },
      async (request) => {
        order.push(`admit:${request.provider}`);
      }
    );
    await hooks.onGenerationAccepted!(input);
    expect(order).toEqual(["admit:nodetool", "accept"]);
  });

  it("refuses the generation when admission throws", async () => {
    const accept = vi.fn();
    const hooks = withGenerationAdmission({ onGenerationAccepted: accept }, async () => {
      throw new Error("out of credits");
    });
    await expect(hooks.onGenerationAccepted!(input)).rejects.toThrow("out of credits");
    expect(accept).not.toHaveBeenCalled();
  });

  it("works with no hooks to wrap", async () => {
    const admit = vi.fn(async () => {});
    const hooks = withGenerationAdmission({}, admit);
    await expect(hooks.onGenerationAccepted!(input)).resolves.toBeUndefined();
    expect(admit).toHaveBeenCalledOnce();
  });
});
