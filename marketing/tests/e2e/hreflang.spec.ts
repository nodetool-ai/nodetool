import { test, expect } from "@playwright/test";

/** hreflang alternates as { lang: href } from a page's <head>. */
function alternates(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    const lang = tag.match(/hrefLang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (lang && href) out[lang.toLowerCase()] = href;
  }
  return out;
}

const EXPECTED = {
  en: "https://nodetool.ai",
  ja: "https://nodetool.ai/ja",
  "x-default": "https://nodetool.ai",
};

test("home and /ja list each other as hreflang alternates", async ({ request }) => {
  for (const route of ["/", "/ja"]) {
    const html = await (await request.get(route)).text();
    const found = alternates(html);
    for (const [lang, href] of Object.entries(EXPECTED)) {
      expect(found[lang]?.replace(/\/$/, ""), `${route} hreflang ${lang}`).toBe(href);
    }
  }
});

test("/ja marks its content as Japanese and other routes carry no hreflang", async ({ request }) => {
  const ja = await (await request.get("/ja")).text();
  expect(ja).toMatch(/<main[^>]*\blang="ja"/);
  expect(ja).toContain("AI映画を、ショットごとに演出する。");
  const studio = await (await request.get("/studio")).text();
  expect(Object.keys(alternates(studio))).toHaveLength(0);
});

test("the sitemap lists both language versions for / and /ja", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const block = xml.match(/<url>\s*<loc>https:\/\/nodetool\.ai\/ja<\/loc>[\s\S]*?<\/url>/)?.[0] ?? "";
  expect(block).toContain('hreflang="en"');
  expect(block).toContain('hreflang="ja"');
});
