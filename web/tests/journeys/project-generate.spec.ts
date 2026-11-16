import { rename } from "node:fs/promises";
import { join } from "node:path";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect } from "./fixtures";
import { AssetsPage, CreatePage, ProjectFilesPage } from "./pages";

/**
 * A project is a folder, and a generated image is one file in it. Generating
 * an image in a Create tab of the project writes it to `Generated/`. Files and
 * the asset browser show that file. Renaming it on disk, outside
 * NodeTool, keeps the asset and shows the new name.
 */
test("a generated image is a file in the project folder and keeps its asset when renamed on disk", async ({
  page
}) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })]
  });

  const project = await client.projects.create.mutate({ name: "Fox Film" });
  const folder = project.folder;
  expect(folder?.path, "creating a project creates its folder").toBeTruthy();
  // Generate an image in a Create tab of the project.
  const files = new ProjectFilesPage(page);
  const create = new CreatePage(page);
  await create.seedImageModel();
  await files.open(project.id);
  await create.open();
  await create.generate("fox in snow");
  await expect(create.tile("fox in snow")).toHaveCount(1);

  // The image is one file, in Generated/.
  let generated: string[] = [];
  await expect
    .poll(
      async () => {
        const listing = await client.workspace.listFiles
          .query({ id: folder!.workspace_id, path: "Generated" })
          .catch(() => []);
        generated = listing.map((entry) => entry.name);
        return generated;
      },
      { message: "the generation writes one image to Generated/" }
    )
    .toHaveLength(1);
  const fileName = generated[0];
  expect(fileName).toMatch(/\.png$/);

  // The file is written before its row.
  let assetIds: string[] = [];
  await expect
    .poll(
      async () => {
        const { assets } = await client.assets.list.query({
          project_id: project.id,
          content_type: "image"
        });
        assetIds = assets.map((asset) => asset.id);
        return assetIds;
      },
      { message: "the generation creates one image asset" }
    )
    .toHaveLength(1);
  const assetId = assetIds[0];

  // Files shows the file.
  await files.open(project.id);
  await files.showFiles();
  await files.expand("Generated");
  await expect(files.tree().getByText(fileName, { exact: true })).toBeVisible();

  // The asset browser shows the same file as an asset.
  const assetsPage = new AssetsPage(page);
  await assetsPage.open();
  await page.getByRole("button", { name: "Generated", exact: true }).click();
  const assetItem = page.getByLabel(fileName, { exact: true });
  await expect(assetItem).toBeVisible();

  // Back in Files, rename the file outside NodeTool.
  await files.open(project.id);
  await files.showFiles();
  await files.expand("Generated");
  await expect(files.tree().getByText(fileName, { exact: true })).toBeVisible();
  const renamed = "renamed-fox.png";
  await rename(
    join(folder!.path, "Generated", fileName),
    join(folder!.path, "Generated", renamed)
  );

  // The reconcile points the same asset at the renamed file: it is not
  // offline, and its URL serves the file's bytes again.
  await expect
    .poll(
      async () => {
        const asset = await client.assets.get.query({ id: assetId });
        if (asset.metadata?.workspace_offline || !asset.get_url) {
          return "offline";
        }
        const response = await page.request.get(asset.get_url);
        return response.ok() ? "resolves" : `status ${response.status()}`;
      },
      { message: "the asset resolves to the renamed file", timeout: 30_000 }
    )
    .toBe("resolves");

  // Files shows the new name.
  await expect(files.tree().getByText(renamed, { exact: true })).toBeVisible();
  await expect(files.tree().getByText(fileName, { exact: true })).toHaveCount(0);

  const after = await client.assets.list.query({
    project_id: project.id,
    content_type: "image"
  });
  expect(after.assets.map((asset) => asset.id), "no second asset appears").toEqual([assetId]);
});
