/**
 * The platform's guest surface: specifier shape, the private bridge, and the
 * facade every host mounts.
 */

import { describe, expect, it } from "vitest";

import {
  generateSandboxCapabilityFacade,
  SANDBOX_CAPABILITY_BRIDGE_SOURCE,
  SANDBOX_CAPABILITY_BRIDGE_SPECIFIER,
  SANDBOX_CAPABILITY_DISPATCH_GLOBAL,
  SANDBOX_CAPABILITY_PACK,
  sandboxCapabilityModuleName,
  sandboxCapabilitySpecifier
} from "../src/index.js";

describe("capability specifiers", () => {
  it("round-trips a registry module through its specifier", () => {
    const specifier = sandboxCapabilitySpecifier("workflows");
    expect(specifier).toBe(`${SANDBOX_CAPABILITY_PACK}/workflows`);
    expect(sandboxCapabilityModuleName(specifier)).toBe("workflows");
  });

  it("claims nothing outside the pack, and no deeper path inside it", () => {
    expect(sandboxCapabilityModuleName("@nodetool-ai/sandbox-csv")).toBeUndefined();
    expect(sandboxCapabilityModuleName(SANDBOX_CAPABILITY_PACK)).toBeUndefined();
    expect(
      sandboxCapabilityModuleName(`${SANDBOX_CAPABILITY_PACK}/workflows/inner`)
    ).toBeUndefined();
  });
});

describe("the capability bridge module", () => {
  it("reads the dispatch global once and refuses a run without one", () => {
    expect(SANDBOX_CAPABILITY_BRIDGE_SOURCE).toContain(
      `globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL}`
    );
    expect(SANDBOX_CAPABILITY_BRIDGE_SOURCE).toContain(
      "the sandbox capability bridge is unavailable in this run"
    );
  });
});

describe("generateSandboxCapabilityFacade", () => {
  const facade = generateSandboxCapabilityFacade(
    sandboxCapabilitySpecifier("workflows"),
    ["list_workflows", "run_workflow"]
  );

  it("imports the private bridge and nothing else", () => {
    expect(facade).toContain(
      `import { __call } from ${JSON.stringify(SANDBOX_CAPABILITY_BRIDGE_SPECIFIER)};`
    );
    expect(facade.match(/^import /gm)).toHaveLength(1);
  });

  it("exports one async function per wire name, plus the namespace default", () => {
    expect(facade).toContain("export async function list_workflows(...args)");
    expect(facade).toContain("export async function run_workflow(...args)");
    expect(facade).toContain("export default { list_workflows, run_workflow };");
  });

  it("pins the module key in every call, so a facade can name only itself", () => {
    expect(facade).toContain(
      `__call("@nodetool-ai/sandbox-nodetool/workflows", "list_workflows", args.length === 0 ? [{}] : args)`
    );
  });

  it("exposes no export the caller did not list", () => {
    expect(facade).not.toContain("get_workflow");
  });

  it("refuses a name the guest could not bind", () => {
    expect(() =>
      generateSandboxCapabilityFacade("m", ["not-an-identifier"])
    ).toThrow(/not a valid JavaScript identifier/);
  });
});
