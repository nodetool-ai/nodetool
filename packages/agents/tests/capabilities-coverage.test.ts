/**
 * Coverage drift: the belt a host assembles must be capabilities, not classes.
 *
 * The tool-class retirement moved every namespace onto the capability registry
 * (`src/capabilities/`). What keeps it moved is this walk. It builds the full
 * inventory the hosts assemble — `getBuiltinTools()` plus `getAllMcpTools({})`
 * — and asserts each name resolves through `findCapability`, unless it sits in
 * the pinned exception list below with a reason a reviewer can read.
 *
 * The reverse direction is asserted too: where a deprecated `Tool` subclass
 * still stands in front of a capability, its wire identity and description
 * must be the capability's, or the two have drifted and a caller sees a
 * description the registry does not have.
 */

import { describe, expect, it } from "vitest";
import { WORKFLOW_DOCUMENT_TOOL_NAMES } from "@nodetool-ai/node-sdk";
import { getBuiltinTools } from "../src/tools/builtin-tools.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";
import { findCapability } from "../src/capabilities/registry.js";
import type { Tool } from "../src/tools/base-tool.js";

const REGISTER_A_CAPABILITY =
  "new tools are capabilities — register a module export, do not add a bare " +
  "Tool subclass";

/**
 * Names in the assembled belt that no capability module owns. Each line states
 * why. Anything else missing is a regression, and the failure names this list.
 */
const PINNED_EXCEPTIONS: Readonly<Record<string, string>> = {
  // The eight workflow-document tools are schemas, not host functions: the MCP
  // mount routes them to a connected renderer and `WorkflowDocumentTool` falls
  // back to a direct registry write. They become the pack's `ui` module.
  ui_add_node: "workflow document schema, routed to a renderer/registry",
  ui_connect_nodes: "workflow document schema, routed to a renderer/registry",
  ui_delete_edge: "workflow document schema, routed to a renderer/registry",
  ui_delete_node: "workflow document schema, routed to a renderer/registry",
  ui_get_graph: "workflow document schema, routed to a renderer/registry",
  ui_move_node: "workflow document schema, routed to a renderer/registry",
  ui_set_node_title: "workflow document schema, routed to a renderer/registry",
  ui_update_node_data: "workflow document schema, routed to a renderer/registry"
};

function assembleBelt(): Map<string, Tool> {
  const byName = new Map<string, Tool>();
  for (const tool of [...getBuiltinTools(), ...getAllMcpTools({})]) {
    byName.set(tool.name, tool);
  }
  return byName;
}

describe("capability coverage", () => {
  it("every belt tool resolves to a capability, or is pinned", async () => {
    const belt = assembleBelt();
    const unexplained: string[] = [];
    for (const name of [...belt.keys()].sort()) {
      if (Object.hasOwn(PINNED_EXCEPTIONS, name)) continue;
      if (await findCapability(name)) continue;
      unexplained.push(name);
    }
    expect(
      unexplained,
      `${REGISTER_A_CAPABILITY}. Uncovered: ${unexplained.join(", ")}`
    ).toEqual([]);
  });

  it("the exception list is exact — nothing pinned that is now covered", async () => {
    const belt = assembleBelt();
    const stale: string[] = [];
    for (const name of Object.keys(PINNED_EXCEPTIONS)) {
      if (!belt.has(name)) {
        stale.push(`${name} is pinned but no longer in the belt`);
        continue;
      }
      if (await findCapability(name)) {
        stale.push(`${name} is pinned but a capability module now owns it`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("pins what the exceptions are: the workflow document schemas, nothing else", () => {
    const pinned = new Set(Object.keys(PINNED_EXCEPTIONS));
    const expected = new Set<string>(WORKFLOW_DOCUMENT_TOOL_NAMES);
    expect([...pinned].sort()).toEqual([...expected].sort());
  });

  it("a class in front of a capability keeps the capability's identity", async () => {
    const belt = assembleBelt();
    const drift: string[] = [];
    for (const [name, tool] of [...belt].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const capability = await findCapability(name);
      if (!capability) continue;
      if (capability.spec.name !== tool.name) {
        drift.push(`${name}: spec name is ${capability.spec.name}`);
      }
      if (capability.spec.description !== tool.description) {
        drift.push(`${name}: description differs between spec and class`);
      }
    }
    expect(drift).toEqual([]);
  });
});
