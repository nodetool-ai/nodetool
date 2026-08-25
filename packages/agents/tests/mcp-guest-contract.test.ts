import { describe, it, expect } from "vitest";
import {
  MCP_GUEST_CONTRACT,
  MCP_SANDBOX_ACTION_SNIPPET,
  MCP_SANDBOX_ASSET_SNIPPET,
  MCP_SANDBOX_PROBE_SNIPPET,
  MCP_SANDBOX_RESOURCE_URI,
  MCP_SANDBOX_PROMPTS,
  buildMcpSandboxCatalog
} from "../src/codeact/mcp-guest-contract.js";
import { chatUnavailableBridges } from "../src/codeact/prompt.js";
import { CODEACT_INJECTED_GLOBALS } from "../src/codeact/tool-api.js";
import { getSandboxManifest } from "../src/code-gen/sandbox-manifest.js";
import { unknownApiReferences } from "../src/code-gen/sandbox-prompt.js";

/**
 * Locals the snippets bind. extractApiReferences treats `listed.workflows`
 * as an API named `listed`; they are not guest globals.
 */
const SNIPPET_LOCALS = new Set(["listed", "model", "row", "asset", "hits", "h"]);

function undocumented(text: string): string[] {
  const known = new Set<string>([...CODEACT_INJECTED_GLOBALS, ...SNIPPET_LOCALS]);
  return unknownApiReferences(text).filter((name) => !known.has(name));
}

describe("MCP guest contract", () => {
  it("leads with the guest rules an MCP agent needs first", () => {
    expect(MCP_GUEST_CONTRACT.startsWith("# Guest JavaScript (not Node)")).toBe(
      true
    );
    expect(MCP_GUEST_CONTRACT).toContain("QuickJS");
    expect(MCP_GUEST_CONTRACT).toContain("nodetool.searchTools");
    expect(MCP_GUEST_CONTRACT).toContain("there is no `finish()`");
    expect(MCP_GUEST_CONTRACT).toContain(
      "Record anything a later action needs with `nodetool.memory.save`"
    );
    expect(MCP_GUEST_CONTRACT).toContain(MCP_SANDBOX_RESOURCE_URI);
    expect(MCP_GUEST_CONTRACT).toContain(MCP_SANDBOX_ACTION_SNIPPET);
  });

  it("names no API the sandbox lacks", () => {
    expect(undocumented(MCP_GUEST_CONTRACT)).toEqual([]);
    expect(undocumented(MCP_SANDBOX_ACTION_SNIPPET)).toEqual([]);
    expect(undocumented(MCP_SANDBOX_ASSET_SNIPPET)).toEqual([]);
    expect(undocumented(MCP_SANDBOX_PROBE_SNIPPET)).toEqual([]);
  });

  it("builds the sandbox catalog from the live manifest", () => {
    const manifest = getSandboxManifest();
    const catalog = buildMcpSandboxCatalog();
    expect(catalog.server).toBe("nodetool");
    expect(catalog.runtime).toBe(manifest.runtime);
    expect(catalog.resource).toBe(MCP_SANDBOX_RESOURCE_URI);
    expect(catalog.contract).toBe(MCP_GUEST_CONTRACT);
    expect(catalog.blocked_globals).toEqual(manifest.blockedGlobals);
    expect(catalog.unavailable_bridges).toEqual(chatUnavailableBridges(manifest));
    expect(catalog.unavailable_bridges).toEqual(
      expect.arrayContaining(["fetch", "workspace", "media", "getSecret"])
    );
    expect(catalog.available_bridges.map((b) => b.name)).not.toContain(
      "workspace"
    );
    expect(catalog.packages).toEqual([]);
    expect(catalog.examples.action).toBe(MCP_SANDBOX_ACTION_SNIPPET);
    expect(catalog.examples.asset).toBe(MCP_SANDBOX_ASSET_SNIPPET);
    expect(catalog.examples.probe).toBe(MCP_SANDBOX_PROBE_SNIPPET);
  });

  it("records the two MCP prompts against the same snippets", () => {
    expect(MCP_SANDBOX_PROMPTS.map((p) => p.name)).toEqual([
      "sandbox-action",
      "sandbox-asset"
    ]);
    expect(MCP_SANDBOX_PROMPTS[0].snippet).toBe(MCP_SANDBOX_ACTION_SNIPPET);
    expect(MCP_SANDBOX_PROMPTS[1].snippet).toBe(MCP_SANDBOX_ASSET_SNIPPET);
  });
});
