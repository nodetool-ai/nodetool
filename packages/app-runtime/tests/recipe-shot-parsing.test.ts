import { describe, expect, it } from "vitest";
import { inspectRecipeManifest } from "../src/document.js";

const element = (over: Record<string, unknown> = {}) => ({ id: "e1", inputId: "quote", kind: "text", role: "headline", ...over });
const shot = (over: Record<string, unknown> = {}) => ({ id: "s1", title: "Shot", durationSeconds: 2, elements: [element()], ...over });
const recipe = (shots: unknown, strategy: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  slug: "quote",
  inputs: [{ id: "quote", label: "Quote", kind: "text", required: true }],
  operations: [],
  outputs: [],
  creativeStrategy: { shots, ...strategy }
});
const status = (shots: unknown, strategy?: Record<string, unknown>) => inspectRecipeManifest(recipe(shots, strategy)).status;

describe("Recipe shot parsing", () => {
  it("keeps a valid shot with optional fields and review rules", () => {
    const result = inspectRecipeManifest(recipe([shot({ reviewRules: ["Legible"], elements: [element({ direction: "Centered" })] })]));
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.manifest.creativeStrategy?.shots).toEqual([
      { id: "s1", title: "Shot", durationSeconds: 2, reviewRules: ["Legible"], elements: [{ id: "e1", inputId: "quote", kind: "text", role: "headline", direction: "Centered" }] }
    ]);
  });

  it("omits empty review rules", () => {
    const result = inspectRecipeManifest(recipe([shot({ reviewRules: [] })]));
    expect(result.status === "valid" && "reviewRules" in result.manifest.creativeStrategy!.shots![0]).toBe(false);
  });

  it("accepts a template-owned styled shape with no input and drops inputId", () => {
    const owned = { id: "bg", kind: "shape", role: "decorative", style: { fill: "#000000" } };
    const result = inspectRecipeManifest(recipe([shot({ elements: [owned] })]));
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.manifest.creativeStrategy?.shots?.[0].elements[0]).toMatchObject({ id: "bg", kind: "shape" });
    expect(result.manifest.creativeStrategy?.shots?.[0].elements[0]).not.toHaveProperty("inputId");
  });

  it.each([
    ["empty shots", []],
    ["non-array shots", {}],
    ["non-record shot", [null]],
    ["empty shot id", [shot({ id: "" })]],
    ["missing title", [shot({ title: undefined })]],
    ["non-numeric duration", [shot({ durationSeconds: "2" })]],
    ["zero duration", [shot({ durationSeconds: 0 })]],
    ["infinite duration", [shot({ durationSeconds: Infinity })]],
    ["non-array elements", [shot({ elements: "x" })]],
    ["non-record element", [shot({ elements: [1] })]],
    ["element without id", [shot({ elements: [element({ id: "" })] })]],
    ["element with unknown input", [shot({ elements: [element({ inputId: "nope" })] })]],
    ["element without input and not an owned shape", [shot({ elements: [element({ inputId: undefined })] })]],
    ["shape without style", [shot({ elements: [{ id: "bg", kind: "shape", role: "decorative" }] })]],
    ["unknown kind", [shot({ elements: [element({ kind: "video" })] })]],
    ["unknown role", [shot({ elements: [element({ role: "hero" })] })]],
    ["non-string direction", [shot({ elements: [element({ direction: 3 })] })]],
    ["duplicate element ids", [shot({ elements: [element(), element()] })]],
    ["duplicate shot ids", [shot(), shot()]],
    ["invalid shot review rules", [shot({ reviewRules: [""] })]]
  ])("rejects %s", (_name, shots) => {
    expect(status(shots)).toBe("malformed");
  });

  it("rejects invalid strategy review rules and aspect ratio", () => {
    expect(status([shot()], { reviewRules: [1] })).toBe("malformed");
    expect(status([shot()], { aspectRatio: "3:2" })).toBe("malformed");
    expect(status([shot()], { aspectRatio: "4:5" })).toBe("valid");
  });
});
