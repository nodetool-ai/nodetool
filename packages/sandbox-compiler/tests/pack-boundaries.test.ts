/**
 * What the pack system must refuse.
 *
 * `packs.test.ts` proves a declared pack is importable. This file proves the
 * other half of the contract: that the only importable thing is a declared
 * pack, and that the host modules enforce their limits where the guest cannot
 * decline to call them. Every case here expects a refusal — a case that
 * returns a value is a hole, not a pass.
 */

import { describe, expect, it } from "vitest";

import { runInSandbox } from "@nodetool-ai/agents";

import { resolveFor, resolveOne } from "./pack-harness.js";

const YAML = "@nodetool-ai/sandbox-yaml";

/** Run guest code against a resolution and return whatever error came back. */
async function refusalOf(code: string, specifiers: string[], declared = specifiers) {
  const { resolution } = await resolveFor(specifiers, declared);
  const result = await runInSandbox({ code, modules: resolution, timeoutMs: 60_000 });
  return { error: result.error, value: result.result };
}

describe("the import surface is exactly what the run resolved", () => {
  it("refuses a real pack the node did not declare", async () => {
    // The catalog holds csv; this node's declaration does not.
    const { error, value } = await refusalOf(
      `
        import { parse } from "@nodetool-ai/sandbox-csv";
        return await parse("a,b\\n1,2\\n");
      `,
      [YAML, "@nodetool-ai/sandbox-csv"],
      [YAML]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/"@nodetool-ai\/sandbox-csv" is not a sandbox package this run serves/);
  });

  it("refuses a specifier nobody has ever shipped", async () => {
    const { error, value } = await refusalOf(
      `
        import evil from "@acme/totally-legit";
        return evil;
      `,
      [YAML]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/"@acme\/totally-legit" is not a sandbox package this run serves/);
  });

  it("refuses a Node builtin the wrapper's virtual FS really does mount", async () => {
    // `createVirtualFileSystem` mounts node-compat modules unconditionally, so
    // this resolves under the wrapper's defaults. The loader is what says no.
    const { error, value } = await refusalOf(
      `
        import buf from "node:buffer";
        return { got: typeof buf };
      `,
      [YAML]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/"node:buffer" is not a sandbox package this run serves/);
  });

  it("refuses a computed dynamic import, which no static check can see", async () => {
    const { error, value } = await refusalOf(
      `
        const mod = await import("node:" + "fs");
        return { keys: Object.keys(mod).slice(0, 3) };
      `,
      [YAML]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/dynamic import\(\) is not allowed in the sandbox \(requested "node:fs"\)/);
  });

  it("refuses a dynamic import even of a pack that is declared", async () => {
    // Declaration is not the gate here: the form is. Allowing this would make
    // the static declaration check advisory.
    const { error, value } = await refusalOf(
      `
        const yaml = await import("${YAML}");
        return { loaded: yaml.default.load("a: 1") };
      `,
      [YAML]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(
      /dynamic import\(\) is not allowed in the sandbox \(requested "@nodetool-ai\/sandbox-yaml"\)/
    );
  });
});

describe("a host module enforces its limits on the host", () => {
  it("stops a zip bomb at the inflation cap", async () => {
    // ~120 MB of zeros compresses to nearly nothing. The cap has to sit between
    // the archive and the guest, because fflate inflates into host memory.
    const { error, value } = await refusalOf(
      `
        import { zip, unzip } from "@nodetool-ai/sandbox-zip";
        const chunk = "0".repeat(1024 * 1024);
        const entries = {};
        for (let i = 0; i < 120; i++) entries["f" + i + ".txt"] = chunk;
        return { inflated: Object.keys(await unzip(await zip(entries))).length };
      `,
      ["@nodetool-ai/sandbox-zip"]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/exceed the 52428800 byte limit/);
  });

  it("refuses input over the per-call text cap, by name", async () => {
    const { error, value } = await refusalOf(
      `
        import { select } from "@nodetool-ai/sandbox-html";
        return { n: (await select("<p>x</p>".repeat(900000), "p")).length };
      `,
      ["@nodetool-ai/sandbox-html"]
    );
    expect(value).toBeUndefined();
    expect(error).toMatch(/html\.select: input exceeds the 5242880 character limit/);
  });
});

describe("the guest keeps its hardening once modules are loaded", () => {
  // An ES module's dependencies evaluate before the entry body, so hardening
  // has to be in place before any imported module runs — not emitted by the
  // entry. These two are the observable end of that.
  it("has no eval, so the guest cannot self-generate code", async () => {
    const { error } = await refusalOf(`return { v: eval("1+1") };`, [YAML]);
    expect(error).toMatch(/'eval' is not defined/);
  });

  it("has no timers", async () => {
    const { error } = await refusalOf(`return { r: setTimeout(() => {}, 1) };`, [YAML]);
    expect(error).toMatch(/'setTimeout' is not defined/);
  });
});

describe("a saved declaration that no longer matches what is installed", () => {
  it("refuses a run whose content digest drifted", async () => {
    const { catalog } = await resolveOne(YAML);
    const drifted = catalog.resolveForExecution([
      { specifier: YAML, contentDigest: "0".repeat(64) }
    ]);
    expect(drifted.statuses[0]?.code).toBe("content-digest-mismatch");
  });
});
