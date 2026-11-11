/**
 * Doherty threshold measurement for the latency suite.
 *
 * Walter Doherty and Ahrvind Thadani (IBM, 1982) found that productivity rises
 * sharply once a system answers in under 400 ms. This module times one user
 * interaction from the input event to the frame that shows its result.
 *
 * How a sample is taken:
 *
 * 1. `arm` installs capture-phase listeners in the page. The first trusted
 *    input event (key, pointer, wheel, text input) after arming starts the
 *    clock at its `event.timeStamp`, so Playwright's own round trip is not
 *    counted.
 * 2. The test performs the interaction through Playwright.
 * 3. A `requestAnimationFrame` loop checks the conditions. The first frame in
 *    which one holds stops its clock: that frame is the one that paints it.
 * 4. A `PerformanceObserver` for `event` entries records the longest Event
 *    Timing duration (input to next paint, the INP metric) inside the window.
 *    It catches main-thread jank even when the visible result is fast.
 *
 * The rule each interaction is held to:
 *
 * - The user sees a response within 400 ms. That response is the result
 *   itself, or, for an interaction declared with `feedback`, an immediate sign
 *   that the result is coming (the new tab, a skeleton, a spinner).
 * - An interaction with `feedback` may take up to `loadedBudgetMs` (1 s by
 *   default) to show its full result. One without it gets 400 ms.
 *
 * A condition that already holds before the interaction throws, so a sample
 * cannot pass by measuring nothing.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";

/** The Doherty threshold. */
export const DOHERTY_MS = 400;

/** Default time to the full result when immediate feedback is shown first. */
export const LOADED_BUDGET_MS = 1_000;

/** Something the user can see on screen. */
export type ScreenCondition = {
  /** CSS selector of the element that shows the result. */
  selector: string;
  /** `visible` (default): a match is rendered. `hidden`: no match is rendered. */
  state?: "visible" | "hidden";
  /** A visible match's text or input value must include this. */
  text?: string;
  /** At least this many visible matches. */
  minCount?: number;
  /**
   * Holds once the first match's inline style or text differs from its value
   * when the sample was armed. For results with no new element, such as a pan
   * or a zoom that only changes a transform.
   */
  changes?: "style" | "text";
};

export type Sample = {
  /** Input event to the first painted frame showing the full result. */
  responseMs: number;
  /** Input event to the first painted frame showing feedback or the result. */
  feedbackMs: number;
  /** Longest Event Timing duration in the window, or 0 under 16 ms. */
  longestEventMs: number;
};

type Stats = { coldMs: number; medianMs: number; maxMs: number };

export type InteractionResult = {
  name: string;
  /** Budget for the full result. */
  budgetMs: number;
  samples: Sample[];
  /** The first sample runs with cold chunks, queries and caches. */
  response: Stats;
  feedback: Stats;
  longestEventMs: number;
};

type Outcome = { response: number; feedback: number } | { error: string };

type ArmedWindow = Window & {
  __doherty?: {
    readonly start: number | null;
    readonly longestEvent: number;
    done: Promise<Outcome>;
    observer: PerformanceObserver;
    drain: () => void;
    cleanup: () => void;
  };
};

/** Install listeners and the frame loop. Rejects if a condition already holds. */
async function arm(
  page: Page,
  ready: ScreenCondition,
  feedback: ScreenCondition | null,
  timeoutMs: number
): Promise<void> {
  await page.evaluate(
    ({ ready, feedback, timeoutMs }) => {
      const w = window as ArmedWindow;
      w.__doherty?.cleanup();

      // Rendered, inside the viewport, and the topmost element at a point
      // inside it. A node in a collapsed or clipped panel still has a box, so
      // a box alone does not mean the user can see it.
      const isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
          return false;
        }
        const left = Math.max(rect.left, 0);
        const right = Math.min(rect.right, window.innerWidth);
        const top = Math.max(rect.top, 0);
        const bottom = Math.min(rect.bottom, window.innerHeight);
        if (right - left < 1 || bottom - top < 1) {
          return false;
        }
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return hit !== null && (hit === el || el.contains(hit));
      };
      const textOf = (el: Element): string =>
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.value
          : (el.textContent ?? "");
      const compile = (condition: ScreenCondition): (() => boolean) => {
        const snapshot = (): string | null => {
          const el = document.querySelector(condition.selector);
          if (!el) {
            return null;
          }
          return condition.changes === "style"
            ? (el.getAttribute("style") ?? "")
            : textOf(el);
        };
        const before = condition.changes ? snapshot() : null;
        const holds = (): boolean => {
          if (condition.changes) {
            const now = snapshot();
            return now !== null && now !== before;
          }
          const matches = Array.from(document.querySelectorAll(condition.selector))
            .filter(isVisible)
            .filter((el) => condition.text === undefined || textOf(el).includes(condition.text));
          if (condition.state === "hidden") {
            return matches.length === 0;
          }
          return matches.length >= (condition.minCount ?? 1);
        };
        if (holds()) {
          throw new Error(
            `condition already holds before the interaction: ${JSON.stringify(condition)}`
          );
        }
        return holds;
      };
      const readyHolds = compile(ready);
      const feedbackHolds = feedback ? compile(feedback) : (): boolean => false;

      const events = ["keydown", "pointerdown", "mousedown", "wheel", "beforeinput"];
      const state = {
        start: null as number | null,
        feedback: null as number | null,
        longestEvent: 0
      };
      const onInput = (event: Event): void => {
        if (state.start === null && event.isTrusted) {
          state.start = event.timeStamp;
        }
      };
      for (const type of events) {
        window.addEventListener(type, onInput, { capture: true, passive: true });
      }

      const record = (entries: PerformanceEntryList): void => {
        for (const entry of entries) {
          if (state.start !== null && entry.startTime >= state.start - 1) {
            state.longestEvent = Math.max(state.longestEvent, entry.duration);
          }
        }
      };
      const observer = new PerformanceObserver((list) => record(list.getEntries()));
      observer.observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);

      let frame = 0;
      let timer = 0;
      const cleanup = (): void => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        for (const type of events) {
          window.removeEventListener(type, onInput, { capture: true });
        }
      };
      const done = new Promise<Outcome>((resolve) => {
        timer = window.setTimeout(() => {
          cleanup();
          resolve({ error: state.start === null ? "no input event reached the page" : "timed out" });
        }, timeoutMs);
        const tick = (): void => {
          if (state.start !== null) {
            const now = performance.now();
            if (state.feedback === null && feedbackHolds()) {
              state.feedback = now;
            }
            if (readyHolds()) {
              cleanup();
              resolve({
                response: now - state.start,
                feedback: (state.feedback ?? now) - state.start
              });
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });

      w.__doherty = {
        get start() {
          return state.start;
        },
        get longestEvent() {
          return state.longestEvent;
        },
        done,
        observer,
        drain: () => record(observer.takeRecords()),
        cleanup
      };
    },
    { ready, feedback, timeoutMs }
  );
}

