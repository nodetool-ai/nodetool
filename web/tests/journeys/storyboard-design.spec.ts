import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { StoryboardPage } from "./pages";

test("Storyboard reviews exact composed graphics and saves semantic edits without generation", async ({
  page,
  request
}, testInfo) => {
  const upload = async (file: string, mimeType: string) => {
    const response = await request.post("/api/assets", {
      multipart: {
        file: {
          name: file,
          mimeType,
          buffer: await readFile(
            new URL(
              `../../../packages/websocket/tests/fixtures/price-drop/${file}`,
              import.meta.url
            )
          )
        }
      }
    });
    expect(response.ok(), await response.text()).toBe(true);
    const asset: { id: string } = await response.json();
    return asset.id;
  };
  const productId = await upload("product.jpg", "image/jpeg");
  const logoId = await upload("logo.svg", "image/svg+xml");
  const response = await request.post("/trpc/storyboards.create", {
    data: {
      name: "Design Frame Journey",
      document: {
        screenplay: null,
        brief: "Price drop",
        style: "bold",
        aspectRatio: "9:16",
        directorModel: null,
        imageModel: null,
        videoModel: null,
        setupStage: "done",
        shots: [
          {
            type: "shot",
            id: "hook",
            index: 0,
            slug: "Hook",
            action: "Exact sale",
            status: "planned",
            duration_seconds: 4,
            production: {
              media_strategy: "still_motion_graphics",
              protected_inputs: [
                {
                  id: "product",
                  kind: "product",
                  asset_id: productId,
                  allowed_transformations: ["position", "scale", "opacity"]
                },
                {
                  id: "logo",
                  kind: "logo",
                  asset_id: logoId,
                  allowed_transformations: ["position", "scale", "opacity"]
                }
              ]
            },
            graphics: {
              mode: "graphics_first",
              elements: [
                { id: "background", kind: "shape" },
                {
                  id: "product",
                  kind: "asset",
                  role: "product",
                  protected_input_id: "product"
                },
                {
                  id: "logo",
                  kind: "asset",
                  role: "logo",
                  protected_input_id: "logo"
                },
                {
                  id: "headline",
                  kind: "text",
                  role: "headline",
                  text: "Save €20"
                }
              ]
            }
          }
        ]
      }
    }
  });
  expect(response.ok(), await response.text()).toBe(true);
  const boardId: string = (await response.json()).result.data.id;
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/generate|render_shot|generations/.test(request.url())
    )
      generationRequests.push(request.url());
  });
  const storyboard = new StoryboardPage(page);
  await storyboard.open("Design Frame Journey");
  const card = storyboard.firstShot();
  const preview = card.getByTestId("preview-compositor");
  await expect(preview).toHaveAttribute("data-preview-ready", "true", {
    timeout: 60_000
  });
  await expect(preview.locator("canvas").first()).toBeVisible();
  await preview.screenshot({
    path: testInfo.outputPath("storyboard-composited-design.png")
  });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = storyboard.shotEditor();
  await expect(
    editor.getByRole("button", { name: "Save", exact: true })
  ).toBeDisabled();
  await editor
    .getByRole("textbox", { name: "Exact text: headline", exact: true })
    .fill("  Save €25  ");
  await expect(
    editor.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled();
  await expect(editor.getByTestId("preview-compositor")).toHaveAttribute(
    "data-preview-ready",
    "true",
    { timeout: 60_000 }
  );
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("storyboards.update") &&
      response.request().method() === "POST"
  );
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  const reloaded = await request.get(
    `/trpc/storyboards.get?input=${encodeURIComponent(JSON.stringify({ id: boardId }))}`
  );
  expect(reloaded.ok()).toBe(true);
  const stored = (await reloaded.json()).result.data.document.shots[0];
  expect(
    stored.graphics.elements.find(
      (element: { id: string }) => element.id === "headline"
    ).text
  ).toBe("  Save €25  ");
  expect(
    stored.production.protected_inputs.map(
      (input: { asset_id: string }) => input.asset_id
    )
  ).toEqual([productId, logoId]);
  expect(stored.keyframe ?? null).toBeNull();
  expect(stored.clip ?? null).toBeNull();
  expect(generationRequests).toEqual([]);
});
