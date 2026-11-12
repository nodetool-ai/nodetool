import { test, expect } from "@playwright/test";
import { LANGUAGE_PAGES } from "../../src/data/languagePages";

/** hreflang alternates as { lang: href } from a page's <head>. */
function alternates(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    const lang = tag.match(/hrefLang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (lang && href) out[lang.toLowerCase()] = href.replace(/\/$/, "");
  }
  return out;
}

const PAGES = Object.values(LANGUAGE_PAGES);
const EXPECTED: Record<string, string> = {
  en: "https://nodetool.ai",
  "x-default": "https://nodetool.ai",
  ...Object.fromEntries(PAGES.map((page) => [page.hreflang.toLowerCase(), `https://nodetool.ai${page.path}`])),
};

test("there are five language pages", () => {
  expect(PAGES.map((page) => page.path).sort()).toEqual(["/es", "/hi", "/ja", "/pt", "/zh"]);
});

test("home and every language page list all versions as hreflang alternates", async ({ request }) => {
  for (const route of ["/", ...PAGES.map((page) => page.path)]) {
    const html = await (await request.get(route)).text();
    expect(alternates(html), `${route} hreflang`).toEqual(EXPECTED);
  }
});

test("each language page marks its content with its language and shows its own h1", async ({ request }) => {
  for (const page of PAGES) {
    const html = await (await request.get(page.path)).text();
    expect(html, page.path).toMatch(new RegExp(`<main[^>]*\\blang="${page.hreflang}"`));
    expect(html, page.path).toContain(page.h1);
  }
  const studio = await (await request.get("/studio")).text();
  expect(Object.keys(alternates(studio))).toHaveLength(0);
});

test("the sitemap lists every language version for each language page", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const page of PAGES) {
    const block = xml.match(new RegExp(`<url>\\s*<loc>https://nodetool\\.ai${page.path}</loc>[\\s\\S]*?</url>`))?.[0] ?? "";
    for (const lang of Object.keys(EXPECTED)) {
      expect(block, `${page.path} sitemap ${lang}`).toMatch(new RegExp(`hreflang="${lang}"`, "i"));
    }
  }
});

test("the footer links every language page", async ({ request }) => {
  const html = await (await request.get("/")).text();
  for (const page of PAGES) {
    expect(html, page.path).toContain(`href="${page.path}"`);
  }
});
