import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { TRANSLATED_ROUTES } from "../../src/i18n/routes";
import { localizedPages } from "../../src/i18n/pages";
import { storyboards } from "../../src/data/storyboards";
import { adRecipes } from "../../src/data/adLibrary";
import { recipeEntries } from "../../src/data/recipes";
import { ZH_AD_LIBRARY, ZH_RECIPES, ZH_STORYBOARDS } from "../../src/i18n/zh/catalog";
import { HF_NOTE, MAINLAND_KEYS } from "../../src/i18n/zh/shared";

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

/** The <main> element, without the shared header and footer. */
function mainOf(html: string): string {
  return html.match(/<main\b[\s\S]*<\/main>/i)?.[0] ?? "";
}

const ROUTES = TRANSLATED_ROUTES.zh;
const expected = (route: string) => ({
  en: `https://nodetool.ai${route}`,
  "zh-hans": `https://nodetool.ai/zh${route}`,
  "x-default": `https://nodetool.ai${route}`,
});

test("every translated route has content, and every content file a route", () => {
  expect(localizedPages("zh").map((page) => page.route).sort()).toEqual([...ROUTES].sort());
});

test("every catalog entry the Chinese pages list has a Chinese title", () => {
  for (const board of storyboards) expect(ZH_STORYBOARDS[board.slug], board.slug).toBeDefined();
  for (const ad of adRecipes) expect(ZH_AD_LIBRARY[ad.slug], ad.slug).toBeDefined();
  for (const recipe of recipeEntries) expect(ZH_RECIPES[recipe.slug], recipe.slug).toBeDefined();
});

test("each Chinese page is marked zh-Hans, shows its h1, and pairs with its English page", async ({ request }) => {
  for (const page of localizedPages("zh")) {
    const res = await request.get(`/zh${page.route}`);
    expect(res.status(), page.route).toBe(200);
    const html = await res.text();
    expect(html, page.route).toMatch(/<main[^>]*\blang="zh-Hans"/);
    expect(html, page.route).toContain(page.hero.h1);
    expect(alternates(html), `/zh${page.route} hreflang`).toEqual(expected(page.route));
    expect(html, page.route).toContain(`<link rel="canonical" href="https://nodetool.ai/zh${page.route}"`);

    const english = await (await request.get(page.route)).text();
    expect(alternates(english), `${page.route} hreflang`).toEqual(expected(page.route));
  }
});

test("Chinese pages link the translated version of a page when one exists", async ({ request }) => {
  for (const route of ROUTES) {
    const main = mainOf(await (await request.get(`/zh${route}`)).text());
    for (const target of ROUTES) {
      // Only the "read in English" link at the end may point at an English
      // page that has a translation, and it is marked hrefLang="en".
      const plain = new RegExp(`<a href="${target}"(?![^>]*hrefLang="en")`, "i");
      expect(main, `/zh${route} → ${target}`).not.toMatch(plain);
    }
  }
});

test("the header switches language in both directions", async ({ request }) => {
  const english = await (await request.get("/studio")).text();
  expect(english).toMatch(/<a href="\/zh\/studio" hrefLang="zh-Hans" lang="zh-Hans"[^>]*>中文<\/a>/i);
  const chinese = await (await request.get("/zh/studio")).text();
  expect(chinese).toMatch(/<a href="\/studio" hrefLang="en" lang="en"[^>]*>English<\/a>/i);
  // The nav on a Chinese page points at the Chinese pages.
  expect(chinese).toContain('href="/zh/pricing"');
  const untranslated = await (await request.get("/developers")).text();
  expect(untranslated).not.toContain(">中文</a>");
});

test("the sitemap lists each Chinese page with its English page", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const route of ROUTES) {
    for (const loc of [route, `/zh${route}`]) {
      const block =
        xml.match(new RegExp(`<url>\\s*<loc>https://nodetool\\.ai${loc}</loc>[\\s\\S]*?</url>`))?.[0] ?? "";
      expect(block, `${loc} in sitemap`).not.toBe("");
      for (const lang of ["en", "zh-Hans", "x-default"]) {
        expect(block, `${loc} sitemap ${lang}`).toMatch(new RegExp(`hreflang="${lang}"`, "i"));
      }
    }
  }
});

/*
 * ChatGPT and Claude plans are not sold in mainland China, so only /zh/pricing
 * mentions plan sign-in, once, after the keys a mainland reader can get.
 * BytePlus has no mainland host, so a sentence that names it next to
 * mainland access marks it 国际版.
 */
test("Chinese pages keep plan sign-in to pricing and mark BytePlus international", () => {
  for (const page of localizedPages("zh")) {
    const text = JSON.stringify(page);
    if (page.route !== "/pricing") {
      expect(text, page.route).not.toMatch(/ChatGPT 或 Claude 订阅|订阅登录/);
    }
    for (const sentence of text.split("。")) {
      if (/BytePlus/.test(sentence) && /国内|china|大陆/.test(sentence)) {
        expect(sentence, page.route).toContain("国际版");
      }
    }
  }
});

test("every setting the mainland notes name exists in the setting catalog", () => {
  const catalog = readFileSync(resolve(__dirname, "../../../packages/config/src/setting-catalog.ts"), "utf8");
  const names = `${MAINLAND_KEYS} ${HF_NOTE}`.match(/\b[A-Z][A-Z_]+_(?:REGION|ENDPOINT)\b/g) ?? [];
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(catalog, name).toContain(`"${name}"`);
});
