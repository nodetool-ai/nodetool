/**
 * Shared fixtures for the user-journey suite.
 *
 * Every journey starts from the same place: a reset backend and a returning
 * user (onboarding dismissed, dark mode). Browser errors and error boundaries
 * are checked automatically after each test. `waitForAppReady` throws if a
 * route never leaves the boot spinner.
 */

import { test as base, expect, type Page } from "@playwright/test";
import {
  collectPageLoadErrors,
  isIgnoredMessage,
  readErrorBoundary,
  readVisibleErrorBoundaries,
  seedReturningUser,
  waitForAppReady,
  type PageLoadError
} from "../smoke/pageLoadHelpers";

/** Ids seeded by `packages/websocket/src/screenshot-server.ts`. */
export const FIXTURES = {
  /** Two-node echo graph. The workflow the mini app's operation binds. */
  miniApp: "wf-mini-app",
  /** The `applications` row built on that graph. Used by the mini-app journey. */
  miniAppId: "app-mini-app",
  /** Its display name — how a user picks it out of the Apps panel. */
  miniAppName: "Echo Mini App",
  /** Same graph, separate row — keeps the editor fixture distinct by identity. */
  editorGraph: "wf-editor-journey",
  /** Seeded thread with existing messages. */
  thread: "thread-story",
  /** The value seeded into the echo graph's StringInput. */
  echoSeedValue: "hello journey"
} as const;

/** The reply every faked provider returns — see `fake-runtime.ts`. */
export const FAKE_LLM_TEXT = "deterministic e2e response";

/** Select a model accepted by the hermetic provider before the app hydrates. */
async function seedFakeChatModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "global-chat-storage",
      JSON.stringify({
        state: {
          threads: {},
          selectedModel: {
            type: "language_model",
            id: "claude-sonnet-5",
            name: "Claude Sonnet 5",
            provider: "anthropic"
          }
        },
        version: 1
      })
    );
  });
}

type JourneyFixtures = {
  /** Page-load problems recorded since navigation. Assert on this to catch a
   *  journey that "worked" while throwing underneath. */
  pageErrors: PageLoadError[];
};

export const test = base.extend<JourneyFixtures>({
  pageErrors: [async ({ page, request }, use, testInfo) => {
    const reset = await request.post("/api/test/reset");
    if (!reset.ok()) {
      throw new Error(
        `journey fixture reset failed (${reset.status()}): ${await reset.text()}`
      );
    }
    await seedReturningUser(page);
    await seedFakeChatModel(page);
    const errors = collectPageLoadErrors(page, { includeDataRequests: true });
    await use(errors);
    const routeBoundary = await readErrorBoundary(page);
    if (routeBoundary) {
      errors.push({ kind: "errorboundary", text: routeBoundary });
    }
    const embeddedBoundaries = await readVisibleErrorBoundaries(page);
    for (const text of embeddedBoundaries) {
      errors.push({ kind: "errorboundary", text });
    }
    expect(
      errors,
      `Journey ${testInfo.title} observed browser errors:\n${errors
        .map((error) => `  [${error.kind}] ${error.text.split("\n")[0]}`)
        .join("\n")}`
    ).toEqual([]);
  }, { auto: true }]
});

export { expect, waitForAppReady, isIgnoredMessage };
export type { PageLoadError };
