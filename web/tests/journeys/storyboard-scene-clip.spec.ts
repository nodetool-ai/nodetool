/**
 * Journey: a scene clip on a storyboard.
 *
 * A board stores scene clips on its document, so a saved run survives the
 * server round trip. The scene header names the clip and its state, every
 * card in the run carries its part of the clip, and the dialog fits a phone.
 */

import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { StoryboardPage } from "./pages";

test.use({ hasTouch: true });

const SCREENSHOTS = process.env.NODETOOL_JOURNEY_SCREENSHOTS;

test("a saved scene clip shows on its scene and opens at phone width", async ({
  page,
  request
}) => {
  const image = await readFile(
    new URL(
      "../../../packages/websocket/tests/fixtures/price-drop/product.jpg",
      import.meta.url
    )
  );
  const stills = [];
  for (const name of ["one.jpg", "two.jpg"]) {
    const upload = await request.post("/api/assets", {
      multipart: { file: { name, mimeType: "image/jpeg", buffer: image } }
    });
    expect(upload.ok(), await upload.text()).toBe(true);
    const asset: { id: string } = await upload.json();
    stills.push({ type: "image", asset_id: asset.id, uri: `asset://${asset.id}` });
  }
  const shot = (id: string, index: number, action: string, still?: object) => ({
    type: "shot",
    id,
    index,
    action,
    duration_seconds: 4,
    status: still ? "keyframe_ready" : "planned",
    ...(still && { keyframe: still, keyframe_versions: [still] })
  });
  const created = await request.post("/trpc/storyboards.create", {
    data: {
      name: "Scene Clip Board",
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
          shot("door", 0, "She bursts through the door", stills[0]),
          shot("hall", 1, "She runs down the hallway", stills[1]),
          shot("window", 2, "She leaps through the window")
        ],
        scene_clips: [
          { id: "clip-1", prompt: "One handheld move.", shot_ids: ["door", "hall"] }
        ]
      }
    }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const boardId: string = (await created.json()).result.data.id;
  const stored = await request.get(
    `/trpc/storyboards.get?input=${encodeURIComponent(JSON.stringify({ id: boardId }))}`
  );
  expect((await stored.json()).result.data.document.scene_clips).toEqual([
    { id: "clip-1", prompt: "One handheld move.", shot_ids: ["door", "hall"] }
  ]);

  await page.setViewportSize({ width: 1400, height: 900 });
  const storyboard = new StoryboardPage(page);
  await storyboard.open("Scene Clip Board");
  const clipButton = page.getByRole("button", {
    name: "Shots 1–2 · not rendered"
  });
  await expect(clipButton).toBeVisible();
  await expect(page.getByTestId("shot-scene-clip-tag")).toHaveText([
    "Clip 1/2 · 0-4s",
    "Clip 2/2 · 4-8s"
  ]);
  if (SCREENSHOTS) {
    await page.screenshot({ path: `${SCREENSHOTS}/scene-clip-desktop.png` });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(clipButton).toBeVisible();
  if (SCREENSHOTS) {
    await page.screenshot({ path: `${SCREENSHOTS}/scene-clip-phone-board.png` });
  }
  await clipButton.click();
  const dialog = page.getByTestId("scene-clip-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue(
    "One handheld move."
  );
  // The board has no video model yet, so the dialog says so and holds.
  await expect(dialog.getByText("No video model chosen.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Render scene clip/ })
  ).toBeDisabled();
  const widths = await page
    .getByRole("dialog")
    .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
  if (SCREENSHOTS) {
    await page.screenshot({ path: `${SCREENSHOTS}/scene-clip-phone-dialog.png` });
  }
});
