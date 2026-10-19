import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect } from "./fixtures";
import { HomePage } from "./pages";

const PROJECT_ID = "proj-scrapheart";

for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
  for (const context of ["empty", "project"] as const) {
    test(`creates from ${context} Home without scrolling at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const home = new HomePage(page);
      await home.open(context === "project" ? PROJECT_ID : null, context === "project" ? "light" : "dark");
      const initial = await home.firstScreenGeometry("Game");
      expect(initial.scrollPositions.every(([left, top]) => left === 0 && top === 0)).toBe(true);
      for (const name of ["Game", "New 3D model"] as const) {
        await expect(home.action(name)).toBeEnabled();
        const geometry = await home.firstScreenGeometry(name);
        expect(geometry.fullyInsideViewport, `${name} must fit without scrolling`).toBe(true);
        expect(geometry.unobstructed, `${name} must receive a pointer click`).toBe(true);
        expect(geometry.scrollPositions).toEqual(initial.scrollPositions);
      }
      await testInfo.attach("home-first-screen", { body: await page.screenshot(), contentType: "image/png" });
      expect((await home.firstScreenGeometry("Game")).scrollPositions).toEqual(initial.scrollPositions);

      if (context === "empty") {
        await home.clickWithoutScrolling("Game");
        await expect(home.gameBrief()).toBeVisible();
        await expect(page.getByRole("heading", { name: "What's your game?", exact: true })).toBeVisible();
      } else {
        await home.clickWithoutScrolling("New 3D model");
        await expect(home.modelMoveTool()).toBeVisible();
        const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
        const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({
          url: `http://localhost:${port}/trpc`, methodOverride: "POST"
        })] });
        await expect.poll(async () => (await client.assets.list.query({ project_id: PROJECT_ID })).assets
          .some((asset) => asset.project_id === PROJECT_ID && asset.name === "Untitled.glb" && asset.content_type === "model/gltf-binary"))
          .toBe(true);
      }
    });
  }
}
