// Run: node --test marketing/scripts/__tests__/indexnow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { changedUrls, parseSitemap, KEY } from "../indexnow.mjs";

const xml = (rows) =>
  `<?xml version="1.0"?><urlset>${rows
    .map(([loc, lastmod]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>0.5</priority></url>`)
    .join("")}</urlset>`;

test("parseSitemap reads loc and lastmod, null when absent", () => {
  assert.deepEqual(parseSitemap(xml([["https://nodetool.ai/a", "2026-11-01"], ["https://nodetool.ai/b"]])), {
    "https://nodetool.ai/a": "2026-11-01",
    "https://nodetool.ai/b": null,
  });
});

test("changedUrls returns new URLs and URLs with a different lastmod only", () => {
  const before = { "https://nodetool.ai/a": "2026-11-01", "https://nodetool.ai/b": null, "https://nodetool.ai/gone": "2026-10-01" };
  const after = {
    "https://nodetool.ai/a": "2026-11-12",
    "https://nodetool.ai/b": null,
    "https://nodetool.ai/new": null,
  };
  assert.deepEqual(changedUrls(before, after), ["https://nodetool.ai/a", "https://nodetool.ai/new"]);
});

test("the public key file holds exactly the key", () => {
  const file = fileURLToPath(new URL(`../../public/${KEY}.txt`, import.meta.url));
  assert.equal(readFileSync(file, "utf8"), KEY);
});
