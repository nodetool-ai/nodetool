import { test, expect } from "@playwright/test";
import axe from "axe-core";

const REPRESENTATIVE_ROUTES = [
  "/",
  "/cloud",
  "/studio",
  "/agents",
  "/models",
  "/recipes/ugc-product-video",
];
const REDESIGNED_ROUTES = ["/cloud", "/studio", "/agents"];
const SMOKE_RULES = [
  "aria-allowed-attr",
  "aria-valid-attr-value",
  "button-name",
  "document-title",
  "duplicate-id-aria",
  "html-has-lang",
  "image-alt",
  "label",
  "link-name",
  "landmark-one-main",
  "page-has-heading-one",
];

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; html: string }>;
};

test.describe("marketing accessibility", () => {
  for (const route of REPRESENTATIVE_ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      await page.addScriptTag({ content: axe.source });

      const results = await page.evaluate(async (rules) => {
        const axeGlobal = (
          globalThis as unknown as {
            axe?: {
              run: (options?: {
                runOnly: { type: "rule"; values: string[] };
              }) => Promise<{ violations: AxeViolation[] }>;
            };
          }
        ).axe;
        if (!axeGlobal) {
          throw new Error("axe-core did not load into the page");
        }
        return axeGlobal.run({
          runOnly: { type: "rule", values: rules },
        });
      }, SMOKE_RULES);

      expect(results.violations, `${route} accessibility violations`).toEqual(
        []
      );
    });
  }

  for (const route of REDESIGNED_ROUTES) {
    test(`${route} meets automated color contrast checks`, async ({ page }) => {
      await page.goto(route);
      await page.addScriptTag({ content: axe.source });

      const violations = await page.evaluate(async () => {
        const axeGlobal = (
          globalThis as unknown as {
            axe?: {
              run: (options?: {
                runOnly: { type: "rule"; values: string[] };
              }) => Promise<{ violations: AxeViolation[] }>;
            };
          }
        ).axe;
        if (!axeGlobal) {
          throw new Error("axe-core did not load into the page");
        }
        const results = await axeGlobal.run({
          runOnly: { type: "rule", values: ["color-contrast"] },
        });
        return results.violations;
      });

      expect(violations, `${route} color contrast violations`).toEqual([]);
    });
  }
});
