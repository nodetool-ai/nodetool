import { test, expect } from "@playwright/test";
import { TRANSLATED_ROUTES, type Locale } from "../../src/i18n/routes";

/*
 * What every Chinese, Japanese and Korean page needs beyond its translation:
 * the document language, CJK fonts without negative tracking, and a share
 * card and keywords in the reader's language.
 */

const CASES: { locale: Locale; lang: string; script: RegExp }[] = [
  { locale: "zh", lang: "zh-Hans", script: /[一-鿿]/ },
  { locale: "ja", lang: "ja", script: /[぀-ヿ]/ },
  { locale: "ko", lang: "ko", script: /[가-힯]/ },
];

for (const { locale, lang, script } of CASES) {
  const routes = [`/${locale}`, `/${locale}${TRANSLATED_ROUTES[locale][0]}`];

  for (const path of routes) {
    test(`${path} sets the document language, CJK fonts and normal tracking`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      const h1 = page.locator("h1").first();
      const style = await h1.evaluate((el) => {
        const css = getComputedStyle(el);
        return { family: css.fontFamily, spacing: css.letterSpacing };
      });
      expect(style.family).toMatch(/Noto Sans CJK|Microsoft YaHei|Hiragino|Malgun/);
      expect(style.spacing).toBe("normal");
    });

    test(`${path} shares a card and keywords in its language`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      expect(html).toContain(`<meta property="og:image" content="https://nodetool.ai/preview-${locale}.png"/>`);
      const keywords = html.match(/<meta name="keywords" content="([^"]+)"/)?.[1] ?? "";
      expect(keywords).toMatch(script);
    });
  }
}

test("English pages keep lang=en and the English share card", async ({ page, request }) => {
  await page.goto("/studio");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const html = await (await request.get("/studio")).text();
  expect(html).not.toMatch(/preview-(zh|ja|ko)\.png/);
});
