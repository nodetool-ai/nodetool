import { test, expect, type Page } from "@playwright/test";
import { adRecipes } from "../../src/data/adLibrary";

async function controlBeatIntersections(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        const isBeatObserver = options?.rootMargin === "-35% 0px -60% 0px";
        super((entries, observer) => {
          if (!isBeatObserver) {
            callback(entries, observer);
          }
        }, options);
        if (isBeatObserver) {
          document.addEventListener("test:beat-intersection", (event) => {
            const { id, time } = (
              event as CustomEvent<{ id: string; time?: number }>
            ).detail;
            const target = document.getElementById(id)?.closest("li");
            if (!target) {
              throw new Error("Missing beat intersection target");
            }
            callback(
              [
                {
                  target,
                  isIntersecting: true,
                  intersectionRatio: 1,
                  time: time ?? performance.now(),
                  boundingClientRect: target.getBoundingClientRect(),
                  intersectionRect: target.getBoundingClientRect(),
                  rootBounds: null
                }
              ],
              this
            );
          });
          document.documentElement.dataset.beatObserverReady = "true";
        }
      }
    };
    // Keep the selection scroll pending until the test delivers scrollend.
    Element.prototype.scrollIntoView = (options) => {
      document.documentElement.dataset.selectionScrollBehavior =
        typeof options === "object" ? options.behavior : "auto";
    };
  });
}

for (const { name, reducedMotion, scrollend } of [
  { name: "smooth", reducedMotion: "no-preference", scrollend: true },
  { name: "reduced motion", reducedMotion: "reduce", scrollend: true },
  {
    name: "without scrollend",
    reducedMotion: "no-preference",
    scrollend: false
  }
] as const) {
  test(`selecting a beat ignores intermediate scroll intersections (${name})`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion });
    if (!scrollend) {
      await page.addInitScript(() =>
        Reflect.deleteProperty(Document.prototype, "onscrollend")
      );
    }
    await controlBeatIntersections(page);
    const recipe = adRecipes[0];
    await page.goto(recipe.route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-beat-observer-ready",
      "true"
    );
    const preview = page.getByRole("complementary", {
      name: "Sequence preview"
    });
    const film = preview.locator("video");
    const intersect = async (id: string, time?: number): Promise<void> => {
      await page.evaluate(
        (detail) =>
          document.dispatchEvent(
            new CustomEvent("test:beat-intersection", { detail })
          ),
        { id, time }
      );
    };
    const smooth = reducedMotion === "no-preference" && scrollend;
    const queuedBeforeSelection = await page.evaluate(() => performance.now());
    await preview.getByRole("button", { name: /^Show beat 3:/ }).click();
    await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-selection-scroll-behavior",
      smooth ? "smooth" : "instant"
    );
    await intersect(
      recipe.beats[0].id,
      smooth ? undefined : queuedBeforeSelection
    );
    await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
    expect(
      await film.evaluate((video: HTMLVideoElement) => video.currentTime * 1000)
    ).toBeGreaterThanOrEqual(recipe.beats[2].start_ms);

    // Another selection can replace the destination before the scroll settles.
    await preview.getByRole("button", { name: /^Show beat 5:/ }).click();
    await intersect(
      recipe.beats[2].id,
      smooth ? undefined : queuedBeforeSelection
    );
    await expect(preview.getByText(`5/${recipe.beats.length}`)).toBeVisible();

    // An intersection queued during the animation may arrive after scrollend.
    const queuedAt = smooth
      ? await page.evaluate(() => performance.now())
      : queuedBeforeSelection;
    await page.evaluate(
      ({ id, time }) => {
        document.dispatchEvent(new Event("scrollend"));
        document.dispatchEvent(
          new CustomEvent("test:beat-intersection", { detail: { id, time } })
        );
      },
      { id: recipe.beats[0].id, time: queuedAt }
    );
    await expect(preview.getByText(`5/${recipe.beats.length}`)).toBeVisible();

    // Ordinary reading scrolls must select beats again after the selected scroll ends.
    await intersect(recipe.beats[0].id);
    await expect(preview.getByText(`1/${recipe.beats.length}`)).toBeVisible();

    // Selecting a centered beat has no scrollend event and must not lock the observer.
    const centeredY = await page.evaluate((id) => {
      const item = document.getElementById(id)?.closest("li");
      if (!item) {
        throw new Error("Missing beat to center");
      }
      const bounds = item.getBoundingClientRect();
      const top = Math.max(
        0,
        Math.min(
          document.documentElement.scrollHeight - innerHeight,
          scrollY + bounds.top + (bounds.height - innerHeight) / 2
        )
      );
      window.scrollTo(0, top);
      return Math.round(top);
    }, recipe.beats[0].id);
    await expect
      .poll(() => page.evaluate(() => Math.round(scrollY)))
      .toBe(centeredY);
    await preview.getByRole("button", { name: /^Show beat 1:/ }).click();
    await intersect(recipe.beats[2].id);
    await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
  });
}

