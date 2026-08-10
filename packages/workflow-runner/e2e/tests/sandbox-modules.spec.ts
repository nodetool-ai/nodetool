import { test, expect } from "@playwright/test";
import { SANDBOX_MODULE_FIXTURES } from "@nodetool-ai/agents/sandbox-module-fixtures";

/**
 * One sandbox-module contract, two runtimes.
 *
 * The rules that decide what a guest may import — which specifiers resolve,
 * which are denied and what the denial says — are enforced by the QuickJS
 * loader, not by anything platform-specific. M2 makes that loader run in the
 * browser, so the same rules now have to hold there, and "have to hold" is only
 * worth anything if something checks.
 *
 * These cases are the data in `@nodetool-ai/agents/sandbox-module-fixtures`,
 * the same array `packages/agents/tests/js-sandbox-modules.test.ts` drives
 * under vitest. The catalog is seeded in the page: HTTP delivery has its own
 * tests on both sides, and what this proves is loader parity.
 */

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => {
    console.log("[browser pageerror]", err.message);
  });
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (window as unknown as { workflowRunnerReady?: boolean })
        .workflowRunnerReady === true,
    null,
    { timeout: 15_000 }
  );
});

test.describe("sandbox module contract", () => {
  // QuickJS boots a WASM runtime per case; the first also pays the lazy chunk.
  test.setTimeout(120_000);

  for (const fixture of SANDBOX_MODULE_FIXTURES) {
    test(`${fixture.name}: ${fixture.description}`, async ({ page }) => {
      const outcome = await page.evaluate(
        (name) => window.runSandboxFixtureInBrowser(name),
        fixture.name
      );

      if (fixture.errorContains === undefined) {
        expect(outcome.error).toBeUndefined();
        expect(outcome.status).toBe("completed");
        // The Code node returns a bare value under the default `output` slot.
        expect((outcome.result as Record<string, unknown>)?.output).toEqual(
          fixture.result
        );
        return;
      }

      // A caught dynamic import() returns its message and the run completes; a
      // static one fails the node. The contract is what the message names.
      const reported = fixture.catchesError
        ? String((outcome.result as Record<string, unknown>)?.output)
        : String(outcome.error);
      expect(outcome.status).toBe(
        fixture.catchesError ? "completed" : "failed"
      );
      for (const substring of fixture.errorContains) {
        expect(reported).toContain(substring);
      }
    });
  }
});
