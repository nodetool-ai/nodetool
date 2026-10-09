/**
 * Journey: a storyboard on a phone.
 *
 * Crossing the phone breakpoint (rotating a tablet, narrowing a window) must
 * not remount the board, or an open shot editor loses its unsaved draft. At
 * phone width the board scrolls up and down only, and its tools fold into one
 * row of icons above the two render buttons.
 */

import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { StoryboardPage } from "./pages";

test.use({ hasTouch: true });

test("a shot draft survives the phone breakpoint and the board fits the phone", async ({
  page,
  request
}) => {
  const upload = await request.post("/api/assets", {
    multipart: {
      file: {
        name: "product.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile(
          new URL(
            "../../../packages/websocket/tests/fixtures/price-drop/product.jpg",
            import.meta.url
          )
        )
      }
    }
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const asset: { id: string } = await upload.json();
  const still = { type: "image", asset_id: asset.id, uri: `asset://${asset.id}` };
  const created = await request.post("/trpc/storyboards.create", {
    data: {
      name: "Phone Board",
      document: {
        screenplay: null,
        brief: "A chase",
        style: "neon noir",
        aspectRatio: "16:9",
        directorModel: null,
        imageModel: null,
        videoModel: null,
        setupStage: "done",
        shots: [
          {
            type: "shot",
            id: "rendered",
            index: 0,
            action: "The hero runs through a rainy street",
            status: "keyframe_ready",
            keyframe: still,
            keyframe_versions: [still]
          },
          {
            type: "shot",
            id: "planned",
            index: 1,
            action: "A train pulls away",
            status: "planned"
          }
        ]
      }
    }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const boardId: string = (await created.json()).result.data.id;

  // Open the editor on a wide screen and leave a draft in it.
  await page.setViewportSize({ width: 1400, height: 900 });
  const storyboard = new StoryboardPage(page);
  await storyboard.open("Phone Board");
  await storyboard
    .firstShot()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const draft = "The hero sprints through a neon alley";
  await storyboard.shotEditor().getByRole("textbox").first().fill(draft);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "Board" })).toBeVisible();
  await expect(
    storyboard.shotEditor().getByRole("textbox").first()
  ).toHaveValue(draft);

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("storyboards.update") &&
      response.request().method() === "POST"
  );
  await storyboard
    .shotEditor()
    .getByRole("button", { name: "Save", exact: true })
    .click();
  expect((await saved).ok()).toBe(true);
  const reloaded = await request.get(
    `/trpc/storyboards.get?input=${encodeURIComponent(JSON.stringify({ id: boardId }))}`
  );
  expect((await reloaded.json()).result.data.document.shots[0].action).toBe(
    draft
  );

  await storyboard
    .shotEditor()
    .getByRole("button", { name: "Back to storyboard" })
    .click();
  await expect(storyboard.firstShot()).toBeVisible();

  // One row of tools, no card size slider, labelled render buttons.
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add shot" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Render stills/ })
  ).toBeVisible();

  // The board pans up and down, never sideways.
  const widths = await page.locator(".storyboard-board").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
});
