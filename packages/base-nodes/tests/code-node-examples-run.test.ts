/**
 * Executes the Code-node example workflows in `examples/workflows/` and asserts
 * the value every node produced.
 *
 * The gap this closes: none of the 42 example workflows the other run-suites
 * execute contains a `nodetool.code.Code` node, and the Code node's own package
 * tests serve a hand-written module from a hand-written catalog. So the seam
 * between a *shipped* pack and a *running graph* — discovery, the catalog on
 * the ProcessingContext, the node's `packages` declaration, the guest loader —
 * was covered nowhere.
 *
 * Here the catalog is built from the pack directories under
 * `packages/sandbox-packs/`, which are the ones users install, and the graphs
 * run through `ExecutionSession` — the path `nodetool workflows run` and the
 * websocket server both take.
 *
 * Only **host** packs appear. A guest pack (`sandbox-yaml`, `sandbox-dates`)
 * has to be compiled by `@nodetool-ai/sandbox-compiler` first, which this
 * package does not depend on; reading a warm compile cache instead would make
 * the suite pass here and fail on a clean checkout. `packs.test.ts` in the
 * compiler covers the guest half.
 *
 * Nothing touches a model, the network, or the filesystem: every input is a
 * string constant in the graph.
 *
 * One thing to know before running `nodetool validate` on these files: it
 * reports `code_package_unavailable` for each of them. That is not a defect in
 * the example. The CLI builds its catalog by scanning node_modules, and the
 * packs are deliberately not workspaces, so in a repo checkout nothing has
 * installed them. On a real install they are present and the check passes.
 * This suite discovers them from `packages/sandbox-packs/` instead, which is
 * what makes it run here at all. `scripts/validate-examples.mjs` and the
 * workflow-example-validation CI job scan only `packages/**\/examples/`, so
 * these files are outside that gate.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeRegistry,
  createGraphNodeTypeResolver,
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");
const PACKS_ROOT = path.resolve(__dirname, "../../sandbox-packs");

/** The host packs these examples import. None needs the compiler. */
const HOST_PACKS = [
  "sandbox-csv",
  "sandbox-diff",
  "sandbox-html",
  "sandbox-xml",
  "sandbox-zip"
];

beforeAll(() => {
  const discoveries = HOST_PACKS.map((dir) => {
    const discovery = discoverSandboxPack(path.join(PACKS_ROOT, dir));
    if (discovery === undefined) throw new Error(`${dir} is not a sandbox pack`);
    return discovery;
  });
  setProcessSandboxModuleCatalog(createSandboxModuleCatalog(discoveries));
});

// The catalog is process-wide state; leaving it set would follow this file.
afterAll(() => setProcessSandboxModuleCatalog(null));

async function run(file: string): Promise<Record<string, unknown[]>> {
  const { graph } = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `code-example-${file}`,
    params: {}
  } as never);
  const result = await session.result;
  expect(result.error ?? null, `${file} errored`).toBeNull();
  expect(result.status, `${file} did not complete`).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("code_csv_report_cli", () => {
  it("aggregates six orders by region, then formats them in a second node", async () => {
    const out = await run("code_csv_report_cli.json");

    // EMEA 120.00 + 240.25 + 45.25, AMER 80.50 + 199.50, APAC 60.00.
    expect(out["order_count"]).toEqual([6]);

    // The header row is the keys of the first record; the rounding drops a
    // trailing zero, so 405.50 is written 405.5. Rows are separated by "\n" —
    // the host facade does not use papaparse's default "\r\n".
    expect(out["summary_csv"]).toEqual([
      [
        "region,orders,revenue_eur",
        "EMEA,3,405.5",
        "AMER,2,280",
        "APAC,1,60"
      ].join("\n")
    ]);

    // The second Code node declares no packages and reads the first one's rows.
    expect(out["report"]).toEqual([
      [
        "EMEA: 3 orders, EUR 405.50",
        "AMER: 2 orders, EUR 280.00",
        "APAC: 1 orders, EUR 60.00"
      ].join("\n")
    ]);
  });
});

describe("code_xml_feed_cli", () => {
  it("parses an Atom feed into a title and an entry list", async () => {
    const out = await run("code_xml_feed_cli.json");
    expect(out["feed_title"]).toEqual(["Release notes from nodetool"]);
    expect(out["count"]).toEqual([3]);
    expect(out["titles"]).toEqual([["v0.7.7", "v0.7.6", "v0.7.5"]]);
  });
});

describe("code_html_extract_cli", () => {
  it("selects headings and links, and converts the page to markdown", async () => {
    const out = await run("code_html_extract_cli.json");
    expect(out["title"]).toEqual(["Sandbox packages"]);
    expect(out["headings"]).toEqual([["Guest modules", "Host modules"]]);
    // Two anchors, but "/local" is relative — only one is external.
    expect(out["external_links"]).toEqual([1]);
  });
});

describe("code_config_diff_cli", () => {
  it("reports the two lines that moved between config revisions", async () => {
    const out = await run("code_config_diff_cli.json");
    expect(out["changed"]).toEqual([true]);
    // `replicas` and `image` changed; `service` did not.
    expect(out["added_lines"]).toEqual([2]);
    expect(out["removed_lines"]).toEqual([2]);
  });
});

describe("code_zip_bundle_cli", () => {
  it("uses two packs in one node: zip an archive, read it back, parse the CSV", async () => {
    const out = await run("code_zip_bundle_cli.json");
    expect(out["entry_names"]).toEqual([["README.md", "orders/sales.csv"]]);
    expect(out["row_count"]).toEqual([6]);
    expect(out["columns"]).toEqual([
      ["order_id", "region", "product", "amount_eur"]
    ]);
  });
});
