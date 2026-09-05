import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("older pages preserve the viewport with real variable-height virtual rows", async ({ page }) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./chat-history-fixture.tsx", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "scroll-tokens",
      setup(builder) {
        // Exercise the real hook and virtualizer without loading unrelated UI.
        builder.onResolve({ filter: /ui_primitives$/ }, () => ({
          path: fileURLToPath(new URL("../../src/components/ui_primitives/spacing.ts", import.meta.url))
        }));
      }
    }]
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await expect.poll(async () => page.locator('[data-id="199"]').evaluate((row) => row.getBoundingClientRect().bottom)).toBeLessThanOrEqual(510);
  await expect(page.locator("body")).not.toHaveAttribute("data-requests");
  await page.locator("#host").evaluate((host) => {
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
    host.scrollTop = 100;
  });
  await expect(page.locator("body")).toHaveAttribute("data-requests", "1");
  const anchor = page.locator('[data-id="100"]');
  const before = await anchor.evaluate((row) => row.getBoundingClientRect().top);
  await page.evaluate(() => window.dispatchEvent(new Event("history-page")));
  await expect(page.locator("#host")).toHaveAttribute("data-count", "200");
  await expect.poll(async () => Math.abs(await anchor.evaluate((row) => row.getBoundingClientRect().top) - before)).toBeLessThanOrEqual(1);
  await expect(page.locator("#host")).toHaveAttribute("data-scroll-mode", "free-scrolling");
  await expect(page.locator("body")).toHaveAttribute("data-requests", "1");
});
