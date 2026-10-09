import { expect, test, type Page } from "@playwright/test";
import { searchStarters } from "../../src/data/searchStarters";
import type { PlausibleProps } from "../../src/lib/analytics";

const journeys = [
  { path: "/alternatives/comfyui", source: "comfyui", starter: "generate-then-upscale-a-poster", heading: "Try a generation graph in NodeTool" },
  { path: "/alternatives/figma-weave", source: "figma-weave", starter: "write-the-prompt-then-make-the-image", heading: "Try an editable image project on your own keys" },
  { path: "/alternatives/higgsfield", source: "higgsfield", starter: "movie-trailer-generator", heading: "Try a trailer workflow you can inspect" },
  { path: "/alternatives/openart", source: "openart", starter: "write-the-prompt-then-make-the-image", heading: "Try an image workflow with inspectable outputs" },
  { path: "/alternatives/ltx-studio", source: "ltx-studio", starter: "movie-trailer-generator", heading: "Build a trailer from a visible workflow" },
  { path: "/alternatives/google-flow", source: "google-flow", starter: "movie-trailer-generator", heading: "Plan a trailer with providers you choose" },
  { path: "/alternatives/artlist", source: "artlist", starter: "movie-trailer-generator", heading: "Inspect a trailer production graph" },
  { path: "/alternatives/invideo", source: "invideo", starter: "movie-trailer-generator", heading: "Follow a film brief through a saved graph" },
  { path: "/alternatives/katalist", source: "katalist", starter: "movie-trailer-generator", heading: "Build a short trailer from an editable logline" },
  { path: "/alternatives/storyboarder-ai", source: "storyboarder-ai", starter: "movie-trailer-generator", heading: "Inspect the steps from shot plan to trailer" },
  { path: "/alternatives/story-com", source: "story-com", starter: "movie-trailer-generator", heading: "Try a trailer with visible intermediate outputs" },
  { path: "/alternatives/mootion", source: "mootion", starter: "movie-trailer-generator", heading: "Start a trailer with one generated shot" },
  { path: "/alternatives/moonvalley", source: "moonvalley", starter: "movie-trailer-generator", heading: "Inspect a film workflow before selecting models" },
  { path: "/alternatives/kling-ai", source: "kling-ai", starter: "movie-trailer-generator", heading: "Try a trailer with visible shot-planning steps" },
  { path: "/alternatives/pika", source: "pika", starter: "movie-trailer-generator", heading: "Build a short trailer as a saved workflow" },
  { path: "/alternatives/luma-dream-machine", source: "luma-dream-machine", starter: "movie-trailer-generator", heading: "Follow a logline through a trailer workflow" },
  { path: "/alternatives/pixverse", source: "pixverse", starter: "movie-trailer-generator", heading: "Inspect the graph behind a short trailer" },
  { path: "/alternatives/leonardo-ai", source: "leonardo-ai", starter: "generate-then-upscale-a-poster", heading: "Generate and upscale an image in a visible graph" },
  { path: "/alternatives/midjourney", source: "midjourney", starter: "write-the-prompt-then-make-the-image", heading: "Keep the written prompt beside the generated image" },
  { path: "/alternatives/adobe-firefly", source: "adobe-firefly", starter: "write-the-prompt-then-make-the-image", heading: "Try an editable image workflow outside a hosted suite" },
  { path: "/alternatives/ideogram", source: "ideogram", starter: "movie-posters", heading: "Try a poster workflow with editable art direction" },
  { path: "/alternatives/recraft", source: "recraft", starter: "generate-then-upscale-a-poster", heading: "Try a repeatable image generation and upscale workflow" },
  { path: "/alternatives/dreamina", source: "dreamina", starter: "movie-trailer-generator", heading: "Build a trailer from an editable brief" },
  { path: "/use-cases/movie-poster", source: "movie-poster", starter: "movie-posters", heading: "Start with the Movie Posters workflow" },
  { path: "/node-based-ai", source: "node-based-ai", starter: "generate-then-upscale-a-poster", heading: "Build along: generate and upscale a poster" },
  { path: "/node-based-workflows", source: "node-based-workflows", starter: "movie-trailer-generator", heading: "Build along: a trailer workflow" },
] as const;

