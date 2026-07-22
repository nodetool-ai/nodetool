/**
 * Page-load smoke suite.
 *
 * Loads every top-level app route against the seeded real backend and asserts
 * each one mounts cleanly: no uncaught exception, no React error boundary, no
 * `console.error`, no failed request. A route that throws on mount — a bad
 * import, a null-deref in a top-level component, a store that crashes on
 * rehydrate — fails here with the URL and the exact error text, long before it
 * reaches a visual diff or a user.
 *
 * The routes use ids seeded by `packages/websocket/src/screenshot-server.ts`
 * (workflows `wf-story-generator` / `wf-image-pipeline`, thread `thread-story`,
 * timeline `tl-demo-promo`, sketch `sk-demo-portrait`), so param routes render
 * real content instead of a not-found state.
 *
 * Run:
 *   npm run test:smoke
 *   npx playwright test -c playwright.smoke.config.ts
 */

import { test, expect } from "@playwright/test";
import {
  collectPageLoadErrors,
  readErrorBoundary,
  seedReturningUser,
  waitForAppReady,
  type PageLoadError,
} from "./pageLoadHelpers";

type Route = {
  /** Human label used in the test title. */
  name: string;
  /** URL path to navigate to. */
  url: string;
};

const ROUTES: Route[] = [
  { name: "dashboard", url: "/dashboard" },
  { name: "chat", url: "/chat/thread-story" },
  { name: "settings", url: "/settings" },
  { name: "costs", url: "/costs" },
  { name: "editor (story)", url: "/editor/wf-story-generator" },
  { name: "editor (image)", url: "/editor/wf-image-pipeline" },
  { name: "timeline", url: "/timeline/tl-demo-promo" },
  { name: "sketch", url: "/sketch/sk-demo-portrait" },
  { name: "apps runtime", url: "/apps/wf-story-generator" },
  { name: "app builder", url: "/app-builder/wf-story-generator" },
  { name: "assets", url: "/assets" },
  { name: "collections", url: "/collections" },
  { name: "examples", url: "/examples" },
  { name: "tutorials", url: "/tutorials" },
  { name: "models", url: "/models" },
  { name: "packages", url: "/packages" },
  { name: "workspaces", url: "/workspaces" },
];

function formatErrors(url: string, errors: PageLoadError[]): string {
  const lines = errors.map((e) => `  [${e.kind}] ${e.text.split("\n")[0]}`);
  return `Page load errors on ${url}:\n${lines.join("\n")}`;
}

for (const route of ROUTES) {
  test(`loads ${route.name} (${route.url}) without errors`, async ({
    page,
  }) => {
    const errors = collectPageLoadErrors(page);
    await seedReturningUser(page);

    await page.goto(route.url, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const boundary = await readErrorBoundary(page);
    if (boundary) {
      errors.push({ kind: "errorboundary", text: boundary });
    }

    expect(errors, formatErrors(route.url, errors)).toEqual([]);
  });
}