async function collect(page: Page): Promise<Sample> {
  const result = await page.evaluate(async () => {
    const armed = (window as ArmedWindow).__doherty;
    if (!armed) {
      return { error: "harness was not armed" };
    }
    const outcome = await armed.done;
    // Event Timing entries are queued after the paint they measure.
    await new Promise((resolve) => setTimeout(resolve, 50));
    armed.drain();
    armed.observer.disconnect();
    if ("error" in outcome) {
      return { error: outcome.error };
    }
    return {
      responseMs: outcome.response,
      feedbackMs: outcome.feedback,
      longestEventMs: armed.longestEvent
    };
  });
  if ("error" in result) {
    throw new Error(`latency sample failed: ${result.error}`);
  }
  return result as Sample;
}

export type InteractionSpec = {
  name: string;
  /** Repetitions. The first is reported as the cold sample. */
  runs?: number;
  /** Puts the page back in the state the interaction starts from. Not timed. */
  reset?: () => Promise<void>;
  act: () => Promise<void>;
  /** The full result. A function is evaluated after `reset`. */
  ready: ScreenCondition | (() => Promise<ScreenCondition>);
  /**
   * Immediate feedback shown while the result loads. Declaring it gives the
   * full result `loadedBudgetMs` instead of 400 ms.
   */
  feedback?: ScreenCondition | (() => Promise<ScreenCondition>);
  loadedBudgetMs?: number;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const stats = (values: number[]): Stats => ({
  coldMs: Math.round(values[0]),
  medianMs: Math.round(median(values)),
  maxMs: Math.round(Math.max(...values))
});

const resolveCondition = async (
  condition: ScreenCondition | (() => Promise<ScreenCondition>)
): Promise<ScreenCondition> =>
  typeof condition === "function" ? condition() : condition;

/**
 * Measure an interaction `runs` times, record the samples, and fail when any
 * sample, cold or warm, misses its budget.
 */
export async function measureInteraction(
  page: Page,
  testInfo: TestInfo,
  spec: InteractionSpec
): Promise<InteractionResult> {
  const runs = spec.runs ?? 5;
  const budgetMs = spec.feedback ? (spec.loadedBudgetMs ?? LOADED_BUDGET_MS) : DOHERTY_MS;
  const samples: Sample[] = [];
  for (let index = 0; index < runs; index += 1) {
    await spec.reset?.();
    const ready = await resolveCondition(spec.ready);
    const feedback = spec.feedback ? await resolveCondition(spec.feedback) : null;
    try {
      await arm(page, ready, feedback, 10_000);
      await spec.act();
      samples.push(await collect(page));
    } catch (error) {
      throw new Error(
        `${spec.name}, run ${index + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const result: InteractionResult = {
    name: spec.name,
    budgetMs,
    samples,
    response: stats(samples.map((s) => s.responseMs)),
    feedback: stats(samples.map((s) => s.feedbackMs)),
    longestEventMs: Math.round(Math.max(...samples.map((s) => s.longestEventMs)))
  };

  mkdirSync(testInfo.project.outputDir, { recursive: true });
  appendFileSync(
    path.join(testInfo.project.outputDir, "doherty.jsonl"),
    `${JSON.stringify({ test: testInfo.title, ...result })}\n`
  );
  const row = (label: string, s: Stats): string =>
    `${label} cold ${String(s.coldMs).padStart(4)} median ${String(s.medianMs).padStart(4)} max ${String(s.maxMs).padStart(4)} ms`;
  const line = `${result.name.padEnd(40)} ${row("result", result.response)}${
    spec.feedback ? `  ${row("feedback", result.feedback)}` : ""
  }  event ${result.longestEventMs} ms`;
  testInfo.annotations.push({ type: "doherty", description: line });
  console.log(`[doherty] ${line}`);

  expect
    .soft(result.feedback.maxMs, `${spec.name}: no response within the ${DOHERTY_MS} ms Doherty threshold`)
    .toBeLessThanOrEqual(DOHERTY_MS);
  expect
    .soft(result.response.maxMs, `${spec.name}: result took longer than ${budgetMs} ms`)
    .toBeLessThanOrEqual(budgetMs);
  return result;
}
