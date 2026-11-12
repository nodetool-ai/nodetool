import { test, expect } from "@playwright/test";
import { competitors } from "../../src/data/competitorEntries";
import { STORYBOARD_FAQ } from "../../src/data/storyboards";
import { MARKETING_FAQ } from "../../src/data/marketingPage";

/** Every FAQPage question emitted by the page's JSON-LD. */
async function faqSchemaQuestions(
  page: import("@playwright/test").Page
): Promise<string[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks
    .map((text) => JSON.parse(text))
    .filter((data) => data["@type"] === "FAQPage")
    .flatMap((data) =>
      data.mainEntity.map((item: { name: string }) => item.name)
    );
}

test("ComfyUI alternatives list answers with platform and licence", async ({
  page
}) => {
  const comfy = competitors.find((c) => c.slug === "comfyui");
  expect(comfy?.listAnswer).toBeTruthy();
  expect(comfy?.otherTools?.tools.length).toBeGreaterThan(0);
  await page.goto("/alternatives/comfyui");
  await expect(page.getByText(comfy!.listAnswer!)).toBeVisible();
  await expect(
    page.getByText("macOS, Windows, Linux, or self-hosted · Open source (AGPL-3.0)")
  ).toBeVisible();
  for (const tool of comfy!.otherTools!.tools) {
    await expect(page.getByText(tool.facts).first()).toBeVisible();
    await expect(page.locator(`a[href="${tool.source}"]`).first()).toBeVisible();
  }
  await expect(
    page.getByText(`checked ${comfy!.otherTools!.checked}`)
  ).toBeVisible();
});

test("storyboards h1 names the category and the FAQ reaches the schema", async ({
  page
}) => {
  await page.goto("/storyboards");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "AI storyboard generator"
  );
  const questions = await faqSchemaQuestions(page);
  for (const row of STORYBOARD_FAQ) {
    await expect(page.getByText(row.question)).toBeVisible();
    expect(questions).toContain(row.question);
  }
});

test("marketing FAQ is visible and in the schema", async ({ page }) => {
  await page.goto("/marketing");
  const questions = await faqSchemaQuestions(page);
  for (const row of MARKETING_FAQ) {
    await expect(page.getByText(row.question)).toBeVisible();
    expect(questions).toContain(row.question);
  }
});

test("templates page has a mini apps section", async ({ page }) => {
  await page.goto("/templates");
  await expect(page).toHaveTitle(/Mini Apps/);
  await expect(
    page.getByRole("heading", { level: 2, name: "AI mini apps" })
  ).toBeVisible();
});

test("movie poster h1 uses the searched phrase", async ({ page }) => {
  await page.goto("/use-cases/movie-poster");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI Movie Poster Generator"
  );
});
