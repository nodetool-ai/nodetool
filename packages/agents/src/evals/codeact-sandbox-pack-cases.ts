/**
 * CodeAct eval cases for sandbox packages.
 *
 * A CodeAct action is code the model just wrote, so the packages it may import
 * are the session's allowlist and nothing else (`codeact/sandbox-packages.ts`).
 * Three behaviours follow from that, and none of them was measured against a
 * real model before: importing an allowed pack and using it correctly, reading
 * a pack's SKILL.md through `get_sandbox_package_docs` rather than guessing its
 * API, and recovering when an import is refused.
 *
 * The packs here are the shipped ones under `packages/sandbox-packs/`, resolved
 * through the real catalog. Only **host** packs appear: a guest pack must be
 * compiled by `@nodetool-ai/sandbox-compiler` first, which this package does not
 * depend on.
 *
 * Every objective carries its own data, so a case answers from the pack or not
 * at all — the expected values cannot be reached by reasoning over the prompt.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import type { CodeActEvalCase } from "./codeact-cases.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACKS_ROOT = join(here, "..", "..", "..", "sandbox-packs");

export const SANDBOX_PACK_DOCS_TOOL = "get_sandbox_package_docs";

/** The host packs these cases allow. None needs the compiler. */
const SHIPPED_HOST_PACKS = ["sandbox-csv", "sandbox-xml", "sandbox-zip"];

let cached: SandboxModuleCatalog | undefined;

/**
 * A catalog over the shipped host packs, built once per process.
 *
 * Discovery reads the pack directories users install; nothing is stubbed, so a
 * case that imports a pack runs the same library a Code node would.
 */
export function shippedHostPackCatalog(): SandboxModuleCatalog {
  if (cached) return cached;
  const discoveries = SHIPPED_HOST_PACKS.map((dir) => {
    const discovery = discoverSandboxPack(join(PACKS_ROOT, dir));
    if (discovery === undefined) throw new Error(`${dir} is not a sandbox pack`);
    return discovery;
  });
  cached = createSandboxModuleCatalog(discoveries);
  return cached;
}

const CSV = "@nodetool-ai/sandbox-csv";
const XML = "@nodetool-ai/sandbox-xml";
const ZIP = "@nodetool-ai/sandbox-zip";

/** Six orders; EMEA totals 405.50, which is the answer only parsing produces. */
const ORDERS_CSV = [
  "order_id,region,amount_eur",
  "NT-1001,EMEA,120.00",
  "NT-1002,AMER,80.50",
  "NT-1003,EMEA,240.25",
  "NT-1004,APAC,60.00",
  "NT-1005,AMER,199.50",
  "NT-1006,EMEA,45.25"
].join("\\n");

const TOTAL_SCHEMA = {
  type: "object",
  properties: { total: { type: "number" } },
  required: ["total"]
};

export const CODEACT_SANDBOX_PACK_EVAL_CASES: readonly CodeActEvalCase[] = [
  {
    id: "sandbox-pack-import",
    description: "Import an allowed pack and compute from what it parses",
    objective:
      "This CSV is your input:\\n\\n" +
      ORDERS_CSV +
      "\\n\\nParse it with the `" +
      CSV +
      "` sandbox package and finish with " +
      "{total: <the summed amount_eur of the EMEA rows only>}. Parse it — do " +
      "not add the numbers up yourself in your reply.",
    sandboxPackages: [CSV],
    outputSchema: TOTAL_SCHEMA,
    expect: {
      // 120.00 + 240.25 + 45.25. Wrong parsing gives a different sum, and the
      // whole-file total (745.50) is the tell that the filter was skipped.
      resultCheck: (r) =>
        typeof r === "object" &&
        r !== null &&
        Math.abs(Number((r as { total?: unknown }).total) - 405.5) < 0.001,
      resultCheckLabel: "total=405.50 (EMEA only)",
      maxActions: 4
    }
  },
  {
    id: "sandbox-pack-docs",
    description: "Read a pack's SKILL.md instead of guessing its API",
    objective:
      "You may import the `" +
      XML +
      "` sandbox package. Before you write any code, read that package's " +
      "documentation to find out how attributes are represented in the parsed " +
      "object. Then parse this feed:\\n\\n" +
      '<?xml version="1.0"?><catalog><item sku="A-1"><name>Widget</name>' +
      '</item></catalog>' +
      "\\n\\nFinish with {prefix: <the exact key prefix the parser puts on " +
      "attributes>}. It is two characters.",
    sandboxPackages: [XML],
    outputSchema: {
      type: "object",
      properties: { prefix: { type: "string" } },
      required: ["prefix"]
    },
    expect: {
      // The SKILL.md says attributes ride along prefixed `@_`. A model that
      // guesses usually answers "@" or "$".
      requiredSessionTools: [SANDBOX_PACK_DOCS_TOOL],
      resultCheck: (r) =>
        typeof r === "object" &&
        r !== null &&
        String((r as { prefix?: unknown }).prefix).trim() === "@_",
      resultCheckLabel: 'prefix="@_"',
      maxActions: 4
    }
  },
  {
    id: "sandbox-pack-denied",
    // Graded on the outcome, not the route. A model reaches `available: false`
    // either by attempting the import and reading the refusal, or by reading
    // the allowlist the prompt advertises; both are correct, and live runs do
    // both. What the case rules out is the failure that matters — hand-parsing
    // the text and reporting success. The refusal mechanism itself is pinned
    // deterministically in `tests/codeact-sandbox-packs.test.ts`.
    description: "Report a pack as unavailable instead of working around it",
    objective:
      "Try to parse this YAML with the `@nodetool-ai/sandbox-yaml` sandbox " +
      "package:\\n\\nservice: nodetool-api\\nreplicas: 3\\n\\n" +
      "If that package cannot be imported in this session, do not work around " +
      "it and do not hand-parse the text. Finish with " +
      "{available: false, reason: <a short reason>} instead. If it can be " +
      "imported, finish with {available: true, reason: 'imported'}.",
    // The session allows csv, so the yaml import is refused by the mount check.
    sandboxPackages: [CSV],
    outputSchema: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        reason: { type: "string" }
      },
      required: ["available", "reason"]
    },
    expect: {
      resultCheck: (r) =>
        typeof r === "object" &&
        r !== null &&
        (r as { available?: unknown }).available === false,
      resultCheckLabel: "available=false",
      maxActions: 5
    }
  },
  {
    id: "sandbox-pack-two",
    description: "Use two allowed packs in one action",
    objective:
      "This CSV is your input:\\n\\n" +
      ORDERS_CSV +
      "\\n\\nUsing the `" +
      ZIP +
      "` and `" +
      CSV +
      "` sandbox packages: put the CSV into a zip archive under the entry " +
      "name `orders.csv`, read that archive back, parse the entry you " +
      "extracted, and finish with {total: <the number of parsed data rows>}. " +
      "Go through the archive — do not count the lines in the prompt.",
    sandboxPackages: [ZIP, CSV],
    outputSchema: TOTAL_SCHEMA,
    expect: {
      resultCheck: (r) =>
        typeof r === "object" &&
        r !== null &&
        Number((r as { total?: unknown }).total) === 6,
      resultCheckLabel: "total=6 rows",
      maxActions: 5
    }
  }
];
