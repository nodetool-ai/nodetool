/**
 * A capability module exports its wire name verbatim — snake_case — so
 * `import { generateImage }` resolves to nothing, and QuickJS reports that as
 * "Could not find export", naming neither the module's exports nor the one the
 * caller meant. These pin the refusal that replaces it.
 *
 * No real wire name is spelled here: the registry cases derive the names they
 * assert on, so the coverage sync cannot read this file as exercising a
 * capability it only mentions.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { capabilityModuleSpecs } from "../src/capabilities/dispatcher.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  mountCapabilityModules,
  SESSION_CAPABILITY_MODULE
} from "../src/codeact/capability-modules.js";

/** `do_a_thing` → `doAThing`, the spelling a model reaches for by habit. */
function camelize(wireName: string): string {
  return wireName.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * A session graft is the one path that serves modules without a
 * `CapabilityRun`, so it exercises the check with no host to build — and its
 * export names are this test's own, not the platform's.
 */
const session = [
  {
    module: SESSION_CAPABILITY_MODULE,
    exports: ["do_a_thing", "find_a_thing"],
    call: async () => ({})
  }
];

const SESSION_SPECIFIER = `@nodetool-ai/sandbox-nodetool/${SESSION_CAPABILITY_MODULE}`;

const mount = (code: string) =>
  mountCapabilityModules(code, undefined, { session });

describe("mountCapabilityModules — imported export names", () => {
  it("serves an import that names a real export", async () => {
    const result = await mount(
      `import { do_a_thing } from "${SESSION_SPECIFIER}";`
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a camelCase spelling and names the wire form", async () => {
    const result = await mount(
      `import { doAThing } from "${SESSION_SPECIFIER}";`
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("does not export");
    expect(result.error).toContain('Did you mean "do_a_thing" for "doAThing"?');
    expect(result.error).toContain("do_a_thing, find_a_thing");
  });

  it("lists the module's exports when nothing is close", async () => {
    const result = await mount(`import { pick } from "${SESSION_SPECIFIER}";`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("Did you mean");
    expect(result.error).toContain("exports: do_a_thing, find_a_thing.");
  });

  it("reports every unknown name from one import at once", async () => {
    const result = await mount(
      `import { doAThing, pick } from "${SESSION_SPECIFIER}";`
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('"doAThing", "pick"');
  });

  it("leaves a default import alone — it names no export", async () => {
    const result = await mount(`import all from "${SESSION_SPECIFIER}";`);
    expect(result.ok).toBe(true);
  });

  it("still refuses an unknown module before checking names", async () => {
    const result = await mount(
      `import { anything } from "@nodetool-ai/sandbox-nodetool/not-a-module";`
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("is not a NodeTool capability module");
  });
});

describe("mountCapabilityModules — the registry's own modules", () => {
  const run = createCapabilityRun({
    context: { userId: "user-exports" } as unknown as ProcessingContext,
    gate: UNGATED
  });

  /** A module's first multi-word export, and the camelCase miss for it. */
  async function wireName(module: string): Promise<string> {
    const [spec] = await capabilityModuleSpecs([module]);
    const name = spec?.exports.find((exported) => exported.includes("_"));
    if (name === undefined) {
      throw new Error(`${module} declares no snake_case export to test with`);
    }
    return name;
  }

  it("serves the wire name the media module declares", async () => {
    const name = await wireName("media");
    const result = await mountCapabilityModules(
      `import { ${name} } from "@nodetool-ai/sandbox-nodetool/media";`,
      run
    );
    expect(result.ok).toBe(true);
  });

  it("refuses the camelCase miss and points back at the wire name", async () => {
    const name = await wireName("media");
    const result = await mountCapabilityModules(
      `import { ${camelize(name)} } from "@nodetool-ai/sandbox-nodetool/media";`,
      run
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      `Did you mean "${name}" for "${camelize(name)}"?`
    );
  });

  it("refuses a name no module declares and lists what models exports", async () => {
    const name = await wireName("models");
    const result = await mountCapabilityModules(
      'import { pick } from "@nodetool-ai/sandbox-nodetool/models";',
      run
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(name);
  });
});
