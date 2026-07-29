/**
 * Journey: find things in the workflow library and the asset browser.
 *
 * The two browse surfaces a user passes through before doing anything else. A
 * broken list here is invisible to the smoke suite — the page mounts fine while
 * showing nothing — so these assert on seeded content actually being listed and
 * on search narrowing it.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { AssetsPage, LibraryPage } from "./pages";

/** Seeded by `screenshot-server.ts`; used as the "should not match" control. */
const OTHER_WORKFLOW = "Podcast Summariser";
/** Seeded image asset. */
const SEEDED_ASSET = "cityscape_night.png";

test.describe("Workflow library", () => {
  test("lists the user's saved workflows", async ({ page, pageErrors }) => {
    const library = new LibraryPage(page);
    await library.open(FIXTURES.miniApp);

    await expect(library.entry("Echo Mini App").first()).toBeVisible();
    await expect(library.entry(OTHER_WORKFLOW).first()).toBeVisible();

    expect(pageErrors, "workflow panel opened with page errors").toEqual([]);
  });

  test("search narrows the workflow list", async ({ page }) => {
    const library = new LibraryPage(page);
    await library.open(FIXTURES.miniApp);

    // Both are listed before the query, so the disappearance below proves
    // filtering rather than the entry never having been there.
    await expect(library.entry(OTHER_WORKFLOW).first()).toBeVisible();

    await library.search("Echo Mini App");

    await expect(library.entry("Echo Mini App").first()).toBeVisible();
    await expect(library.entry(OTHER_WORKFLOW)).toHaveCount(0);
  });

  test("opens another workflow from the library", async ({ page }) => {
    const library = new LibraryPage(page);
    await library.open(FIXTURES.miniApp);

    await library.search("Creative Story");
    await library.openWorkflow("Creative Story Generator");

    // The story graph replaces the echo graph on the canvas.
    await expect(page.getByTestId("rf__node-agent-main")).toBeVisible({
      timeout: 30_000
    });
  });
});

test.describe("Asset browser", () => {
  test("lists seeded assets", async ({ page, pageErrors }) => {
    const assets = new AssetsPage(page);
    await assets.open();

    await expect(
      page.getByText(SEEDED_ASSET, { exact: false }).first()
    ).toBeVisible();

    expect(pageErrors, "assets loaded with page errors").toEqual([]);
  });

  test("search filters the asset list", async ({ page }) => {
    const assets = new AssetsPage(page);
    await assets.open();

    await expect(
      page.getByText(SEEDED_ASSET, { exact: false }).first()
    ).toBeVisible();

    // A query that cannot match anything must empty the list — proving the
    // search box is wired to it rather than decorative.
    await assets.search("zzz-no-such-asset-zzz");
    await expect(page.getByText(SEEDED_ASSET, { exact: false })).toHaveCount(0);

    await assets.clearSearch();
    await expect(
      page.getByText(SEEDED_ASSET, { exact: false }).first()
    ).toBeVisible();
  });
});

test.describe("Fixture wiring", () => {
  test("the mini app's workflow is served with its echo graph", async ({
    request
  }) => {
    // Guards the workflow half of the fixture the mini-app journey depends on:
    // if the echo graph ever loses a node, this fails with a clear cause
    // instead of the mini-app spec failing on an Output that stays empty.
    const res = await request.get(`/api/workflows/${FIXTURES.miniApp}`);
    expect(res.ok()).toBe(true);

    const workflow = await res.json();
    expect(workflow.graph.nodes).toHaveLength(2);
  });
});
