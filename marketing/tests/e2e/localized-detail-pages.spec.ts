import { test, expect } from "@playwright/test";
import { storyboards } from "../../src/data/storyboards";
import { adRecipes } from "../../src/data/adLibrary";
import { recipeEntries } from "../../src/data/recipes";
import { adText, recipeText, storyboardText, textShape } from "../../src/i18n/details";
import { DETAIL_LOCALES, DETAIL_TEXT } from "../../src/i18n/detailPages";
import { LOCALES, SWITCH_LABELS, type Locale } from "../../src/i18n/routes";
import { ZH_AD_LABELS } from "../../src/i18n/zh/detailLabels";
import { JA_AD_LABELS } from "../../src/i18n/ja/detailLabels";
import type { AdLabels } from "../../src/i18n/detailLabels";

/*
 * /<locale>/storyboards/<slug>, /<locale>/recipes/<slug> and
 * /<locale>/ad-library/<slug> in Simplified Chinese and Japanese. Each
 * translation must keep the shape of its English text, so a new shot, beat or
 * step, or a removed one, fails here until the translation follows.
 */

const AD_LABELS: Record<string, AdLabels> = { zh: ZH_AD_LABELS, ja: JA_AD_LABELS };

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

const decode = (html: string) =>
  html.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Every detail page has the same translations, so one set of alternates. */
function expectedAlternates(route: string): Record<string, string> {
  return {
    en: `https://nodetool.ai${route}`,
    ...Object.fromEntries(
      DETAIL_LOCALES.map((locale) => [LOCALES[locale].hreflang.toLowerCase(), `https://nodetool.ai/${locale}${route}`])
    ),
    "x-default": `https://nodetool.ai${route}`,
  };
}

test("detail pages are translated into Chinese and Japanese", () => {
  expect([...DETAIL_LOCALES].sort()).toEqual(["ja", "zh"]);
});

for (const locale of DETAIL_LOCALES as Locale[]) {
  const text = DETAIL_TEXT[locale]!;
  const { hreflang } = LOCALES[locale];

  test(`${locale}: every storyboard, recipe and ad concept has a translation of the same shape`, () => {
    expect(Object.keys(text.storyboards).sort()).toEqual(storyboards.map((b) => b.slug).sort());
    expect(Object.keys(text.recipes).sort()).toEqual(recipeEntries.map((r) => r.slug).sort());
    expect(Object.keys(text.adLibrary).sort()).toEqual(adRecipes.map((a) => a.slug).sort());
    for (const board of storyboards) {
      expect(textShape(text.storyboards[board.slug]), board.slug).toEqual(textShape(storyboardText(board)));
    }
    for (const recipe of recipeEntries) {
      expect(textShape(text.recipes[recipe.slug]), recipe.slug).toEqual(textShape(recipeText(recipe)));
    }
    for (const ad of adRecipes) {
      expect(textShape(text.adLibrary[ad.slug]), ad.slug).toEqual(textShape(adText(ad)));
    }
  });

  test(`${locale}: every beat role, copy slot, goal and complexity has a label`, () => {
    const labels = AD_LABELS[locale];
    for (const ad of adRecipes) {
      expect(labels.keys[ad.selection.goal], ad.selection.goal).toBeDefined();
      expect(labels.complexityLevels[ad.selection.complexity], ad.selection.complexity).toBeDefined();
      for (const beat of ad.beats) expect(labels.keys[beat.role], beat.role).toBeDefined();
      for (const slot of ad.copy_slots) expect(labels.keys[slot.id], slot.id).toBeDefined();
    }
  });

  const pages = [
    ...storyboards.map((b) => ({ route: b.route, h1: text.storyboards[b.slug].title })),
    ...recipeEntries.map((r) => ({ route: r.route, h1: text.recipes[r.slug].name })),
    ...adRecipes.map((a) => ({ route: a.route, h1: text.adLibrary[a.slug].title })),
  ];

  test(`${locale}: each detail page is marked ${hreflang}, shows its title, and pairs with its English page`, async ({ request }) => {
    for (const { route, h1 } of pages) {
      const res = await request.get(`/${locale}${route}`);
      expect(res.status(), route).toBe(200);
      const html = await res.text();
      expect(html, route).toMatch(new RegExp(`<main[^>]*\\blang="${hreflang}"`));
      expect(decode(html), route).toContain(h1);
      const expected = expectedAlternates(route);
      expect(alternates(html), `/${locale}${route} hreflang`).toEqual(expected);
      expect(html, route).toContain(`<link rel="canonical" href="https://nodetool.ai/${locale}${route}"`);
      const english = await (await request.get(route)).text();
      expect(alternates(english), `${route} hreflang`).toEqual(expected);
    }
  });

  test(`${locale}: a detail page links translated pages and switches back to English`, async ({ request }) => {
    const board = storyboards[0];
    const html = await (await request.get(`/${locale}${board.route}`)).text();
    expect(html).toContain(`href="/${locale}/storyboards"`);
    expect(html).toContain(`href="/${locale}/download"`);
    expect(html).toMatch(new RegExp(`<a href="${board.route}" hrefLang="en" lang="en"[^>]*>English</a>`, "i"));
    const english = await (await request.get(board.route)).text();
    expect(english).toMatch(
      new RegExp(`<a href="/${locale}${board.route}" hrefLang="${hreflang}" lang="${hreflang}"[^>]*>${SWITCH_LABELS[locale]}</a>`, "i")
    );
    // The translated catalogs open the translated detail pages.
    const catalog = await (await request.get(`/${locale}/storyboards`)).text();
    expect(catalog).toContain(`href="/${locale}${board.route}"`);
  });
}
