import type { Page } from "@playwright/test";

interface ReadinessObservation {
  readonly kind: string;
  readonly footer: string;
  readonly disabled: boolean;
  readonly oldValue: string | null;
}

declare global {
  interface Window {
    nativeGameReadiness?: {
      readonly observations: ReadinessObservation[];
      readonly failures: string[];
      readonly observer: MutationObserver;
      readonly root: Element;
      readonly footer: HTMLElement;
      readonly play: HTMLButtonElement;
    };
  }
}

export async function observeNativeGameReadiness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const footer = [...document.querySelectorAll("footer")].find((element) => element.textContent?.includes("Tick "));
    const play = [...document.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === "Play");
    const root = footer?.parentElement;
    if (!footer || !root || !play || play.disabled || footer.textContent?.includes("Initializing")) {
      throw new Error("Native editor is not ready for edit observation");
    }
    const observations: ReadinessObservation[] = [];
    const failures: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        observations.push({ kind: record.type, footer: footer.textContent ?? "", disabled: play.disabled, oldValue: record.oldValue });
        if (play.disabled) { failures.push("Play became disabled"); }
        if (footer.textContent?.includes("Initializing")) { failures.push("Footer entered Initializing"); }
        if (record.target === play && record.attributeName === "disabled" && record.oldValue !== null) {
          failures.push("Play was disabled before attribute removal");
        }
        if (footer.contains(record.target) && record.oldValue?.includes("Initializing")) {
          failures.push("Footer previously contained Initializing");
        }
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if ((footer.contains(record.target) || node === footer || node.contains(footer)) && node.textContent?.includes("Initializing")) {
            failures.push("Footer mutation contained Initializing");
          }
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, characterDataOldValue: true,
      attributes: true, attributeOldValue: true, attributeFilter: ["disabled"] });
    window.nativeGameReadiness = { observations, failures, observer, root, footer, play };
  });
}

/** Corroborates readiness across the debounce window; hook tests prove each preview frame completes. */
export async function settleNativeGameEdit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const observation = window.nativeGameReadiness;
    if (!observation) { throw new Error("Native edit observation was not armed"); }
    const start = performance.now();
    while (performance.now() - start < 200) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); }
    observation.observations.push({ kind: "edit-settled", footer: observation.footer.textContent ?? "",
      disabled: observation.play.disabled, oldValue: null });
    if (!observation.root.isConnected || !observation.root.contains(observation.footer) || !observation.root.contains(observation.play)) {
      observation.failures.push("Observed editor was replaced");
    }
  });
}

export async function finishNativeGameReadiness(page: Page): Promise<{
  readonly observations: ReadinessObservation[];
  readonly failures: string[];
}> {
  return page.evaluate(() => {
    const observation = window.nativeGameReadiness;
    if (!observation) { throw new Error("Native edit observation was not armed"); }
    observation.observer.disconnect();
    delete window.nativeGameReadiness;
    return { observations: observation.observations, failures: observation.failures };
  });
}
