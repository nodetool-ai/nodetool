/**
 * One source of truth for a capability's permission category.
 *
 * `run.invoke` gates on the spec's `category`; `gateTools` wraps a `Tool`
 * through `capabilityFromTool`, which used to classify by name from
 * `TOOL_PERMISSION_CATEGORIES` alone — so a capability absent from the map
 * was `read` through one door and `external` through the other. The adapter
 * now reads the spec first; the map is only for a `Tool` that is not a
 * capability. This file pins both halves: the adapter's lookup order, and
 * that the map never contradicts a spec or names something nothing owns.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "../src/tools/base-tool.js";
import {
  TOOL_PERMISSION_CATEGORIES,
  permissionCategoryFor
} from "../src/tools/tool-permissions.js";
import { capabilityFromTool } from "../src/capabilities/adapters.js";
import {
  capabilitySpec,
  listCapabilitySpecs
} from "../src/capabilities/registry.js";

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

/**
 * Every wire name a `Tool` subclass declares under `packages/*\/src`, read
 * from the source: `readonly name = "x"` and its `override` forms. A class
 * whose name is computed is not a hand-classified tool and does not belong in
 * the map anyway.
 */
function toolClassNames(): Set<string> {
  const names = new Set<string>();
  const pattern = /^\s+(?:override\s+)?(?:readonly\s+)?name(?::\s*string)?\s*=\s*"([a-z0-9_]+)"/gm;
  for (const entry of readdirSync(packagesDir)) {
    const src = join(packagesDir, entry, "src");
    let isDir = false;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      // A package with no `src` has no tool classes.
    }
    if (!isDir) continue;
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(pattern)) names.add(match[1]);
    }
  }
  return names;
}

class NamedTool extends Tool {
  readonly description = "canary";
  constructor(readonly name: string) {
    super();
  }
  async process(): Promise<unknown> {
    return { ok: true };
  }
}

describe("TOOL_PERMISSION_CATEGORIES against the capability registry", () => {
  const specs = listCapabilitySpecs();
  const tools = toolClassNames();

  it("walked something", () => {
    expect(specs.length).toBeGreaterThan(100);
    expect(tools.has("run_subtask")).toBe(true);
    expect(tools.has("finish_step")).toBe(true);
  });

  it("never contradicts a registered spec", () => {
    const disagreements = specs
      .filter(
        (spec) =>
          spec.name in TOOL_PERMISSION_CATEGORIES &&
          TOOL_PERMISSION_CATEGORIES[spec.name] !== spec.category
      )
      .map(
        (spec) =>
          `${spec.name}: spec=${spec.category} map=${TOOL_PERMISSION_CATEGORIES[spec.name]}`
      );
    expect(disagreements).toEqual([]);
  });

  it("names only a registered spec or a surviving Tool class", () => {
    const orphans = Object.keys(TOOL_PERMISSION_CATEGORIES).filter(
      (name) => capabilitySpec(name) === undefined && !tools.has(name)
    );
    expect(orphans).toEqual([]);
  });
});

describe("capabilityFromTool's category", () => {
  it("is the spec's for a capability name the map does not list", () => {
    // Absent from the map, so the map alone would answer `external`.
    const name = "list_generations";
    expect(name in TOOL_PERMISSION_CATEGORIES).toBe(false);
    expect(capabilitySpec(name)?.category).toBe("read");
    expect(capabilityFromTool(new NamedTool(name)).spec.category).toBe("read");
  });

  it("agrees with run.invoke for every registered spec", () => {
    for (const spec of listCapabilitySpecs()) {
      expect(
        capabilityFromTool(new NamedTool(spec.name)).spec.category,
        spec.name
      ).toBe(spec.category);
    }
  });

  it("falls back to the map for a Tool that is not a capability", () => {
    expect(capabilitySpec("finish_step")).toBeUndefined();
    expect(capabilityFromTool(new NamedTool("finish_step")).spec.category).toBe(
      permissionCategoryFor("finish_step")
    );
  });

  it("classes an unknown name external", () => {
    expect(
      capabilityFromTool(new NamedTool("no_such_tool_anywhere")).spec.category
    ).toBe("external");
  });
});

// Keep the type import used so the file compiles under isolatedModules.
void ({} as ProcessingContext);