interface RecordedEvent {
  event: string;
  props: PlausibleProps;
}

async function recordEvents(page: Page): Promise<RecordedEvent[]> {
  const events: RecordedEvent[] = [];
  await page.exposeFunction("recordMarketingEvent", (event: string, options: { props: PlausibleProps }) => {
    events.push({ event, props: options.props });
  });
  await page.addInitScript(() => {
    window.plausible = (event, options) => {
      // The binding is installed in every document, including after navigation.
      const recorder = window as unknown as { recordMarketingEvent: (event: string, options: unknown) => Promise<void> };
      void recorder.recordMarketingEvent(event, options);
    };
  });
  await page.route("https://plausible.io/**", (route) => route.abort());
  await page.route(/\.(mp4|webm)(\?.*)?$/, (route) => route.abort());
  return events;
}

for (const journey of journeys) {
  test(`${journey.path} serves a relevant starter before the comparison or explanation`, async ({ request }) => {
    const response = await request.get(journey.path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(journey.heading);
    expect(html).toContain(`from=${journey.source}&amp;starter=${journey.starter}`);
    expect(html).toContain(searchStarters[journey.starter].route);
  });

  test(`${journey.path} carries the starter through the installer handoff`, async ({ page }) => {
    const events = await recordEvents(page);
    await page.route("https://api.github.com/repos/nodetool-ai/nodetool/releases/latest", (route) => route.fulfill({
      json: { tag_name: "v1.0.0", assets: [{ name: "Nodetool-Setup-1.0.0.exe", browser_download_url: "https://github.com/nodetool-ai/nodetool/releases/download/v1.0.0/Nodetool-Setup-1.0.0.exe", size: 120000000 }] },
    }));
    await page.goto(journey.path);
    const starter = page.getByRole("region", { name: journey.heading });
    await expect(starter).toBeVisible();
    await starter.getByRole("link", { name: /^Download NodeTool|^Get the desktop app/ }).click();
    await expect(page).toHaveURL(`/download?from=${journey.source}&starter=${journey.starter}`);
    await expect(page.getByRole("heading", { name: `After installing: ${searchStarters[journey.starter].name}` })).toBeVisible();
    await expect.poll(() => events.find((e) => e.event === "Download CTA")?.props).toMatchObject({ landing_page: journey.source, starter: journey.starter, placement: "starter" });

    await page.route("https://github.com/nodetool-ai/nodetool/releases/**", (route) => route.fulfill({ body: "Installer fixture" }));
    await page.getByRole("link", { name: /Windows.*64-bit/ }).click();
    await expect.poll(() => events.find((e) => e.event === "Download")?.props).toMatchObject({ landing_page: journey.source, os: "windows", placement: "installer" });
    expect(events.some((e) => e.event === "Browse Releases")).toBe(false);
  });
}

test("release fallback measures browsing rather than an installer click", async ({ page }) => {
  const events = await recordEvents(page);
  await page.route("https://api.github.com/repos/nodetool-ai/nodetool/releases/latest", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("https://github.com/nodetool-ai/nodetool/releases/latest", (route) => route.fulfill({ body: "Release fixture" }));
  await page.goto("/download?from=private-email%40example.com&starter=not-a-starter");
  await expect(page.getByRole("heading", { name: /^After installing:/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Windows.*64-bit/ }).click();
  await expect.poll(() => events.find((e) => e.event === "Browse Releases")?.props).toMatchObject({ landing_page: "download", os: "windows" });
  expect(events.some((e) => e.event === "Download")).toBe(false);
  expect(JSON.stringify(events)).not.toContain("private-email");
});

test("Cloud intent and entering the app use separate goals", async ({ page }) => {
  const events = await recordEvents(page);
  await page.route("https://app.nodetool.ai/**", (route) => route.fulfill({ body: "Cloud fixture" }));
  await page.goto("/studio");
  await page.getByRole("link", { name: "Try it →" }).click();
  await expect(page).toHaveURL("/cloud");
  await expect.poll(() => events.find((e) => e.event === "Cloud CTA")?.props).toMatchObject({ placement: "announcement" });
  expect(events.some((e) => e.event === "Try Cloud")).toBe(false);
  await page.getByRole("link", { name: "Try Cloud (alpha)", exact: true }).first().click();
  await expect.poll(() => events.find((e) => e.event === "Try Cloud")?.props).toMatchObject({ page: "cloud", placement: "hero" });
});

test("demo visibility is not engagement and manual playback is", async ({ page }) => {
  const events = await recordEvents(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cloud");
  const demo = page.getByRole("figure").filter({ hasText: "Recorded NodeTool project demonstration:" });
  await demo.scrollIntoViewIfNeeded();
  await demo.locator("video").evaluate((video: HTMLVideoElement) => {
    Object.defineProperty(video, "play", { value: () => Promise.resolve() });
    video.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(events.some((e) => e.event === "View Demo")).toBe(false);
  await demo.getByRole("button", { name: "Play the demo", exact: true }).click();
  await expect.poll(() => events.find((e) => e.event === "View Demo")?.props).toMatchObject({ action: "play", placement: "demo" });
});

test("demo autoplay does not emit a manual engagement goal", async ({ page }) => {
  const events = await recordEvents(page);
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
  });
  await page.goto("/cloud");
  const demo = page.getByRole("figure").filter({ hasText: "Recorded NodeTool project demonstration:" });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator("video")).toHaveClass(/opacity-100/);
  expect(events.some((e) => e.event === "View Demo")).toBe(false);
});

test("recipe engagement goals name the recipe and ignore autoplay", async ({ page, context }) => {
  const events = await recordEvents(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/recipes");
  await page.getByRole("link", { name: "Explore the UGC product video project" }).click();
  await expect(page).toHaveURL("/recipes/ugc-product-video");
  await expect.poll(() => events.find((e) => e.event === "Open Recipe")?.props).toMatchObject({ page: "recipes", recipe: "ugc-product-video", placement: "card" });

  const guide = page.locator("#guided-flow");
  await guide.scrollIntoViewIfNeeded();
  expect(events.some((e) => e.event === "Recipe Step")).toBe(false);
  await guide.getByRole("navigation", { name: "Recipe steps" }).getByRole("button").nth(1).click();
  await expect.poll(() => events.find((e) => e.event === "Recipe Step")?.props).toMatchObject({ page: "recipe", recipe: "ugc-product-video", step: 2 });
  await guide.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => events.find((e) => e.event === "Copy Brief")?.props).toMatchObject({ recipe: "ugc-product-video" });
});

test("template catalog clicks name the template", async ({ page }) => {
  const events = await recordEvents(page);
  await page.goto("/templates");
  const card = page.locator('a[href="/templates/movie-posters"]').first();
  await card.click();
  await expect(page).toHaveURL("/templates/movie-posters");
  await expect.poll(() => events.find((e) => e.event === "Open Template")?.props).toMatchObject({ page: "templates", template: "movie-posters", placement: "catalog" });
});

test("copying the MCP install command is a goal with its placement", async ({ page, context }) => {
  const events = await recordEvents(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/agents");
  await page.getByRole("button", { name: "Copy the install command" }).first().click();
  await expect.poll(() => events.find((e) => e.event === "Copy Install Command")?.props).toMatchObject({ page: "agents", placement: "terminal" });
});

test("pricing Cloud entry uses the Try Cloud goal", async ({ page }) => {
  const events = await recordEvents(page);
  await page.route("https://app.nodetool.ai/**", (route) => route.fulfill({ body: "Cloud fixture" }));
  await page.goto("/pricing");
  await page.getByRole("link", { name: "Try Cloud (alpha)", exact: true }).click();
  await expect.poll(() => events.find((e) => e.event === "Try Cloud")?.props).toMatchObject({ page: "pricing", placement: "pricing" });
});

test("a missing page reports its path as a 404 goal", async ({ page }) => {
  const events = await recordEvents(page);
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect.poll(() => events.find((e) => e.event === "404")?.props).toMatchObject({ path: "/no-such-page" });
});