test("without scrollend a beat selection overrides the page's smooth scrolling", async ({
  page
}) => {
  await page.addInitScript(() =>
    Reflect.deleteProperty(Document.prototype, "onscrollend")
  );
  const recipe = adRecipes[0];
  await page.goto(recipe.route);
  expect(await page.evaluate(() => "onscrollend" in document)).toBe(false);
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "smooth");
  const preview = page.getByRole("complementary", { name: "Sequence preview" });
  await preview.getByRole("button", { name: /^Show beat 3:/ }).click();
  const distanceFromCenter = await page.evaluate((id) => {
    const item = document.getElementById(id)?.closest("li");
    if (!item) {
      throw new Error("Missing selected beat");
    }
    const bounds = item.getBoundingClientRect();
    return Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2);
  }, recipe.beats[2].id);
  expect(distanceFromCenter).toBeLessThanOrEqual(1);
  await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
});

test("ad library links to every recipe, and each recipe loads its rendered ad", async ({
  page
}) => {
  await page.goto("/ad-library");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "An ad worth making"
  );
  for (const recipe of adRecipes) {
    const link = page.locator(`a[href="${recipe.route}"]`);
    await expect(link).toHaveCount(1);
    const card = link.locator("video");
    await expect(card).toHaveAttribute("src", recipe.video.src);
    await expect(card).toHaveAttribute("poster", recipe.video.poster);
    // In view, the card plays its ad muted.
    await card.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        card.evaluate((element: HTMLVideoElement) => element.currentTime)
      )
      .toBeGreaterThan(0);
    await page.goto(recipe.route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      recipe.title
    );
    const film = page
      .getByRole("complementary", { name: "Sequence preview" })
      .locator("video");
    await expect(film).toHaveAttribute(
      "src",
      `/ad-library/videos/${recipe.slug}.mp4`
    );
    await expect
      .poll(() =>
        film.evaluate((element: HTMLVideoElement) => element.videoWidth)
      )
      .toBeGreaterThan(0);
    await page.goto("/ad-library");
  }
});

test("the sequence preview moves the video to a beat and plays it", async ({
  page
}) => {
  const recipe = adRecipes[0];
  const beat = recipe.beats[2];
  await page.goto(recipe.route);
  const preview = page.getByRole("complementary", {
    name: "Sequence preview"
  });
  const film = preview.locator("video");
  await preview.getByRole("button", { name: /^Show beat 3:/ }).click();
  await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
  const seconds = await film.evaluate(
    (element: HTMLVideoElement) => element.currentTime
  );
  expect(seconds * 1000).toBeGreaterThanOrEqual(beat.start_ms);
  expect(seconds * 1000).toBeLessThan(beat.end_ms);
  await preview.getByRole("button", { name: "Play preview" }).click();
  await expect(
    preview.getByRole("button", { name: "Pause preview" })
  ).toBeVisible();
  await expect
    .poll(() =>
      film.evaluate((element: HTMLVideoElement) => element.currentTime)
    )
    .toBeGreaterThan(seconds);
});

test("marketing exposes the ad library alongside existing recipes", async ({
  page
}) => {
  await page.goto("/marketing");
  await expect(
    page.getByRole("link", { name: "Explore the ad library" })
  ).toHaveAttribute("href", "/ad-library");
  await expect(
    page.getByRole("link", { name: "Explore all recipes" })
  ).toHaveAttribute("href", "/recipes");
});
