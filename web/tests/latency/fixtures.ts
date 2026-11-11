/**
 * Shared setup for the latency suite: a reset, seeded backend and a returning
 * user, as in the journey suite. Browser errors are not asserted here. The
 * journey suite owns that check, and this suite only times interactions.
 */

import { test as base } from "@playwright/test";
import { seedReturningUser } from "../smoke/pageLoadHelpers";

export const test = base.extend<{ seeded: void }>({
  seeded: [
    async ({ page, request }, use) => {
      const reset = await request.post("/api/test/reset");
      if (!reset.ok()) {
        throw new Error(`latency fixture reset failed (${reset.status()}): ${await reset.text()}`);
      }
      await seedReturningUser(page);
      await use();
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
