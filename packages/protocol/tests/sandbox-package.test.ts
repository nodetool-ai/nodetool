import { describe, expect, it } from "vitest";
import {
  NodePackActionResultSchema,
  NodePackLedgerSchema,
  nodePackInstallStatus,
  NodePackHostManifestSchema,
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

  it("defines the shared host-pack manifest and IPC result shapes", () => {
    expect(NodePackHostManifestSchema.parse({ register: "register" }))
      .toMatchObject({ register: "register" });
    expect(NodePackActionResultSchema.parse({
      success: false,
      message: "Trust is required.",
      installation: {
        mode: "register",
        scripts: "skipped",
        active: false,
        artifact: { name: "@acme/nodes", integrity: "sha512-test" }
      }
    })).toMatchObject({ installation: { mode: "register" } });
  });

  it("records the artifact closure a trusted rebuild must re-verify", () => {
    const ledger = NodePackLedgerSchema.parse({
      version: 1,
      packs: {
        "@acme/nodes": {
          name: "@acme/nodes",
          mode: "hybrid",
          scripts: "skipped",
          active: false,
          artifact: { name: "@acme/nodes", integrity: "sha512-pack" },
          dependencies: [{ name: "helper", integrity: "sha512-helper" }]
        }
      }
    });

    const record = ledger.packs["@acme/nodes"];
    if (record === undefined) throw new Error("expected the ledger row");
    expect(nodePackInstallStatus(record)).toEqual({
      mode: "hybrid",
      scripts: "skipped",
      active: false,
      artifact: { name: "@acme/nodes", integrity: "sha512-pack" }
    });
  });
});
