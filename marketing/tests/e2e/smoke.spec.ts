import { test, expect } from "@playwright/test";
import { recipeEntries } from "../../src/data/recipes";

// Static route/metadata/media coverage lives in static-seo.spec.ts and uses
// HTTP responses. Browser work stays representative so hydration and user
// navigation are exercised without opening a page for every prerendered route.
const HYDRATION_ROUTES = [
  "/",
  "/apps",
  "/models",
  "/recipes/ugc-product-video",
  "/download"
];

test.describe("marketing smoke", () => {
  for (const path of HYDRATION_ROUTES) {
    test(`${path} renders with a NodeTool title and exactly one h1`, async ({
      page
    }) => {
      const res = await page.goto(path);
      expect(res?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveTitle(/NodeTool/i);
      // SSR/SEO regression guard: exactly one <h1> per page (P1/P6).
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
    });
  }

  test("mini-app cards show available results", async ({ page }) => {
    await page.goto("/apps");
    await expect(
      page.getByRole("heading", { name: "AI mini apps anyone can use" })
    ).toBeVisible();
    await expect(page.getByTestId("mini-app-result").first()).toBeVisible();
    const appCard = page.locator('a[href="/apps/ad-maker"]');
    await expect(appCard.getByTestId("mini-app-result")).toBeVisible();
    await expect(appCard.getByAltText("Ad Maker mini app")).toHaveCount(0);
  });

  test("shared header exposes the global nav (Pricing + Docs)", async ({
    page
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Pricing" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Docs" }).first()
    ).toBeVisible();
  });

  test("homepage download CTA lands on the first-party download page", async ({
    page
  }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: /download nodetool/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/download");
  });

  test("homepage projects lead with results and one link per project", async ({
    page
  }) => {
    await page.goto("/");

    const proof = page.getByRole("region", {
      name: "Made with NodeTool"
    });
    await expect(proof).toBeVisible();
    await expect(proof.getByText("Still to review")).toHaveCount(0);

    const expectedRoutes = [
      "/recipes/ugc-product-video",
      "/recipes/directed-campaign-kit",
      "/recipes/viral-video-ad-engine",
      "/recipes/impossible-product-worlds",
      "/recipes/ecommerce-sku-visual-factory",
      "/recipes/multilingual-video-dubber",
      "/recipes/storyboard-to-trailer"
    ];
    const projectLinks = proof.locator(
      'article a[href^="/recipes/"]:not([href="/recipes"])'
    );
    await expect(projectLinks).toHaveCount(expectedRoutes.length);
    expect(
      await projectLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href"))
      )
    ).toEqual(expectedRoutes);

    for (const route of expectedRoutes) {
      const recipe = recipeEntries.find((entry) => entry.route === route)!;
      const project = proof.locator("article", {
        has: page.locator(`a[href="${route}"]`)
      });

      if (!recipe.productionRun) {
        await expect(
          project.getByRole("heading", { name: recipe.name })
        ).toBeVisible();
        await expect(project.getByText(recipe.outcome)).toBeVisible();
        await expect(
          project.getByRole("img", { name: /directed campaign kit mini app/i })
        ).toBeVisible();
        continue;
      }

      const run = recipe.productionRun;

      await expect(
        project.getByRole("heading", { name: run.proofTitle })
      ).toBeVisible();
      await expect(project.getByText(run.summary)).toBeVisible();
      await expect(project.getByText(run.reviewLabel)).toHaveCount(0);
      await expect(project.getByText(run.essentialLimitation)).toHaveCount(0);
    }

    const campaignProject = proof.locator("article", {
      has: page.locator('a[href="/recipes/directed-campaign-kit"]')
    });
    const campaignImage = campaignProject.getByRole("img", {
      name: /square campaign image of an olive travel cup/i
    });
    await expect(campaignImage).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(campaignImage).toBeVisible();
    expect((await campaignImage.boundingBox())?.width ?? 0).toBeGreaterThan(
      300
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
  });

  test("advertising showcase opens the impossible product worlds recipe", async ({
    page
  }) => {
    await page.goto("/marketing");
    await page
      .getByRole("link", {
        name: "Explore the Impossible product worlds project"
      })
      .click();
    await expect(page).toHaveURL(/\/recipes\/impossible-product-worlds$/);
    await expect(
      page.getByRole("heading", {
        name: "Impossible product worlds",
        exact: true
      })
    ).toBeVisible();
    const video = page.locator("#production-proof video");
    await expect(video).toHaveAttribute(
      "poster",
      "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/poster.webp"
    );
    await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute(
      "src",
      "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/final.mp4"
    );
    await expect(video).toHaveJSProperty("error", null);
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.duration)
    ).toBeCloseTo(15.072, 2);
    await expect(page.getByText("Still to review")).toHaveCount(0);
  });

  test("every impossible product worlds step shows a source visual", async ({
    page
  }) => {
    await page.goto("/recipes/impossible-product-worlds");

    await expect(
      page.locator("#guided-flow ol").first().locator("li span:last-child")
    ).toHaveText(["Idea", "Story", "Entities", "Look"]);

    for (const name of [
      "01 Product",
      "02 Idea",
      "03 Story",
      "04 Review",
      "05 Entities",
      "06 Look",
      "07 Stills",
      "08 Motion",
      "09 Timeline",
      "10 Delivery"
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      const image = page.locator(
        '#recipe-step-content img[src*="impossible-product-worlds-dreamina/steps/"]'
      );
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth)
        )
        .toBeGreaterThan(0);
    }
  });

  test("the UGC recipe exposes its playable live run", async ({ page }) => {
    await page.goto("/recipes/ugc-product-video");

    const proof = page.getByRole("region", {
      name: "Turns out I needed the green one."
    });
    const video = proof.locator("video");

    await expect(proof).toBeVisible();
    await expect(video).toHaveAttribute(
      "poster",
      "/recipes/runs/2026-09-14-emotional-support-cup/poster.jpg"
    );
    await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute(
      "src",
      "/recipes/runs/2026-09-14-emotional-support-cup/final.mp4"
    );
    await expect(video).toHaveJSProperty("error", null);
    const duration = await video.evaluate(
      (element: HTMLVideoElement) => element.duration
    );
    expect(duration).toBeGreaterThan(15);
    expect(duration).toBeLessThan(15.2);
  });

  test("the UGC mini app shows its captured outputs without recipe proof", async ({
    page
  }) => {
    await page.goto("/apps/ugc-product-video");

    await expect(
      page.getByRole("heading", { name: "Output from a live run" })
    ).toBeVisible();
    await expect(page.getByText("Final Poster", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Turns out I needed the green one." })
    ).toHaveCount(0);
  });

  test("every UGC recipe step shows its source visual", async ({ page }) => {
    await page.goto("/recipes/ugc-product-video");

    for (const name of [
      "01 Angle",
      "02 Creator",
      "03 Product",
      "04 Generate",
      "05 Edit",
      "06 Review"
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      const image = page.locator("#recipe-step-content figure img");
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth)
        )
        .toBeGreaterThan(0);
    }

    const hero = page.getByRole("img", {
      name: "Creator speaking to camera before showing an olive travel cup."
    });
    const proof = page.getByRole("img", {
      name: "Five frames from the live UGC run show the creator, the cup entering frame, and the closing reaction."
    });
    const heroBox = await hero.boundingBox();
    const proofBox = await proof.boundingBox();
    expect(heroBox?.width ?? Infinity).toBeLessThan(heroBox?.height ?? 0);
    expect(proofBox?.height ?? Infinity).toBeLessThan(proofBox?.width ?? 0);
  });

  test("every directed campaign step shows its source visual", async ({
    page
  }) => {
    await page.goto("/recipes/directed-campaign-kit");

    for (const name of [
      "01 Product image",
      "02 AI draft",
      "03 A, B, or C",
      "04 Generate",
      "05 1:1 and 9:16",
      "06 Compare"
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      const image = page.locator("#recipe-step-content figure img");
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth)
        )
        .toBeGreaterThan(0);
    }
  });

  test("the download page offers an installer for every platform", async ({
    page
  }) => {
    await page.goto("/download");
    for (const name of [
      /Apple silicon/i,
      /Intel Macs/i,
      /64-bit Windows/i,
      /AppImage/i
    ]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }
    // GitHub is the secondary route to the same builds, not the destination.
    await expect(
      page.getByRole("link", { name: /the GitHub releases page/i })
    ).toBeVisible();
  });

  test("homepage ships JSON-LD structured data", async ({ page }) => {
    await page.goto("/");
    const ld = page.locator('script[type="application/ld+json"]');
    expect(await ld.count()).toBeGreaterThan(0);
  });

  test("recipe detail leads with the finished ad and a Studio handoff", async ({
    page
  }) => {
    await page.goto("/recipes/viral-video-ad-engine");

    const recipe = recipeEntries.find(
      (entry) => entry.slug === "viral-video-ad-engine"
    )!;
    const proof = page.getByRole("region", {
      name: recipe.productionRun!.proofTitle
    });
    const guide = page.getByRole("region", { name: /guide/i });

    await expect(proof).toBeVisible();
    await expect(page.getByText("Partial example")).toHaveCount(0);
    await expect(page.getByText("Review notes", { exact: true })).toHaveCount(
      0
    );
    await expect(
      proof.getByText(recipe.productionRun!.essentialLimitation)
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /download nodetool studio/i }).first()
    ).toHaveAttribute("href", "/download");
    await expect(proof.locator("video, img").first()).toHaveJSProperty(
      "tagName",
      "VIDEO"
    );

    const proofPosition = await proof.evaluate((element) =>
      Array.from(document.querySelectorAll<Element>("section")).indexOf(element)
    );
    const guidePosition = await guide.evaluate((element) =>
      Array.from(document.querySelectorAll<Element>("section")).indexOf(element)
    );
    expect(proofPosition).toBeLessThan(guidePosition);

    const inputs = guide.getByRole("heading", { name: "Bring to this recipe" });
    const inputsPrecedeSteps = await inputs.evaluate((element) => {
      const steps = document.querySelector('nav[aria-label="Recipe steps"]');
      return Boolean(
        steps &&
        (element.compareDocumentPosition(steps) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0
      );
    });
    expect(inputsPrecedeSteps).toBe(true);

    for (const step of [
      "01 Idea",
      "02 Story",
      "03 Entities",
      "04 Look",
      "05 References",
      "06 Clips",
      "07 Review",
      "08 Timeline"
    ]) {
      await guide.getByRole("button", { name: step }).click();
      const image = guide.locator('img[src*="photographic-commercial/steps/"]');
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((node) => (node as HTMLImageElement).naturalWidth)
        )
        .toBeGreaterThan(0);
    }
  });

  test("no hidden duplicate-H1 SEO block remains", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sr-only-seo")).toHaveCount(0);
  });

  test("search opportunity pages expose targeted metadata and links", async ({
    page
  }) => {
    await page.goto("/alternatives/comfyui");
    await expect(page).toHaveTitle(
      "Easier ComfyUI Alternatives for Mac | NodeTool"
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Easier ComfyUI Alternatives for Mac | NodeTool"
    );

    await page.goto("/alternatives/lm-studio");
    await expect(page).toHaveTitle(
      "LM Studio Alternatives for Local AI Workflows | NodeTool"
    );

    await page.goto("/alternatives/figma-weave");
    await expect(page).toHaveTitle(
      "Figma Weave Alternative: Open-Source, Self-Hosted | NodeTool"
    );

    await page.goto("/alternatives/weavy");
    await expect(page).toHaveTitle(
      "Weavy Alternative — Now Figma Weave | NodeTool"
    );

    await page.goto("/tasks/lip-sync");
    await expect(page).toHaveTitle(
      "Best AI Lip Sync Models & Workflows — NodeTool"
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "AI Lip Sync: Best Models & Workflows"
      })
    ).toBeVisible();

    await page.goto("/node-based-ai");
    await expect(
      page.getByRole("link", { name: "Figma Weave alternative" })
    ).toHaveAttribute("href", "/alternatives/figma-weave");
    await expect(
      page.getByRole("link", { name: "Weavy comparison" })
    ).toHaveAttribute("href", "/alternatives/weavy");

    await page.goto("/templates");
    await expect(
      page.getByRole("link", { name: "runnable mini apps" })
    ).toHaveAttribute("href", "/apps");
    await expect(
      page.getByRole("link", { name: "node-based AI workflows" })
    ).toHaveAttribute("href", "/node-based-ai");

    await page.goto("/use-cases/movie-poster");
    await expect(
      page.getByRole("link", { name: "Build a movie trailer" })
    ).toHaveAttribute("href", "/use-cases/movie-trailer");

    await page.goto("/use-cases/product-video");
    await expect(
      page.getByRole("link", { name: "Build a movie trailer" })
    ).toHaveAttribute("href", "/use-cases/movie-trailer");

    await page.goto("/studio");
    await expect(
      page.getByRole("link", { name: "visual node-based AI guide" })
    ).toHaveAttribute("href", "/node-based-ai");
  });
});
