/**
 * Sandbox packages inside CodeAct — the mechanism, and the cases that measure
 * a model against it.
 *
 * The eval suite grades a model's behaviour and so cannot pin the machinery: a
 * live run reaches the right answer by more than one route. These tests pin it.
 * Everything below the scripted provider is real — the executor, the bridge,
 * the QuickJS guest and the module mount — so a scripted run proves both that
 * each case is satisfiable and that a shipped pack really is importable from a
 * CodeAct action.
 *
 * Only host packs appear: a guest pack needs `@nodetool-ai/sandbox-compiler`,
 * which this package does not depend on.
 */
import { describe, it, expect } from "vitest";

import { runCodeActEval } from "../src/evals/codeact-eval.js";
import {
  CODEACT_SANDBOX_PACK_EVAL_CASES,
  SANDBOX_PACK_DOCS_TOOL,
  shippedPackCatalog
} from "../src/evals/codeact-sandbox-pack-cases.js";
import { mountActionModules } from "../src/codeact/sandbox-packages.js";
import { createScriptedLoopProvider } from "./_helpers/scripted-loop-provider.js";

const CSV = "@nodetool-ai/sandbox-csv";
const YAML = "@nodetool-ai/sandbox-yaml";

/**
 * The CSV the cases carry in their objective. A live model reads it out of the
 * prompt; a scripted action has no model, so it embeds the same text.
 */
const ORDERS_CSV = [
  "order_id,region,amount_eur",
  "NT-1001,EMEA,120.00",
  "NT-1002,AMER,80.50",
  "NT-1003,EMEA,240.25",
  "NT-1004,APAC,60.00",
  "NT-1005,AMER,199.50",
  "NT-1006,EMEA,45.25"
].join("\n");

const CSV_LITERAL = JSON.stringify(ORDERS_CSV);

/** One scripted action list per case, in the order the suite declares them. */
const SOLUTIONS: Record<string, string[]> = {
  "sandbox-pack-import": [
    `import { parse } from "${CSV}";
     const rows = await parse(${CSV_LITERAL});
     const total = rows
       .filter((r) => r.region === "EMEA")
       .reduce((sum, r) => sum + Number(r.amount_eur), 0);
     await finish({ total: Math.round(total * 100) / 100 });`
  ],
  "sandbox-pack-discover": [
    `const packs = await nodetool.packs.list();
     const installed = packs.map((p) => p.packName);
     const candidates = [
       "@nodetool-ai/sandbox-zip",
       "@nodetool-ai/sandbox-diff",
       "@acme/nope"
     ];
     await finish({
       installed: candidates.filter((name) => installed.indexOf(name) >= 0)
     });`
  ],
  "sandbox-pack-docs": [
    `import { ${SANDBOX_PACK_DOCS_TOOL} } from "@nodetool-ai/sandbox-nodetool/packs";
     const docs = await ${SANDBOX_PACK_DOCS_TOOL}({
       specifier: "@nodetool-ai/sandbox-xml"
     });
     await finish({ prefix: "@_" });`
  ],
  "sandbox-pack-denied": [
    // Refused at the mount, before the guest starts — the action never runs.
    `import yaml from "${YAML}";
     await finish({ available: true, reason: 'imported' });`,
    `await finish({
       available: false,
       reason: "not on this session's package allowlist"
     });`
  ],
  "sandbox-pack-two": [
    `import { zip, unzip } from "@nodetool-ai/sandbox-zip";
     import { parse } from "${CSV}";
     const archive = await zip({ "orders.csv": ${CSV_LITERAL} });
     const files = await unzip(archive);
     const text = new TextDecoder().decode(files["orders.csv"]);
     await finish({ total: (await parse(text)).length });`
  ]
};

describe("the shipped host packs, through the CodeAct catalog", () => {
  it("resolves every pack the cases allow", () => {
    const catalog = shippedPackCatalog();
    for (const specifier of [CSV, "@nodetool-ai/sandbox-xml", "@nodetool-ai/sandbox-zip"]) {
      const resolution = catalog.resolveForExecution([{ specifier }]);
      expect(
        resolution.statuses.filter((s) => s.status === "error"),
        specifier
      ).toEqual([]);
      expect(resolution.modules).toHaveLength(1);
    }
  });

  it("is cached, so a suite compiles the packs once", () => {
    expect(shippedPackCatalog()).toBe(shippedPackCatalog());
  });
});

describe("the session allowlist decides what an action may import", () => {
  const catalog = shippedPackCatalog();

  it("mounts a pack the session allows", () => {
    const mount = mountActionModules(
      `import { parse } from "${CSV}";\nreturn await parse("a,b\\n1,2\\n");`,
      [CSV],
      catalog
    );
    expect(mount.ok).toBe(true);
    if (mount.ok) expect(mount.modules?.modules).toHaveLength(1);
  });

  it("refuses one it does not, naming what is allowed", () => {
    const mount = mountActionModules(
      `import yaml from "${YAML}";\nreturn yaml.load("a: 1");`,
      [CSV],
      catalog
    );
    expect(mount.ok).toBe(false);
    if (!mount.ok) {
      expect(mount.error).toContain(YAML);
      expect(mount.error).toContain("not on this session's package allowlist");
      expect(mount.error).toContain(CSV);
    }
  });

  it("refuses every import when the session allows nothing", () => {
    const mount = mountActionModules(
      `import { parse } from "${CSV}";\nreturn await parse("a\\n1\\n");`,
      [],
      catalog
    );
    expect(mount.ok).toBe(false);
    if (!mount.ok) {
      expect(mount.error).toContain("No sandbox package is available");
    }
  });

  it("mounts nothing for an action that imports nothing", () => {
    const mount = mountActionModules(`return 1 + 1;`, [CSV], catalog);
    expect(mount.ok).toBe(true);
    if (mount.ok) expect(mount.modules).toBeUndefined();
  });
});

describe("the sandbox-pack eval cases", () => {
  it("every case is satisfiable by a scripted run and scores 1.0", async () => {
    const provider = createScriptedLoopProvider(
      CODEACT_SANDBOX_PACK_EVAL_CASES.map((c) => SOLUTIONS[c.id] ?? [])
    );

    const report = await runCodeActEval({
      provider,
      model: "scripted",
      cases: CODEACT_SANDBOX_PACK_EVAL_CASES
    });

    for (const result of report.cases) {
      expect(
        result.accepted,
        `${result.caseId}: ${JSON.stringify(result.checks)}`
      ).toBe(true);
      expect(result.score).toBe(1);
    }
    expect(report.summary.successRate).toBe(1);
  }, 120_000);
});
