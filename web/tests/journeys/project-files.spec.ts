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

/**
 * A workflow is a JSON file in the project folder. Opening that file from
 * Files opens the workflow editor on the workflow, not the file's JSON.
 */
test("opening a workflow file in Files opens the workflow editor", async ({ page }) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })]
  });

  const project = await client.projects.create.mutate({ name: "Workflow File Journey" });
  await client.workflows.create.mutate({
    name: "Fox",
    access: "private",
    project_id: project.id,
    graph: {
      nodes: [
        {
          id: "text",
          type: "nodetool.input.StringInput",
          data: { name: "text", value: "hello" },
          ui_properties: { position: { x: 80, y: 80 } }
        }
      ],
      edges: []
    }
  });
  const listing = await client.workspace.listFiles.query({
    id: project.folder!.workspace_id,
    path: "Workflows"
  });
  expect(
    listing.map((entry) => entry.name),
    "saving a workflow writes its file"
  ).toContain("Fox.workflow.json");

  const files = new ProjectFilesPage(page);
  await files.open(project.id);
  await files.railButton("Files").click();
  await files.tree().getByText("Workflows", { exact: true }).click();
  await files.tree().getByText("Fox.workflow.json", { exact: true }).dblclick();

  await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`.react-flow__node[data-id="text"]`)).toBeVisible();
  await expect(page).not.toHaveURL(/workspace-file/);
  // The file's JSON is not what opened.
  await expect(page.getByText(`"format": "nodetool.workflow"`)).toHaveCount(0);
});
