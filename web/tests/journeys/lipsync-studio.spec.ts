import { readFile } from "node:fs/promises";
import { test, expect, waitForAppReady } from "./fixtures";

test("renders a consenting reference through speech and lipsync with the fake provider", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nodetool-last-models:v1",
      JSON.stringify({
        state: {
          byKind: {
            video: { provider: "openai", model: "test-video-model" },
            audio: {
              provider: "openai",
              model: "test-voice-model",
              voice: "alloy"
            }
          },
          byTask: {}
        },
        version: 0
      })
    );
  });
  await page.goto("/workspace", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await page.getByRole("button", { name: "Open or create a tab" }).click();
  await page.getByRole("menuitem", { name: /Lipsync/ }).click();
  const studio = page.getByTestId("lipsync-studio");
  await expect(studio).toBeVisible();
  await studio.locator('input[type="file"]').setInputFiles({
    name: "person.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(
      new URL(
        "../../../packages/websocket/tests/fixtures/price-drop/product.jpg",
        import.meta.url
      )
    )
  });
  await studio
    .getByRole("textbox", { name: "What should they say?" })
    .fill("Hello from NodeTool.");
  await studio
    .getByRole("checkbox", { name: "This is a real person", exact: true })
    .check();
  const render = studio.getByRole("button", { name: "Render lipsync" });
  await expect(render).toBeDisabled();
  await studio
    .getByRole("checkbox", { name: /I have this person's consent/ })
    .check();
  await expect(render).toBeEnabled();
  await render.click();
  await expect(studio.locator("video")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: /^Generations/ }).click();
  const generations = page.getByRole("list", { name: "Generations" });
  await expect(
    generations.getByRole("listitem").filter({ hasText: "test-video-model" })
  ).toHaveCount(1);
});
