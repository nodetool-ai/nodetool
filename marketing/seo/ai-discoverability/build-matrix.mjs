/**
 * Validates the AI-discoverability query corpus and rolls it up into the
 * opportunity matrix, one row per target page.
 *
 *   node marketing/seo/ai-discoverability/build-matrix.mjs           # write
 *   node marketing/seo/ai-discoverability/build-matrix.mjs --check   # fail if stale or invalid
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, "query-corpus.csv");
const MATRIX = resolve(here, "opportunity-matrix.csv");

const COLUMNS = ["id", "cluster", "subcluster", "query", "form", "intent", "funnel", "source_method", "nodetool_fit", "notes", "target_page", "page_status", "priority"];
const ALLOWED = {
  form: ["keyword", "question", "conversational"],
  intent: ["informational", "commercial", "comparison", "navigational", "how-to"],
  funnel: ["awareness", "consideration", "decision"],
  nodetool_fit: ["strong", "partial", "weak", "none"],
  page_status: ["existing", "improve", "rebuild", "new", "proposed"],
  priority: ["P1", "P2", "P3", "do-not-target"],
};

/** RFC 4180 rows: quoted fields may hold commas, quotes ("") and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function readCorpus() {
  const [header, ...body] = parseCsv(readFileSync(CORPUS, "utf8"));
  if (header.join(",") !== COLUMNS.join(",")) {
    throw new Error(`query-corpus.csv columns must be: ${COLUMNS.join(",")}`);
  }
  if (body.length === 0) throw new Error("query-corpus.csv has no rows.");
  const ids = new Set();
  return body.map((cells, index) => {
    if (cells.length !== COLUMNS.length) {
      throw new Error(`query-corpus.csv row ${index + 2} has ${cells.length} fields, expected ${COLUMNS.length}.`);
    }
    const row = Object.fromEntries(COLUMNS.map((column, i) => [column, cells[i]]));
    if (ids.has(row.id)) throw new Error(`Duplicate id ${row.id}.`);
    ids.add(row.id);
    for (const [column, values] of Object.entries(ALLOWED)) {
      if (!values.includes(row[column])) {
        throw new Error(`${row.id}: ${column} "${row[column]}" is not one of ${values.join(", ")}.`);
      }
    }
    if (!row.query.trim() || !row.target_page.startsWith("/")) {
      throw new Error(`${row.id}: needs a query and a target_page starting with "/".`);
    }
    return row;
  });
}

function buildMatrix(rows) {
  const pages = new Map();
  for (const row of rows) {
    const page = pages.get(row.target_page) ?? {
      target_page: row.target_page,
      page_status: row.page_status,
      clusters: new Set(),
      queries: 0,
      strong: 0,
      partial: 0,
      weak_or_none: 0,
      P1: 0,
      P2: 0,
      P3: 0,
      "do-not-target": 0,
    };
    page.clusters.add(`${row.cluster}/${row.subcluster}`);
    page.queries += 1;
    page[row.nodetool_fit === "strong" || row.nodetool_fit === "partial" ? row.nodetool_fit : "weak_or_none"] += 1;
    page[row.priority] += 1;
    pages.set(row.target_page, page);
  }
  const ordered = [...pages.values()].sort(
    (a, b) => b.P1 - a.P1 || b.P2 - a.P2 || b.queries - a.queries || a.target_page.localeCompare(b.target_page)
  );
  const columns = Object.keys(ordered[0]);
  const lines = [columns.join(",")];
  for (const page of ordered) {
    lines.push(columns.map((c) => csvField(c === "clusters" ? [...page.clusters].sort().join(" ") : page[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

const next = buildMatrix(readCorpus());
if (process.argv.includes("--check")) {
  const current = existsSync(MATRIX) ? readFileSync(MATRIX, "utf8") : "";
  if (current !== next) {
    console.error("opportunity-matrix.csv is stale. Run: node marketing/seo/ai-discoverability/build-matrix.mjs");
    process.exit(1);
  }
  console.log("opportunity-matrix.csv is up to date.");
} else {
  writeFileSync(MATRIX, next);
  console.log(`Wrote ${MATRIX}`);
}
