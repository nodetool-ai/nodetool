import { test, expect } from "@playwright/test";

// Cumulative Layout Shift gate. CLS is layout-driven and stable across runs
// (unlike CPU-bound perf scores, which is why the Lighthouse job stays
// informational), so it's safe to block a PR on it. Budget matches Google's
// "good" threshold.
const CLS_BUDGET = 0.1;

// Pages this gate guards. The homepage is the one Google flagged (0.58); add
// more paths here once each has been audited and reserves its media space.
const ROUTES = ["/"];

// layout-shift entries aren't in the DOM lib.
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

declare global {
  interface Window {
    __clsValue?: number;
  }
}

test.describe("Cumulative Layout Shift budget", () => {
  for (const path of ROUTES) {
    test(`${path} stays under ${CLS_BUDGET} CLS through a full scroll`, async ({
      page,
    }) => {
      // Observe from document start so no early shift is missed, and score with
      // the session-window algorithm (1s gap / 5s cap, input-excluded shifts)
      // that Chrome and CrUX use — a naive sum overcounts real CLS.
      await page.addInitScript(() => {
        window.__clsValue = 0;
        let sessionValue = 0;
        let firstTs = 0;
        let lastTs = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as LayoutShiftEntry;
            if (shift.hadRecentInput) continue;
            if (
              sessionValue &&
              shift.startTime - lastTs < 1000 &&
              shift.startTime - firstTs < 5000
            ) {
              sessionValue += shift.value;
              lastTs = shift.startTime;
            } else {
              sessionValue = shift.value;
              firstTs = shift.startTime;
              lastTs = shift.startTime;
            }
            if (sessionValue > (window.__clsValue ?? 0)) {
              window.__clsValue = sessionValue;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });

      await page.goto(path, { waitUntil: "load" });

      // Reproduce the field conditions the initial-viewport lab audit never
      // sees: walk the whole page so lazy media and client-injected content
      // (e.g. the GitHub star badge) get their chance to shift the layout.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let y = 0;
            const stepPx = Math.round(window.innerHeight * 0.9);
            const step = () => {
              window.scrollTo(0, y);
              if (y >= document.documentElement.scrollHeight) {
                window.scrollTo(0, 0);
                setTimeout(resolve, 400);
                return;
              }
              y += stepPx;
              setTimeout(step, 150);
            };
            step();
          })
      );

      // Let any post-scroll, network-driven shift settle before sampling.
      await page.waitForTimeout(500);

      const cls = await page.evaluate(() => window.__clsValue ?? 0);
      // eslint-disable-next-line no-console
      console.log(`[CLS] ${path} = ${cls.toFixed(4)} (budget ${CLS_BUDGET})`);
      expect(cls).toBeLessThan(CLS_BUDGET);
    });
  }
});
