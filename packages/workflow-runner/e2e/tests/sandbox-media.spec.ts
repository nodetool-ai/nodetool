import { expect, test } from "@playwright/test";

test("composes and transforms media through browser WebCodecs", async ({
  page
}) => {
  test.setTimeout(120_000);
  page.on("pageerror", (error) => {
    console.log("[browser pageerror]", error.message);
  });
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (window as unknown as { workflowRunnerReady?: boolean })
        .workflowRunnerReady === true,
    null,
    { timeout: 15_000 }
  );

  const outcome = await page.evaluate(() =>
    window.runSandboxMediaInBrowser()
  );

  expect(outcome.error).toBeUndefined();
  expect(outcome.success).toBe(true);
  expect(outcome.result).toMatchObject({
    combined: { type: "video", mimeType: "video/mp4" },
    trimmed: { type: "video", mimeType: "video/mp4" },
    frame: { type: "image", mimeType: "image/png" },
    info: { width: 16, height: 16, has_audio: true }
  });
});
