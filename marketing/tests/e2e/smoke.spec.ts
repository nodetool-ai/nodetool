import { test, expect } from "@playwright/test";
import { registryModules } from "../../src/data/registry";
import { recipeEntries } from "../../src/data/recipes";

// Coverage is derived from the page-data registry: every indexable route is
// smoke-tested, except that engines flagged with `sample` (hundreds of pages)
// contribute only their first N indexable entries — hub pages first.
const ROUTES = registryModules.flatMap((m) => {
  const indexable = m.entries.filter((e) => e.indexable);
  const sampled = m.sample ? indexable.slice(0, m.sample) : indexable;
  return sampled.map((e) => e.route);
});

const MEDIA_MAGIC: Record<string, string> = {
  jpg: "\xff\xd8\xff",
  jpeg: "\xff\xd8\xff",
  png: "\x89PNG",
  webp: "RIFF",
  mp4: "ftyp",
  webm: "\x1a\x45\xdf\xa3"
};

test.describe("marketing smoke", () => {
  for (const path of ROUTES) {
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
      "/recipes/viral-video-ad-engine",
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
      const run = recipe.productionRun!;
      const project = proof.locator("article", {
        has: page.locator(`a[href="${route}"]`)
      });

      await expect(
        project.getByRole("heading", { name: run.proofTitle })
      ).toBeVisible();
      await expect(project.getByText(run.summary)).toBeVisible();
      await expect(project.getByText(run.reviewLabel)).toHaveCount(0);
      await expect(project.getByText(run.essentialLimitation)).toHaveCount(0);
    }

    const adProject = proof.locator("article", {
      has: page.locator('a[href="/recipes/viral-video-ad-engine"]')
    });
    const adVideo = adProject.locator("video");
    await expect(adVideo).toHaveCount(1);
    await expect(adVideo).toHaveAttribute("controls", "");
    await expect(adVideo).not.toHaveAttribute("autoplay", "");
    await expect(adVideo).toHaveAttribute("preload", "none");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(adVideo).toBeVisible();
    expect((await adVideo.boundingBox())?.width ?? 0).toBeGreaterThan(300);
    await expect(adProject.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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

    const proof = page.getByRole("region", {
      name: "Big production. Everyday coffee."
    });
    const guide = page.getByRole("region", { name: /guide/i });

    await expect(proof).toBeVisible();
    await expect(page.getByText("Partial example")).toHaveCount(0);
    await expect(page.getByText("Review notes", { exact: true })).toHaveCount(0);
    const recipe = recipeEntries.find(
      (entry) => entry.slug === "viral-video-ad-engine"
    )!;
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
  });

  for (const recipe of recipeEntries.filter((entry) => entry.productionRun)) {
    test(`${recipe.route} serves its production proof media`, async ({
      request
    }) => {
      const run = recipe.productionRun!;
      const files = [
        run.hero.src,
        run.card.src,
        run.ogImage,
        run.proof?.src,
        run.video?.mp4,
        run.video?.webm,
        run.video?.poster
      ].filter((file): file is string => Boolean(file));

      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const response = await request.get(file);
        expect(response.status(), `${file} status`).toBe(200);
        const body = await response.body();
        expect(body.byteLength, `${file} bytes`).toBeGreaterThan(0);
        const extension = file.split(".").pop()!;
        expect(
          body.subarray(0, 12).toString("latin1"),
          `${file} signature`
        ).toContain(MEDIA_MAGIC[extension]);
      }
    });
  }

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

  // Same reason as the bundle: a missing sample renders as a broken <img>, not
  // as a failure. Fetch every file the sample names and check it is the media
  // it claims to be, not an HTML error page served with a 200.
  for (const recipe of recipeEntries.filter((r) => r.sample)) {
    test(`${recipe.route} serves its sample media`, async ({ request }) => {
      const sample = recipe.sample!;
      const files = [sample.image, sample.video, sample.webm, sample.poster];
      for (const file of files.filter(Boolean) as string[]) {
        const res = await request.get(file);
        expect(res.status(), `${file} status`).toBe(200);
        const head = (await res.body()).subarray(0, 12).toString("latin1");
        const ext = file.split(".").pop()!;
        expect(head, `${file} magic bytes`).toContain(MEDIA_MAGIC[ext]);
      }
    });
  }
});
