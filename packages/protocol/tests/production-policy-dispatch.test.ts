import { describe, expect, it } from "vitest";
import {
  assertProductionGenerationAllowed,
  productionRequirement,
  resolveEffectiveProductionRequirement
} from "../src/production-authoring.js";

describe("effective production protection", () => {
  const policy = productionRequirement.parse({
    protected_inputs: [
      {
        id: "price",
        kind: "exact_text",
        value: "  €29  ",
        allowed_transformations: ["position", "scale"]
      }
    ]
  });
  it("preserves exact whitespace and inherited protections", () => {
    const resolved = resolveEffectiveProductionRequirement(
      policy,
      productionRequirement.parse({ media_strategy: "still_motion_graphics" })
    );
    expect(resolved?.protected_inputs?.[0].value).toBe("  €29  ");
    expect(resolved?.media_strategy).toBe("still_motion_graphics");
  });
  it("rejects conflicting source truth and cannot widen transforms", () => {
    expect(() =>
      resolveEffectiveProductionRequirement(
        policy,
        productionRequirement.parse({
          protected_inputs: [{ id: "price", kind: "exact_text", value: "€29" }]
        })
      )
    ).toThrow("conflicts");
    const narrowed = resolveEffectiveProductionRequirement(
      policy,
      productionRequirement.parse({
        protected_inputs: [
          {
            ...policy.protected_inputs![0],
            allowed_transformations: ["position", "rotate"]
          }
        ]
      })
    );
    expect(narrowed?.protected_inputs?.[0].allowed_transformations).toEqual([
      "position"
    ]);
  });
  it("fails closed on video and unproven protected generation while retaining legacy routes", () => {
    expect(() =>
      assertProductionGenerationAllowed(
        productionRequirement.parse({
          media_strategy: "still_motion_graphics"
        }),
        "image_to_video"
      )
    ).toThrow("forbids video");
    for (const capability of [
      "image_to_image",
      "video_to_video",
      "text_to_image"
    ] as const) {
      expect(() =>
        assertProductionGenerationAllowed(policy, capability)
      ).toThrow("protected source fidelity");
    }
    expect(() =>
      assertProductionGenerationAllowed(undefined, "image_to_video")
    ).not.toThrow();
    expect(() =>
      assertProductionGenerationAllowed(
        productionRequirement.parse({ media_strategy: "generated_video" }),
        "text_to_video"
      )
    ).not.toThrow();
  });
});
