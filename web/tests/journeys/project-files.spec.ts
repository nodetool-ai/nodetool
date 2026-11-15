import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect } from "./fixtures";
import { ProjectFilesPage } from "./pages";

/**
 * A project is a folder. Creating one makes its folder, and the Files section
 * of the left rail shows what is in it, without the project's own `.nodetool/`
 * metadata directory.
 */
test("a new project's folder shows in Files", async ({ page }) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })]
  });

  const name = "Folder Journey";
  const project = await client.projects.create.mutate({ name });
  expect(project.folder?.path, "creating a project creates its folder").toBeTruthy();
  await client.workspace.writeFile.mutate({
    id: project.folder!.workspace_id,
    path: "notes.txt",
    content: "first note"
  });

  const files = new ProjectFilesPage(page);
  await files.open(project.id);
  await files.railButton("Files").click();

  await expect(files.heading(name)).toBeVisible();
  await expect(files.tree().getByText("notes.txt", { exact: true })).toBeVisible();
  await expect(files.tree().getByText(".nodetool")).toHaveCount(0);
});
