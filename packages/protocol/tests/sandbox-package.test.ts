import { describe, expect, it } from "vitest";
import {
  ResolvedSandboxModuleSchema,
  SandboxModuleResolutionSchema
} from "../src/index.js";

describe("sandbox module resolution protocol", () => {
  it("serializes a resolved JavaScript module and its dependency graph", () => {
    const module = ResolvedSandboxModuleSchema.parse({
      specifier: "@acme/geo/extra",
      packName: "@acme/geo",
      packVersion: "1.2.3",
      contentDigest: "a".repeat(64),
      moduleId: "geo-extra",
      kind: "js",
      source: "export const area = 1;",
      graph: [
        {
          id: "extra.js",
          kind: "js",
          source: "export const area = 1;",
          dependencies: ["math.js"],
          internal: false
        },
        {
          id: "math.js",
          kind: "js",
          source: "export const pi = 3.14;",
          dependencies: [],
          internal: true
        }
      ]
    });

    expect(module).toMatchObject({
      specifier: "@acme/geo/extra",
      moduleId: "geo-extra",
      kind: "js"
    });
  });

  it("keeps resolved modules and resolution statuses in one serializable result", () => {
    const result = SandboxModuleResolutionSchema.parse({
      modules: [],
      statuses: [
        {
          packName: "@acme/geo",
          status: "warning",
          code: "version-mismatch",
          message: "The installed version differs from the workflow declaration."
        }
      ]
    });

    expect(result.statuses[0]).toMatchObject({ code: "version-mismatch" });
  });
});
