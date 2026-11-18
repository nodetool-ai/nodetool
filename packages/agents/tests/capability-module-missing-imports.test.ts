/**
 * Each code action is a fresh guest, so a capability imported in one action is
 * gone in the next. A model that calls it again without the import got
 * QuickJS's bare "ReferenceError: <name> is not defined", which never says the
 * name needs an import or where it lives. And a model that imported a real
 * capability from the wrong module was shown that module's exports, never the
 * module that owns the name. These pin the refusals that replace both.
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

const PACK = "@nodetool-ai/sandbox-nodetool";

const session = [
  {
    module: SESSION_CAPABILITY_MODULE,
    exports: ["do_a_thing", "find_a_thing"],
    call: async () => ({})
  },
  {
    module: "ui",
    exports: ["ui_open_thing"],
    call: async () => ({})
  }
];

const mount = (code: string) =>
  mountCapabilityModules(code, undefined, { session });

const importLine = (names: string, module: string) =>
  `import { ${names} } from "${PACK}/${module}";`;

describe("mountCapabilityModules — a capability used without its import", () => {
  it("refuses the action and names the import line", async () => {
    const result = await mount("const r = await do_a_thing({});\nreturn r;");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "`do_a_thing` is not defined in this action. Nothing carries over " +
        "between actions; add " +
        `\`${importLine("do_a_thing", SESSION_CAPABILITY_MODULE)}\`.`
    );
  });

  it("lists every missing name, one import line per module", async () => {
    const result = await mount(
      "await do_a_thing({});\nawait find_a_thing({});\nawait ui_open_thing({});"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      "`do_a_thing`, `find_a_thing`, `ui_open_thing` are not defined in this action."
    );
    expect(result.error).toContain(
      importLine("do_a_thing, find_a_thing", SESSION_CAPABILITY_MODULE)
    );
    expect(result.error).toContain(importLine("ui_open_thing", "ui"));
  });

  it("refuses alongside an import of a different name from the same module", async () => {
    const result = await mount(
      `${importLine("find_a_thing", SESSION_CAPABILITY_MODULE)}\n` +
        "await find_a_thing({});\nawait do_a_thing({});"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("`do_a_thing` is not defined in this action.");
  });

  it.each([
    ["imported", `${importLine("do_a_thing", SESSION_CAPABILITY_MODULE)}\nawait do_a_thing({});`],
    ["declared", "const do_a_thing = async () => 1;\nawait do_a_thing();"],
    ["a parameter", "const f = (do_a_thing) => do_a_thing;\nreturn f(1);"],
    ["guarded by typeof", "if (typeof do_a_thing === 'function') { await do_a_thing({}); }"],
    ["a property name", "const o = { do_a_thing: 1 };\nreturn o.do_a_thing;"],
    ["a string", "return 'do_a_thing';"]
  ])("serves a body where the name is %s", async (_label, code) => {
    const result = await mount(code);
    expect(result.ok).toBe(true);
  });

  it("leaves a body that does not parse to the sandbox", async () => {
    const result = await mount("await do_a_thing({);");
    expect(result.ok).toBe(true);
  });
});

describe("mountCapabilityModules — the registry's own modules", () => {
  const run = createCapabilityRun({
    context: { userId: "user-missing-imports" } as unknown as ProcessingContext,
    gate: UNGATED
  });

  async function firstExport(module: string): Promise<string> {
    const [spec] = await capabilityModuleSpecs([module]);
    const name = spec?.exports.find((exported) => exported.includes("_"));
    if (name === undefined) {
      throw new Error(`${module} declares no snake_case export to test with`);
    }
    return name;
  }

  it("names the owning module for a registry capability used without import", async () => {
    const name = await firstExport("storyboards");
    const result = await mountCapabilityModules(
      `const board = await ${name}({});\nreturn board;`,
      run
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      `\`${name}\` is not defined in this action. Nothing carries over ` +
        `between actions; add \`${importLine(name, "storyboards")}\`.`
    );
  });

  it("refuses a missing name even when the action imports another module", async () => {
    const used = await firstExport("storyboards");
    const imported = await firstExport("models");
    const result = await mountCapabilityModules(
      `${importLine(imported, "models")}\nawait ${imported}({});\nawait ${used}({});`,
      run
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(importLine(used, "storyboards"));
  });

  it("does not claim a registry name in a session that has no run", async () => {
    const name = await firstExport("storyboards");
    const result = await mount(`await ${name}({});`);
    expect(result.ok).toBe(true);
  });
});

describe("mountCapabilityModules — an import from the wrong module", () => {
  const run = createCapabilityRun({
    context: { userId: "user-wrong-module" } as unknown as ProcessingContext,
    gate: UNGATED
  });

  it("names the module that exports a registry capability", async () => {
    const [models] = await capabilityModuleSpecs(["models"]);
    const name = models?.exports.find((exported) => exported.includes("_"));
    if (name === undefined) throw new Error("models declares no export");
    const result = await mountCapabilityModules(
      importLine(name, "storyboards"),
      run
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      `\`${name}\` is exported by \`${PACK}/models\`.`
    );
    // The module's own export list stays.
    expect(result.error).toContain(`"${PACK}/storyboards" exports:`);
  });

  it("names the grafted module that exports a session tool", async () => {
    const result = await mount(importLine("ui_open_thing", SESSION_CAPABILITY_MODULE));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      `\`ui_open_thing\` is exported by \`${PACK}/ui\`.`
    );
  });

  it("says how to call searchTools, which is a method and not an export", async () => {
    const result = await mount(importLine("searchTools", "ui"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      '`searchTools` is not a module export. It is a method of the ' +
        '`nodetool` global: call `await nodetool.searchTools("query")` ' +
        "without importing it."
    );
  });
});
