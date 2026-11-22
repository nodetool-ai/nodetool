import { test, expect } from "@playwright/test";
import { storyboards } from "../../src/data/storyboards";
import { adRecipes } from "../../src/data/adLibrary";
import { recipeEntries } from "../../src/data/recipes";
import { adText, recipeText, storyboardText, textShape } from "../../src/i18n/details";
import { DETAIL_TEXT } from "../../src/i18n/detailPages";
import { ZH_AD_LABELS } from "../../src/i18n/zh/detailLabels";

/*
 * /zh/storyboards/<slug>, /zh/recipes/<slug> and /zh/ad-library/<slug>. Each
 * translation must keep the shape of its English text, so a new shot, beat or
 * step, or a removed one, fails here until the translation follows.
 */

const zh = DETAIL_TEXT.zh;

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

test("every storyboard, recipe and ad concept has a Chinese translation of the same shape", () => {
  expect(Object.keys(zh.storyboards).sort()).toEqual(storyboards.map((b) => b.slug).sort());
  expect(Object.keys(zh.recipes).sort()).toEqual(recipeEntries.map((r) => r.slug).sort());
  expect(Object.keys(zh.adLibrary).sort()).toEqual(adRecipes.map((a) => a.slug).sort());
  for (const board of storyboards) {
    expect(textShape(zh.storyboards[board.slug]), board.slug).toEqual(textShape(storyboardText(board)));
  }
  for (const recipe of recipeEntries) {
    expect(textShape(zh.recipes[recipe.slug]), recipe.slug).toEqual(textShape(recipeText(recipe)));
  }
  for (const ad of adRecipes) {
    expect(textShape(zh.adLibrary[ad.slug]), ad.slug).toEqual(textShape(adText(ad)));
  }
});

test("every beat role, copy slot, goal and complexity has a Chinese label", () => {
  const keys = ZH_AD_LABELS.keys;
  for (const ad of adRecipes) {
    expect(keys[ad.selection.goal], ad.selection.goal).toBeDefined();
    expect(ZH_AD_LABELS.complexityLevels[ad.selection.complexity], ad.selection.complexity).toBeDefined();
    for (const beat of ad.beats) expect(keys[beat.role], beat.role).toBeDefined();
    for (const slot of ad.copy_slots) expect(keys[slot.id], slot.id).toBeDefined();
  }
});

const pages = [
  ...storyboards.map((b) => ({ route: b.route, h1: zh.storyboards[b.slug].title })),
  ...recipeEntries.map((r) => ({ route: r.route, h1: zh.recipes[r.slug].name })),
  ...adRecipes.map((a) => ({ route: a.route, h1: zh.adLibrary[a.slug].title })),
];

test("each Chinese detail page is marked zh-Hans, shows its title, and pairs with its English page", async ({ request }) => {
  for (const { route, h1 } of pages) {
    const res = await request.get(`/zh${route}`);
    expect(res.status(), route).toBe(200);
    const html = await res.text();
    expect(html, route).toMatch(/<main[^>]*\blang="zh-Hans"/);
    expect(decode(html), route).toContain(h1);
    const expected = {
      en: `https://nodetool.ai${route}`,
      "zh-hans": `https://nodetool.ai/zh${route}`,
      "x-default": `https://nodetool.ai${route}`,
    };
    expect(alternates(html), `/zh${route} hreflang`).toEqual(expected);
    expect(html, route).toContain(`<link rel="canonical" href="https://nodetool.ai/zh${route}"`);
    const english = await (await request.get(route)).text();
    expect(alternates(english), `${route} hreflang`).toEqual(expected);
  }
});

test("a Chinese detail page links Chinese pages and switches back to English", async ({ request }) => {
  const board = storyboards[0];
  const html = await (await request.get(`/zh${board.route}`)).text();
  expect(html).toContain('href="/zh/storyboards"');
  expect(html).toContain('href="/zh/download"');
  expect(html).toMatch(new RegExp(`<a href="${board.route}" hrefLang="en" lang="en"[^>]*>English</a>`, "i"));
  const english = await (await request.get(board.route)).text();
  expect(english).toMatch(new RegExp(`<a href="/zh${board.route}" hrefLang="zh-Hans" lang="zh-Hans"[^>]*>中文</a>`, "i"));
  // The /zh catalogs now open the Chinese detail pages.
  const catalog = await (await request.get("/zh/storyboards")).text();
  expect(catalog).toContain(`href="/zh${board.route}"`);
});
