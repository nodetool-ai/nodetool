/**
 * Shared fixtures for the user-journey suite.
 *
 * Every journey starts from the same place: a returning user (onboarding
 * dismissed, dark mode) on a booted app, with console errors being recorded so
 * a spec can assert the journey completed *cleanly* rather than merely
 * completing. `waitForAppReady` throws if a route never leaves the boot
 * spinner, so a hung page fails where it happens instead of at the assertion.
 */

import { test as base, expect } from "@playwright/test";
import {
  collectPageLoadErrors,
  isIgnoredMessage,
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
  /** Same graph, separate row — the editor journey mutates this one. */
  editorGraph: "wf-editor-journey",
  /** Seeded thread with existing messages. */
  thread: "thread-story",
  /** The value seeded into the echo graph's StringInput. */
  echoSeedValue: "hello journey"
} as const;

/** The reply every faked provider returns — see `fake-runtime.ts`. */
export const FAKE_LLM_TEXT = "deterministic e2e response";

type JourneyFixtures = {
  /** Page-load problems recorded since navigation. Assert on this to catch a
   *  journey that "worked" while throwing underneath. */
  pageErrors: PageLoadError[];
};

export const test = base.extend<JourneyFixtures>({
  pageErrors: async ({ page }, use) => {
    await seedReturningUser(page);
    const errors = collectPageLoadErrors(page);
    await use(errors);
  }
});

export { expect, waitForAppReady, isIgnoredMessage };
export type { PageLoadError };
