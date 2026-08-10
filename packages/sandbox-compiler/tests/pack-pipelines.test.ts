/**
 * Several packs composed inside one Code node.
 *
 * `packs.test.ts` imports one pack at a time. Real nodes do not: they parse a
 * CSV, do date arithmetic on it, dump YAML and zip the result — four packs, one
 * guest, one module loader. These pipelines are the shape that breaks when the
 * loader mounts a pack's siblings wrong, when a host facade collides with
 * another, or when two host modules disagree about how bytes cross the bridge.
 *
 * Inputs are generated here rather than fetched, and the expected values come
 * from a host-side oracle computed independently of the guest.
 */

import { describe, expect, it } from "vitest";

import { runInSandbox } from "@nodetool-ai/agents";

import { resolveFor } from "./pack-harness.js";

const CSV = "@nodetool-ai/sandbox-csv";
const DATES = "@nodetool-ai/sandbox-dates";
const DIFF = "@nodetool-ai/sandbox-diff";
const HTML = "@nodetool-ai/sandbox-html";
const XML = "@nodetool-ai/sandbox-xml";
const YAML = "@nodetool-ai/sandbox-yaml";
const ZIP = "@nodetool-ai/sandbox-zip";

/** Run a node body with the packs it declares, failing loudly on a guest error. */
async function runNode(code: string, packs: string[], globals: Record<string, unknown> = {}) {
  const { resolution } = await resolveFor(packs);
  expect(resolution.statuses.filter((s) => s.status === "error")).toEqual([]);
  const result = await runInSandbox({ code, modules: resolution, globals, timeoutMs: 60_000 });
  expect(result.error).toBeUndefined();
  return result.result as Record<string, unknown>;
}

/* ------------------------------------------------------------------ fixtures */

interface Order {
  order_id: string;
  date: string;
  region: string;
  amount_eur: number;
}

/** A deterministic order book, so the oracle below is stable across runs. */
function makeOrders(count: number): Order[] {
  const regions = ["EMEA", "AMER", "APAC"];
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    orders.push({
      order_id: `NT-${10000 + i}`,
      date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      region: regions[Math.floor(rand() * regions.length)]!,
      amount_eur: Math.round((49 + rand() * 4000) * 100) / 100
    });
  }
  return orders;
}

function toCsv(orders: Order[]): string {
  return [
    "order_id,date,region,amount_eur",
    ...orders.map((o) => `${o.order_id},${o.date},${o.region},${o.amount_eur.toFixed(2)}`)
  ].join("\n");
}

/**
 * The same aggregation, in plain host JS.
 *
 * The quarter comes off the month digits rather than a Date, so this agrees
 * with the guest (which is always UTC) whatever the host's zone is.
 */
