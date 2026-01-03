/**
 * Utility to skip Playwright tests when run by Jest
 * 
 * Playwright tests should be run via `npm run test:e2e`, not through Jest.
 * This utility helps ensure tests are only run in the appropriate context.
 */

import { test } from "@playwright/test";

/**
 * Wraps a Playwright test to skip it when run by Jest
 * @param name - Test name
 * @param testFn - Test function to run
 */
export function playwrightTest(
  name: string,
  testFn: Parameters<typeof test>[1]
): void {
  if (process.env.JEST_WORKER_ID) {
    test.skip(`${name} (skipped in jest runner)`, () => {});
  } else {
    test(name, testFn);
  }
}

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
    test.skip(`${name} (skipped in jest runner)`, () => {});
  } else {
    test.describe(name, describeFn);
  }
}

/**
 * Returns true if currently running in Playwright context (not Jest)
 */
export function isPlaywrightContext(): boolean {
  return !process.env.JEST_WORKER_ID;
}
