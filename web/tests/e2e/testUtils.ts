/**
 * Utility to skip Playwright tests when run by Jest
 * 
 * Playwright tests should be run via `npm run test:e2e`, not through Jest.
 * This utility helps ensure tests are only run in the appropriate context.
 */

import { test } from "@playwright/test";

/**
 * Wraps a Playwright test describe block to skip it when run by Jest
 * @param name - Describe block name
 * @param describeFn - Function containing tests
 */
export function playwrightDescribe(
  name: string,
  describeFn: () => void
): void {
  if (process.env.JEST_WORKER_ID) {
    // In Jest context, skip the describe block
    return;
  } else {
    test.describe(name, describeFn);
  }
}

/**
 * Skip wrapper for playwrightDescribe - use like: playwrightDescribe.skip(...)
 */
playwrightDescribe.skip = (name: string, describeFn: () => void) => {
  test.describe.skip(name, describeFn);
};

/**
 * Only wrapper for playwrightDescribe - use like: playwrightDescribe.only(...)
 */
playwrightDescribe.only = (name: string, describeFn: () => void) => {
  test.describe.only(name, describeFn);
};

/**
 * Returns true if currently running in Playwright context (not Jest)
 */
export function isPlaywrightContext(): boolean {
  return !process.env.JEST_WORKER_ID;
}
