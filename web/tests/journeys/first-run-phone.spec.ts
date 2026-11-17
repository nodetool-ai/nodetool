/**
 * Journey: a first session on a phone reaches a result.
 *
 * In one week of Cloud sessions none of the 24 phone sessions produced a
 * generation, and 55 of 100 sessions did nothing at all. This is the release
 * check for that path: Home at phone width shows the first-run starters on
 * the first screen, the guided first task gets a reply, and the starter cards
 * open their documents on the step whose button produces output. The provider
 * is the hermetic fake, so the reply text is fixed.
 */

import { test, expect, FAKE_LLM_TEXT } from "./fixtures";
import { FirstRunHomePage } from "./pages";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe("First run on a phone", () => {
  test("the first task is on the first screen and gets a reply", async ({ page }) => {
    const home = new FirstRunHomePage(page);
    await home.open();

    await expect(home.firstTask(), "the first task must be on the first screen").toBeInViewport({
      ratio: 1
    });
    for (const title of ["Make a tiny game", "Storyboard a short film", "Run a template"] as const) {
      await expect(home.card(title)).toBeVisible();
    }
    expect(await home.pansSideways(), "Home pans sideways on a phone").toBe(false);

    await home.firstTask().tap();
    await expect(page.getByText(FAKE_LLM_TEXT).first()).toBeVisible({ timeout: 60_000 });
    // The reply is the first result, which retires the starters.
    await expect.poll(() => home.firstResultRecorded()).toBe(true);
  });

  test("the storyboard starter opens on the screenplay step", async ({ page }) => {
    const home = new FirstRunHomePage(page);
    await home.open();
    await home.card("Storyboard a short film").tap();
    const generate = page.getByRole("button", { name: "Generate screenplay" });
    await expect(generate).toBeVisible({ timeout: 60_000 });
    await expect(generate).toBeEnabled();
    expect(await home.pansSideways()).toBe(false);
  });

  test("the game starter opens on the design step", async ({ page }) => {
    const home = new FirstRunHomePage(page);
    await home.open();
    await home.card("Make a tiny game").tap();
    const write = page.getByRole("button", { name: "Write the design" });
    await expect(write).toBeVisible({ timeout: 60_000 });
    await expect(write).toBeEnabled();
    expect(await home.pansSideways()).toBe(false);
  });

  test("the template starter opens a copy of the text-only example", async ({ page }) => {
    const home = new FirstRunHomePage(page);
    await home.open();
    await home.card("Run a template").tap();
    await expect(page.getByText("Ad Copy in Three Registers").first()).toBeVisible({
      timeout: 60_000
    });
    expect(await home.pansSideways()).toBe(false);
  });
});
