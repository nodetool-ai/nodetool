/**
 * Coverage drift: the belt a host assembles must be capabilities, not classes.
 *
 * The tool-class retirement moved every namespace onto the capability registry
 * (`src/capabilities/`). What keeps it moved is this walk. It builds the full
 * inventory the hosts assemble — `getBuiltinTools()` plus `getAllMcpTools({})`
 * — and asserts each name resolves through `findCapability`, unless it sits in
 * the pinned exception list below with a reason a reviewer can read.
 *
 * The list is empty now. The eight workflow-document `ui_*` schemas became the
 * `ui` capability module, and the nine provider-specific duplicates were
 * retired outright — the media four deleted, the search five converted to the
 * backend functions the `web_search` capability calls.
 *
 * The reverse direction is asserted too: where a deprecated `Tool` subclass
 * still stands in front of a capability, its wire identity and description
 * must be the capability's, or the two have drifted and a caller sees a
 * description the registry does not have.
 */

import { describe, expect, it } from "vitest";
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
const PINNED_EXCEPTIONS: Readonly<Record<string, string>> = {};

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

  it("pins nothing — every belt name is a capability", () => {
    expect(Object.keys(PINNED_EXCEPTIONS)).toEqual([]);
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