function oracle(orders: Order[]) {
  const buckets = new Map<string, { region: string; quarter: string; orders: number; revenue: number }>();
  for (const o of orders) {
    const quarter = `Q${Math.floor((Number(o.date.slice(5, 7)) - 1) / 3) + 1}`;
    const key = `${o.region}|${quarter}`;
    const bucket = buckets.get(key) ?? { region: o.region, quarter, orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += o.amount_eur;
    buckets.set(key, bucket);
  }
  const segments = [...buckets.values()].map((b) => ({ ...b, revenue: Math.round(b.revenue * 100) / 100 }));
  return {
    segments: segments.length,
    total: Math.round(segments.reduce((s, b) => s + b.revenue, 0) * 100) / 100,
    top: segments.sort((a, b) => b.revenue - a.revenue)[0]!
  };
}

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from nodetool</title>
  <entry>
    <title>v0.7.7</title>
    <updated>2026-08-04T09:15:00Z</updated>
  </entry>
  <entry>
    <title>v0.7.6</title>
    <updated>2026-07-21T16:40:00Z</updated>
  </entry>
  <entry>
    <title>v0.7.5</title>
    <updated>2026-07-02T11:05:00Z</updated>
  </entry>
</feed>
`;

const PAGE_HTML = `<!doctype html>
<html>
  <head><title>Sandbox packages</title></head>
  <body>
    <h1>Sandbox packages</h1>
    <p>Every library the sandbox offers is an <strong>importable module</strong>.</p>
    <h2>Guest modules</h2>
    <p>See <a href="https://nodetool.ai/docs">the docs</a> and <a href="/local/page">a local page</a>.</p>
    <h2>Host modules</h2>
    <p>A host module carries an id, <em>never</em> an implementation.</p>
    <ul><li><a href="https://github.com/nodetool-ai/nodetool">source</a></li></ul>
  </body>
</html>
`;

const DEPLOY_BEFORE = `service: nodetool-api
replicas: 2
image: ghcr.io/nodetool-ai/api:0.7.6
env:
  - name: LOG_LEVEL
    value: info
`;

const DEPLOY_AFTER = `service: nodetool-api
replicas: 3
image: ghcr.io/nodetool-ai/api:0.7.7
env:
  - name: LOG_LEVEL
    value: debug
  - name: SANDBOX_PACKS
    value: "1"
`;

/* ----------------------------------------------------------------- pipelines */

describe("four packs in one node", () => {
  it("aggregates a CSV by quarter, dumps YAML, and round-trips it through a zip", async () => {
    const orders = makeOrders(200);
    const expected = oracle(orders);

    const result = await runNode(
      `
        import { parse, stringify } from "${CSV}";
        import { parseISO, getQuarter } from "${DATES}";
        import yaml from "${YAML}";
        import { zip, unzip } from "${ZIP}";

        const orders = await parse(inputs.csv);

        const buckets = new Map();
        for (const o of orders) {
          const quarter = "Q" + getQuarter(parseISO(o.date));
          const key = o.region + "|" + quarter;
          const bucket = buckets.get(key) ?? { region: o.region, quarter, orders: 0, revenue: 0 };
          bucket.orders += 1;
          bucket.revenue += Number(o.amount_eur);
          buckets.set(key, bucket);
        }

        const segments = [...buckets.values()]
          .map((b) => ({ ...b, revenue: Math.round(b.revenue * 100) / 100 }))
          .sort((a, b) => b.revenue - a.revenue);

        const summaryCsv = await stringify(segments);
        const meta = yaml.dump({ orders: orders.length, segments: segments.length });

        // Out through fflate and back, so the archive is proven readable.
        const entries = await unzip(await zip({ "summary.csv": summaryCsv, "meta.yaml": meta }));
        const decoder = new TextDecoder();

        return {
          parsedOrders: orders.length,
          segments: segments.length,
          total: Math.round(segments.reduce((s, b) => s + b.revenue, 0) * 100) / 100,
          top: segments[0],
          roundTripped: decoder.decode(entries["summary.csv"]) === summaryCsv,
          meta: yaml.load(decoder.decode(entries["meta.yaml"]))
        };
      `,
      [CSV, DATES, YAML, ZIP],
      { inputs: { csv: toCsv(orders) } }
    );

    expect(result.parsedOrders).toBe(200);
    expect(result.segments).toBe(expected.segments);
    expect(result.total).toBeCloseTo(expected.total, 2);
    expect(result.top).toMatchObject({ region: expected.top.region, quarter: expected.top.quarter });
    expect(result.roundTripped).toBe(true);
    expect(result.meta).toEqual({ orders: 200, segments: expected.segments });
  });
});

describe("a feed digest across xml, dates and yaml", () => {
  it("parses an Atom feed, dates each entry, and emits YAML", async () => {
    const result = await runNode(
      `
        import { parse } from "${XML}";
        import { parseISO, format, differenceInCalendarDays, isValid } from "${DATES}";
        import yaml from "${YAML}";

        const feed = await parse(inputs.xml);
        const entries = [].concat(feed?.feed?.entry ?? []);   // one entry is not an array
        const today = parseISO("2026-08-10T00:00:00Z");

        const releases = entries.map((e) => {
          const when = parseISO(String(e.updated));
          return {
            title: String(e.title),
            released: isValid(when) ? format(when, "yyyy-MM-dd") : "unknown",
            age_days: isValid(when) ? differenceInCalendarDays(today, when) : null
          };
        });

        return {
          feedTitle: String(feed?.feed?.title ?? ""),
          releases,
          digest: yaml.dump(releases).trim()
        };
      `,
      [XML, DATES, YAML],
      { inputs: { xml: ATOM_FEED } }
    );

    expect(result.feedTitle).toBe("Release notes from nodetool");
    expect(result.releases).toEqual([
      { title: "v0.7.7", released: "2026-08-04", age_days: 6 },
      { title: "v0.7.6", released: "2026-07-21", age_days: 20 },
      { title: "v0.7.5", released: "2026-07-02", age_days: 39 }
    ]);
    expect(result.digest).toContain("age_days: 6");
  });
});

describe("page ingestion through the html pack", () => {
  it("selects and converts in the same node, concurrently", async () => {
    const result = await runNode(
      `
        import { select, toMarkdown } from "${HTML}";

        // Host calls start when invoked, so these three overlap.
        const [titles, headings, hrefs] = await Promise.all([
          select(inputs.html, "h1"),
          select(inputs.html, "h2"),
          select(inputs.html, "a[href]", { attr: "href" })
        ]);

        return {
          title: titles[0] ?? null,
          headings,
          hrefs,
          external: hrefs.filter((h) => h.startsWith("http")).length,
          markdown: await toMarkdown(inputs.html),
          missing: await select(inputs.html, "blockquote.does-not-exist")
        };
      `,
      [HTML],
      { inputs: { html: PAGE_HTML } }
    );

    expect(result.title).toBe("Sandbox packages");
    expect(result.headings).toEqual(["Guest modules", "Host modules"]);
    expect(result.hrefs).toEqual([
      "https://nodetool.ai/docs",
      "/local/page",
      "https://github.com/nodetool-ai/nodetool"
    ]);
    expect(result.external).toBe(2);
    // A selector matching nothing is an empty array, never null.
    expect(result.missing).toEqual([]);
    expect(result.markdown).toContain("# Sandbox packages");
    expect(result.markdown).toContain("**importable module**");
  });
});

describe("config drift across yaml and diff", () => {
  it("compares two revisions structurally and as a patch", async () => {
    const result = await runNode(
      `
        import yaml from "${YAML}";
        import { unified } from "${DIFF}";

        const before = yaml.load(inputs.before);
        const after = yaml.load(inputs.after);

        const patch = await unified(inputs.before, inputs.after, {
          oldName: "deploy.yaml@old",
          newName: "deploy.yaml@new",
          context: 2
        });

        return {
          replicas: [before.replicas, after.replicas],
          image: after.image,
          envAdded: after.env.length - before.env.length,
          changed: patch.includes("@@"),
          // jsdiff opens with a "=====" separator, then the two file lines.
          names: patch.split("\\n").filter((l) => l.startsWith("---") || l.startsWith("+++"))
        };
      `,
      [YAML, DIFF],
      { inputs: { before: DEPLOY_BEFORE, after: DEPLOY_AFTER } }
    );

    expect(result.replicas).toEqual([2, 3]);
    expect(result.image).toBe("ghcr.io/nodetool-ai/api:0.7.7");
    expect(result.envAdded).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.names).toEqual(["--- deploy.yaml@old", "+++ deploy.yaml@new"]);
  });

  it("reports no hunks when the two sides are identical", async () => {
    const result = await runNode(
      `
        import { unified } from "${DIFF}";
        const patch = await unified(inputs.text, inputs.text, { oldName: "a", newName: "a" });
        return { changed: patch.includes("@@") };
      `,
      [DIFF],
      { inputs: { text: DEPLOY_AFTER } }
    );
    expect(result.changed).toBe(false);
  });
});

describe("a mixed archive dispatched by extension", () => {
  it("unzips once and routes each entry to the pack that handles it", async () => {
    const orders = makeOrders(20);

    const result = await runNode(
      `
        import { zip, unzip } from "${ZIP}";
        import { parse as parseCsv } from "${CSV}";
        import { parse as parseXml } from "${XML}";
        import yaml from "${YAML}";

        // The archive a customer would send, built here so the test owns both ends.
        const archive = await zip({
          "orders/sales.csv": inputs.csv,
          "config/deploy.yaml": inputs.yaml,
          "feed/releases.atom": inputs.xml,
          "README.md": "# Export\\n"
        });

        const files = await unzip(archive);
        const decoder = new TextDecoder();
        const handled = {};

        for (const [name, bytes] of Object.entries(files)) {
          const text = decoder.decode(bytes);
          if (name.endsWith(".csv")) {
            const rows = await parseCsv(text);
            handled[name] = { pack: "csv", rows: rows.length, columns: Object.keys(rows[0] ?? {}) };
          } else if (name.endsWith(".yaml")) {
            const doc = yaml.load(text);
            handled[name] = { pack: "yaml", service: doc.service, replicas: doc.replicas };
          } else if (name.endsWith(".atom")) {
            const feed = await parseXml(text);
            handled[name] = { pack: "xml", entries: [].concat(feed?.feed?.entry ?? []).length };
          } else {
            handled[name] = { pack: "none", chars: text.length };
          }
        }

        return { entries: Object.keys(files).length, handled };
      `,
      [ZIP, CSV, XML, YAML],
      { inputs: { csv: toCsv(orders), yaml: DEPLOY_AFTER, xml: ATOM_FEED } }
    );

    expect(result.entries).toBe(4);
    expect(result.handled).toEqual({
      "orders/sales.csv": {
        pack: "csv",
        rows: 20,
        columns: ["order_id", "date", "region", "amount_eur"]
      },
      "config/deploy.yaml": { pack: "yaml", service: "nodetool-api", replicas: 3 },
      "feed/releases.atom": { pack: "xml", entries: 3 },
      "README.md": { pack: "none", chars: 9 }
    });
  });
});
