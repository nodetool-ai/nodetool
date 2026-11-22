import { test, expect } from "@playwright/test";
import { LOCALES, SWITCH_LABELS, TRANSLATED_ROUTES, type Locale } from "../../src/i18n/routes";
import { localizedPages } from "../../src/i18n/pages";
import { storyboards } from "../../src/data/storyboards";
import { adRecipes } from "../../src/data/adLibrary";
import { recipeEntries } from "../../src/data/recipes";
import { modelEntries } from "../../src/data/modelEntries";
import * as ja from "../../src/i18n/ja/catalog";
import * as ko from "../../src/i18n/ko/catalog";

/*
 * /ja/<route> and /ko/<route>: the same key pages as /zh, checked the same
 * way. zh-pages.spec.ts holds the checks only the Chinese pages need.
 */

const LOCALES_UNDER_TEST = ["ja", "ko"] as const satisfies readonly Locale[];

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

function mainOf(html: string): string {
  return html.match(/<main\b[\s\S]*<\/main>/i)?.[0] ?? "";
}

const expected = (route: string) => ({
  en: `https://nodetool.ai${route}`,
  ...Object.fromEntries(
    (Object.keys(LOCALES) as Locale[])
      .filter((locale) => TRANSLATED_ROUTES[locale].includes(route))
      .map((locale) => [LOCALES[locale].hreflang.toLowerCase(), `https://nodetool.ai/${locale}${route}`])
  ),
  "x-default": `https://nodetool.ai${route}`,
});

const CATALOGS = {
  ja: { storyboards: ja.JA_STORYBOARDS, ads: ja.JA_AD_LIBRARY, recipes: ja.JA_RECIPES, modality: ja.JA_MODALITY },
  ko: { storyboards: ko.KO_STORYBOARDS, ads: ko.KO_AD_LIBRARY, recipes: ko.KO_RECIPES, modality: ko.KO_MODALITY },
};

for (const locale of LOCALES_UNDER_TEST) {
  const routes = TRANSLATED_ROUTES[locale];

  test(`${locale}: every translated route has content, and every content file a route`, () => {
    expect(localizedPages(locale).map((page) => page.route).sort()).toEqual([...routes].sort());
  });

  test(`${locale}: every catalog entry the pages list has a translated title`, () => {
    const catalog = CATALOGS[locale];
    for (const board of storyboards) expect(catalog.storyboards[board.slug], board.slug).toBeDefined();
    for (const ad of adRecipes) expect(catalog.ads[ad.slug], ad.slug).toBeDefined();
    for (const recipe of recipeEntries) expect(catalog.recipes[recipe.slug], recipe.slug).toBeDefined();
    for (const model of modelEntries) expect(catalog.modality[model.modality], model.modality).toBeDefined();
  });

  test(`${locale}: no page carries the mainland China settings`, () => {
    for (const page of localizedPages(locale)) {
      expect(JSON.stringify(page), page.route).not.toMatch(/_REGION|HF_ENDPOINT|国际版/);
    }
  });

  test(`${locale}: each page is marked with its language, shows its h1, and pairs with its English page`, async ({ request }) => {
    const lang = LOCALES[locale].hreflang;
    for (const page of localizedPages(locale)) {
      const res = await request.get(`/${locale}${page.route}`);
      expect(res.status(), page.route).toBe(200);
      const html = await res.text();
      expect(html, page.route).toMatch(new RegExp(`<main[^>]*\\blang="${lang}"`));
      expect(html, page.route).toContain(page.hero.h1);
      expect(alternates(html), `/${locale}${page.route} hreflang`).toEqual(expected(page.route));
      expect(html, page.route).toContain(`<link rel="canonical" href="https://nodetool.ai/${locale}${page.route}"`);
      // Every {token} was filled.
      expect(mainOf(html), page.route).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  test(`${locale}: pages link the translated version of a page when one exists`, async ({ request }) => {
    for (const route of routes) {
      const main = mainOf(await (await request.get(`/${locale}${route}`)).text());
      for (const target of routes) {
        const plain = new RegExp(`<a href="${target}"(?![^>]*hrefLang="en")`, "i");
        expect(main, `/${locale}${route} → ${target}`).not.toMatch(plain);
      }
    }
  });

  test(`${locale}: the header switches language in both directions`, async ({ request }) => {
    const lang = LOCALES[locale].hreflang;
    const english = await (await request.get("/studio")).text();
    expect(english).toMatch(
      new RegExp(`<a href="/${locale}/studio" hrefLang="${lang}" lang="${lang}"[^>]*>${SWITCH_LABELS[locale]}</a>`, "i")
    );
    const translated = await (await request.get(`/${locale}/studio`)).text();
    expect(translated).toMatch(/<a href="\/studio" hrefLang="en" lang="en"[^>]*>English<\/a>/i);
    expect(translated).toContain(`href="/${locale}/pricing"`);
  });

  test(`${locale}: the language overview links the translated pages`, async ({ request }) => {
    const main = mainOf(await (await request.get(`/${locale}`)).text());
    expect(main).toContain(`href="/${locale}/studio"`);
    expect(main).toContain(`href="/${locale}/storyboards"`);
  });

  test(`${locale}: the sitemap lists each page with all its language versions`, async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const route of routes) {
      const block =
        xml.match(new RegExp(`<url>\\s*<loc>https://nodetool\\.ai/${locale}${route}</loc>[\\s\\S]*?</url>`))?.[0] ?? "";
      expect(block, `/${locale}${route} in sitemap`).not.toBe("");
      for (const lang of Object.keys(expected(route))) {
        expect(block, `/${locale}${route} sitemap ${lang}`).toMatch(new RegExp(`hreflang="${lang}"`, "i"));
      }
    }
  });
}
