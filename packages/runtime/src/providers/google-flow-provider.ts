/**
 * Google Flow (`flow.google.com`) image and video generation through the user's
 * own logged-in Chrome tab, driven by the NodeTool Chrome extension. No API
 * key: requests run on the user's signed-in Google account and Flow AI credits.
 *
 * Generations are submitted through Flow's own Angular Material composer with a
 * trusted CDP mouse click (`ExtensionTab.clickAt`). The provider never invokes
 * `grecaptcha` or attempts to solve or bypass any verification challenge: if
 * Flow shows a CAPTCHA or a confirmation dialog (such as the one-time upload
 * rights notice), the provider stops and reports it so the user can complete it
 * directly in Chrome.
 *
 * Outputs always request `x1` so a single workflow run does not burn 2x–4x
 * credits. Generated images download via their FIFE `=s0` full-resolution URL
 * and videos download via Flow's `=mm,22,15` MP4 URL using the browser's cookies.
 *
 * One tab serves every call, so calls run one at a time. Local installs only.
 */
import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import {
  createExtensionTab,
  pollTab,
  stageBytesInTab,
  type ExtensionTab
} from "./extension-tab.js";
import {
  FLOW_IMAGE_SPECS,
  FLOW_VIDEO_SPECS,
  GOOGLE_FLOW_IMAGE_MODELS,
  GOOGLE_FLOW_VIDEO_MODELS,
  type FlowImageModelSpec,
  type FlowVideoModelSpec
} from "./google-flow-models.js";
import { detectImageMime, extForImageMime } from "./image-mime.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  Message,
  ProviderStreamItem,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.google-flow");

const HOST = "flow.google.com";
const BASE_URL = `https://${HOST}`;
const PROMPT_BOX = "flow-prompt-box";
const COMPOSER = `${PROMPT_BOX} .ProseMirror[role="textbox"]`;
const SETTINGS_TRIGGER = `${PROMPT_BOX} .settings-trigger-button`;
const GENERATE_BUTTON = `${PROMPT_BOX} button.generate-icon-button`;
const ADD_INGREDIENTS_BUTTON = `${PROMPT_BOX} button[aria-label="Add ingredients to the prompt box"]`;
const AGENT_SWITCH = 'button[aria-label="Flow Agent"]';
const AGENT_PANEL_CLOSE = 'flow-agent-panel button[aria-label="Close"]';
const MODEL_DROPDOWN = '.cdk-overlay-container button[aria-label="Select model family"]';
const OVERLAY = ".cdk-overlay-container";
const IMAGE_FULL_SIZE_SUFFIX = "=s0";
const VIDEO_MP4_SUFFIX = "=mm,22,15";

const ASPECT_ICONS: Readonly<Record<string, string>> = {
  "16:9": "crop_16_9",
  "4:3": "crop_landscape",
  "1:1": "crop_square",
  "3:4": "crop_portrait",
  "9:16": "crop_9_16"
};

const READY_TIMEOUT_MS = 25_000;
const OVERLAY_TIMEOUT_MS = 8_000;
const UPLOAD_TIMEOUT_MS = 45_000;
const SUBMIT_READY_TIMEOUT_MS = 30_000;
const SUBMIT_START_TIMEOUT_MS = 15_000;
const IMAGE_POLL_INTERVAL_MS = 2_000;
const VIDEO_POLL_INTERVAL_MS = 3_000;
const IMAGE_TIMEOUT_MS = 5 * 60_000;
const VIDEO_TIMEOUT_MS = 15 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const MISSING_TILE_GRACE_MS = 15_000;
const MAX_POLL_FAILURES = 5;
const MAX_REFERENCE_IMAGES = 10;

let tab: ExtensionTab | null = null;

/** Replace the tab. Tests use this to avoid a real browser. */
export function setGoogleFlowTab(next: ExtensionTab | null): void {
  tab = next;
}

function currentTab(): ExtensionTab {
  return (tab ??= createExtensionTab(HOST));
}

/** Calls share one tab, so each waits for the previous one. */
let activeSignal: AbortSignal | undefined;
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const owned = async (): Promise<T> => {
    try {
      return await run();
    } finally {
      activeSignal = undefined;
      await tab?.release?.();
    }
  };
  const next = queue.then(owned, owned);
  queue = next.catch(() => undefined);
  return next;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function evaluate<T>(expression: string, timeoutMs?: number): Promise<T> {
  activeSignal?.throwIfAborted();
  return (await currentTab().evaluate(expression, timeoutMs, activeSignal)) as T;
}

function poll<T>(expression: string, timeoutMs: number): Promise<T | null> {
  return pollTab<T>(currentTab(), expression, timeoutMs, activeSignal);
}

/** Strip Google FIFE sizing/format suffix (`=s512-rw`, `=mm,22,15`, etc.). */
export function stripFlowMediaSuffix(url: string): string {
  return url.replace(/=[^=/]+$/, "");
}

/** Full-resolution image URL for a Flow `/asb/` asset. */
export function flowImageDownloadUrl(url: string): string {
  return `${stripFlowMediaSuffix(url)}${IMAGE_FULL_SIZE_SUFFIX}`;
}

/** Full MP4 video URL for a Flow `/asb/` asset. */
export function flowVideoDownloadUrl(url: string): string {
  return `${stripFlowMediaSuffix(url)}${VIDEO_MP4_SUFFIX}`;
}

/** Resolve an image aspect ratio from explicit ratio or pixel dimensions. */
export function resolveAspectRatio(
  allowed: readonly string[],
  aspectRatio?: string | null,
  width?: number | null,
  height?: number | null,
  fallback = "16:9"
): string {
  if (aspectRatio) {
    if (allowed.includes(aspectRatio)) return aspectRatio;
    throw new Error(
      `Google Flow does not support aspect ratio ${aspectRatio}. Use one of ${allowed.join(", ")}`
    );
  }
  if (width && height && width > 0 && height > 0) {
    const target = width / height;
    let best = allowed[0] ?? fallback;
    let bestDiff = Infinity;
    for (const candidate of allowed) {
      const [w, h] = candidate.split(":").map(Number);
      if (!w || !h) continue;
      const diff = Math.abs(w / h - target);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best;
  }
  return allowed.includes(fallback) ? fallback : (allowed[0] ?? fallback);
}

function imageSpecFor(modelId: string): FlowImageModelSpec {
  const spec = FLOW_IMAGE_SPECS.find((m) => m.id === modelId);
  if (!spec) {
    throw new Error(
      `Unknown Google Flow image model: ${modelId}. Available: ${FLOW_IMAGE_SPECS.map((m) => m.id).join(", ")}`
    );
  }
  return spec;
}

function videoSpecFor(modelId: string): FlowVideoModelSpec {
  const spec = FLOW_VIDEO_SPECS.find((m) => m.id === modelId);
  if (!spec) {
    throw new Error(
      `Unknown Google Flow video model: ${modelId}. Available: ${FLOW_VIDEO_SPECS.map((m) => m.id).join(", ")}`
    );
  }
  return spec;
}

interface BlockingState {
  captcha: boolean;
  dialog: string | null;
  snackbar: string | null;
}

/**
 * Inspect the page for a visible reCAPTCHA challenge or blocking modal dialog.
 * Never interacts with or attempts to solve a challenge: throws immediately so
 * the user can complete it directly in Chrome.
 */
async function assertNoBlockingChallenge(): Promise<void> {
  const state = await evaluate<BlockingState>(`/*nt:flow:check-block*/ (() => {
    const captchaFrame = [...document.querySelectorAll('iframe[src*="recaptcha"]')].find((f) => {
      const src = f.getAttribute("src") || "";
      if (!src.includes("bframe")) return false;
      const rect = f.getBoundingClientRect();
      const style = window.getComputedStyle(f);
      return rect.width > 20 && rect.height > 20 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    });
    const dialog = [...document.querySelectorAll('[role="dialog"], mat-dialog-container')].find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 20 && rect.height > 20 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0.2;
    });
    const snackbar = document.querySelector(".mat-mdc-snack-bar-container, [role=alert]");
    const snackText = snackbar ? (snackbar.innerText || "").trim() : "";
    return {
      captcha: Boolean(captchaFrame),
      dialog: dialog ? (dialog.innerText || "").trim().slice(0, 300) : null,
      snackbar: snackText ? snackText.slice(0, 300) : null
    };
  })()`);
  if (state.captcha) {
    throw new Error(
      "Google Flow requested a CAPTCHA verification. Complete it in your flow.google.com Chrome tab and try again"
    );
  }
  if (state.dialog) {
    throw new Error(
      `Google Flow is showing a confirmation dialog in Chrome ("${state.dialog.split("\n")[0]}"). Complete it in your flow.google.com tab and try again`
    );
  }
}

/** Issue a trusted CDP click on the center of `selector`, falling back to `.click()` in tests without `clickAt`. */
async function trustedClick(selector: string, label: string): Promise<void> {
  const rect = await evaluate<{ x: number; y: number } | null>(`/*nt:flow:rect*/ (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return null;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  })()`);
  if (!rect) {
    throw new Error(`Google Flow ${label} was not visible (${selector})`);
  }
  const activeTab = currentTab();
  if (activeTab.clickAt) {
    await activeTab.clickAt(rect.x, rect.y, activeSignal);
  } else {
    await evaluate(`/*nt:flow:fallback-click*/ (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) el.click();
      return true;
    })()`);
  }
}

/** Close any open Angular CDK overlay menus/popovers. */
async function closeOverlays(): Promise<void> {
  await evaluate(`/*nt:flow:close-overlays*/ (() => {
    const backdrops = [...document.querySelectorAll(".cdk-overlay-backdrop")];
    for (const b of backdrops) b.click();
    const ov = document.querySelector(${JSON.stringify(OVERLAY)});
    if (ov && ov.querySelector("[role=menu], [role=listbox], button[aria-label='Select model family']")) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    return backdrops.length;
  })()`);
  await sleep(250, activeSignal);
}

/**
 * Ensure the Flow tab is signed in, inside a project, on the All media view,
 * with the Creative Agent sidebar/switch off so the direct media composer is active.
 */
async function ensureProjectComposerReady(): Promise<void> {
  const status = await evaluate<{
    href: string;
    pathname: string;
    signedIn: boolean;
    firstProjectHref: string | null;
    hasNewProjectButton: boolean;
  }>(`/*nt:flow:status*/ (() => {
    const signedIn = Boolean(
      document.querySelector('a[aria-label*="Google Account"], flow-header-user-icon, flow-user-tier-chip') ||
      (window.WIZ_global_data && (window.WIZ_global_data.oPEP7c || window.WIZ_global_data.SNlM0e))
    );
    const projectLink = document.querySelector('a[aria-label="Open project"]');
    const newBtn = [...document.querySelectorAll("button")].find((b) =>
      b.querySelector("mat-icon")?.textContent?.trim() === "add" && /new project/i.test(b.innerText || "")
    );
    return {
      href: location.href,
      pathname: location.pathname,
      signedIn,
      firstProjectHref: projectLink ? projectLink.href : null,
      hasNewProjectButton: Boolean(newBtn)
    };
  })()`);

  if (!status.signedIn) {
    throw new Error(
      `Google Flow is not signed in. Open ${BASE_URL} in Chrome, sign in, and try again`
    );
  }

  // If sitting on the home page instead of a project, open the newest project or create one.
  if (!/^\/project\/[^/]+/.test(status.pathname)) {
    if (status.firstProjectHref) {
      await currentTab().navigate(status.firstProjectHref, activeSignal);
    } else if (status.hasNewProjectButton) {
      await evaluate(`/*nt:flow:new-project*/ (() => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          b.querySelector("mat-icon")?.textContent?.trim() === "add" && /new project/i.test(b.innerText || "")
        );
        if (btn) btn.click();
        return Boolean(btn);
      })()`);
      const entered = await poll<boolean>(
        `/*nt:flow:project-url*/ /^\\/project\\/[^/]+/.test(location.pathname)`,
        READY_TIMEOUT_MS
      );
      if (!entered) {
        throw new Error("Could not open a Google Flow project. Open a project at https://flow.google.com and try again");
      }
    } else {
      throw new Error("Open a project in your https://flow.google.com Chrome tab and try again");
    }
  }

  // Wait for either the direct prompt box or the Flow Agent sidebar/switch to finish rendering.
  const loaded = await poll<boolean>(
    `/*nt:flow:project-ready*/ !!(document.querySelector(${JSON.stringify(PROMPT_BOX)}) || document.querySelector(${JSON.stringify(AGENT_PANEL_CLOSE)}) || document.querySelector(${JSON.stringify(AGENT_SWITCH)}))`,
    READY_TIMEOUT_MS
  );
  if (!loaded) {
    throw new Error("The Google Flow project editor did not load. Reload your flow.google.com tab and try again");
  }

  await assertNoBlockingChallenge();
  await closeOverlays();

  // Close the right-hand Flow Agent panel if it is open, then switch Flow Agent mode OFF.
  await evaluate(`/*nt:flow:disable-agent*/ (() => {
    const closeBtn = document.querySelector(${JSON.stringify(AGENT_PANEL_CLOSE)});
    if (closeBtn) closeBtn.click();
    return Boolean(closeBtn);
  })()`);
  await sleep(300, activeSignal);

  await evaluate(`/*nt:flow:direct-mode*/ (() => {
    const sw = document.querySelector(${JSON.stringify(AGENT_SWITCH)});
    if (sw && (sw.classList.contains("checked") || sw.getAttribute("aria-checked") === "true" || sw.getAttribute("aria-pressed") === "true")) {
      sw.click();
      return "toggled";
    }
    return "already-direct";
  })()`);

  const composerReady = await poll<boolean>(
    `/*nt:flow:composer*/ !!(document.querySelector(${JSON.stringify(COMPOSER)}) && document.querySelector(${JSON.stringify(SETTINGS_TRIGGER)}) && !document.querySelector(${JSON.stringify(SETTINGS_TRIGGER)}).hidden)`,
    READY_TIMEOUT_MS
  );
  if (!composerReady) {
    throw new Error(
      "The Google Flow direct media composer did not appear. Turn off Flow Agent mode in your flow.google.com tab and try again"
    );
  }

  // Ensure the "All media" view is active so newly created image/video tiles appear in the grid.
  await evaluate(`/*nt:flow:all-media*/ (() => {
    const item = [...document.querySelectorAll("mat-sidenav button")].find(
      (b) => b.querySelector("mat-icon")?.textContent?.trim() === "dashboard"
    );
    if (item) item.click();
    return Boolean(item);
  })()`);
  await sleep(250, activeSignal);
}

/** Click a radio button inside the open settings overlay matching `predicate`. */
async function clickOverlayRadio(tag: string, predicateJs: string, label: string): Promise<void> {
  const ok = await evaluate<boolean>(`/*nt:flow:radio:${tag}*/ (() => {
    const ov = document.querySelector(${JSON.stringify(OVERLAY)});
    if (!ov) return false;
    const btn = [...ov.querySelectorAll('button[role="radio"]')].find((b) => (${predicateJs}));
    if (!btn) return false;
    if (btn.getAttribute("aria-checked") !== "true") btn.click();
    return true;
  })()`);
  if (!ok) {
    throw new Error(`Google Flow settings has no "${label}" option`);
  }
  await sleep(250, activeSignal);
}

/** Select a model from Flow's "Select model family" dropdown inside the open settings overlay. */
async function selectModelInOverlay(menuLabel: string): Promise<void> {
  const current = await evaluate<string | null>(`/*nt:flow:model-current*/ (() => {
    const btn = document.querySelector(${JSON.stringify(MODEL_DROPDOWN)});
    return btn ? (btn.innerText || "").trim() : null;
  })()`);
  if (!current) {
    throw new Error("Google Flow settings popover has no model selector");
  }
  if (current.includes(menuLabel)) return;

  await evaluate(`/*nt:flow:model-open*/ (() => {
    const btn = document.querySelector(${JSON.stringify(MODEL_DROPDOWN)});
    if (btn) btn.click();
    return Boolean(btn);
  })()`);

  const menuItems = await poll<string[]>(
    `/*nt:flow:model-items*/ (() => {
      const items = [...document.querySelectorAll(${JSON.stringify(`${OVERLAY} [role="menuitem"]`)})];
      return items.length > 0 ? items.map((i) => (i.innerText || "").trim().replace(/\\s+/g, " ")) : null;
    })()`,
    OVERLAY_TIMEOUT_MS
  );
  if (!menuItems) {
    throw new Error("Google Flow model menu did not open");
  }

  const picked = await evaluate<boolean>(`/*nt:flow:model-pick*/ (() => {
    const items = [...document.querySelectorAll(${JSON.stringify(`${OVERLAY} [role="menuitem"]`)})];
    const target = items.find((i) => (i.innerText || "").includes(${JSON.stringify(menuLabel)}));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!picked) {
    throw new Error(
      `Google Flow does not offer model "${menuLabel}" on this account. Available: ${menuItems.join(", ")}`
    );
  }
  await sleep(350, activeSignal);
}

/** Set Omni 1.2 Flash's MDC length slider (`min=0` -> 3s, `max=12` -> 15s) via trusted CDP click. */
async function setLengthSlider(seconds: number): Promise<void> {
  const slider = await evaluate<{
    min: number;
    max: number;
    current: number;
    x: number;
    y: number;
    width: number;
  } | null>(`/*nt:flow:slider-info*/ (() => {
    const inp = document.querySelector(".cdk-overlay-container input.mdc-slider__input");
    const host = document.querySelector(".cdk-overlay-container mat-slider, .cdk-overlay-container .mdc-slider");
    if (!inp || !host) return null;
    const b = host.getBoundingClientRect();
    return {
      min: Number(inp.min || "0"),
      max: Number(inp.max || "12"),
      current: Number(inp.value || "0"),
      x: b.x,
      y: b.y + b.height / 2,
      width: b.width
    };
  })()`);
  if (!slider || slider.width <= 0) {
    throw new Error("Google Flow video length slider did not appear");
  }
  const targetVal = Math.min(slider.max, Math.max(slider.min, Math.round(seconds) - 3));
  if (slider.current === targetVal) return;

  const span = Math.max(1, slider.max - slider.min);
  const frac = (targetVal - slider.min) / span;
  const clickX = slider.x + slider.width * Math.min(0.99, Math.max(0.01, frac));
  const activeTab = currentTab();
  if (activeTab.clickAt) {
    await activeTab.clickAt(clickX, slider.y, activeSignal);
  } else {
    await evaluate(`/*nt:flow:slider-fallback*/ (() => {
      const inp = document.querySelector(".cdk-overlay-container input.mdc-slider__input");
      if (!inp) return false;
      inp.value = ${JSON.stringify(String(targetVal))};
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  }
  await sleep(300, activeSignal);
}

/** Configure Flow's settings popover for image generation (`x1`). */
async function configureImageSettings(spec: FlowImageModelSpec, aspectRatio: string): Promise<void> {
  await evaluate(`/*nt:flow:settings-open*/ (() => {
    document.querySelector(${JSON.stringify(SETTINGS_TRIGGER)})?.click();
    return true;
  })()`);
  const opened = await poll<boolean>(`/*nt:flow:settings-ready*/ !!document.querySelector(${JSON.stringify(MODEL_DROPDOWN)})`, OVERLAY_TIMEOUT_MS);
  if (!opened) throw new Error("Google Flow settings popover did not open");

  await clickOverlayRadio("mode-image", 'b.querySelector("mat-icon")?.textContent?.trim() === "image"', "Image");
  await selectModelInOverlay(spec.menuLabel);

  const ratioIcon = ASPECT_ICONS[aspectRatio];
  if (ratioIcon) {
    await clickOverlayRadio(
      "aspect",
      `b.querySelector("mat-icon")?.textContent?.trim() === ${JSON.stringify(ratioIcon)} || (b.innerText || "").includes(${JSON.stringify(aspectRatio)})`,
      aspectRatio
    );
  }
  await clickOverlayRadio("count-1", '(b.innerText || "").trim() === "x1"', "x1");
  await closeOverlays();
}

/** Configure Flow's settings popover for video generation (`x1`). */
async function configureVideoSettings(
  spec: FlowVideoModelSpec,
  subMode: "frames" | "ingredients",
  aspectRatio: string,
  resolution: string | null | undefined,
  durationSeconds: number | null | undefined
): Promise<void> {
  await evaluate(`/*nt:flow:settings-open*/ (() => {
    document.querySelector(${JSON.stringify(SETTINGS_TRIGGER)})?.click();
    return true;
  })()`);
  const opened = await poll<boolean>(`/*nt:flow:settings-ready*/ !!document.querySelector(${JSON.stringify(MODEL_DROPDOWN)})`, OVERLAY_TIMEOUT_MS);
  if (!opened) throw new Error("Google Flow settings popover did not open");

  await clickOverlayRadio("mode-video", 'b.querySelector("mat-icon")?.textContent?.trim() === "videocam"', "Video");
  const subIcon = subMode === "frames" ? "crop_free" : "chrome_extension";
  await clickOverlayRadio(
    "submode",
    `b.querySelector("mat-icon")?.textContent?.trim() === ${JSON.stringify(subIcon)}`,
    subMode === "frames" ? "Frames" : "Ingredients"
  );
  await selectModelInOverlay(spec.menuLabel);

  const ratioIcon = ASPECT_ICONS[aspectRatio];
  if (ratioIcon) {
    await clickOverlayRadio(
      "aspect",
      `b.querySelector("mat-icon")?.textContent?.trim() === ${JSON.stringify(ratioIcon)} || (b.innerText || "").includes(${JSON.stringify(aspectRatio)})`,
      aspectRatio
    );
  }

  if (resolution && spec.resolutions) {
    const normalized = spec.resolutions.find((r) => r.toLowerCase() === resolution.toLowerCase());
    if (!normalized) {
      await closeOverlays();
      throw new Error(
        `Google Flow model ${spec.name} does not offer resolution ${resolution}. Use one of ${spec.resolutions.join(", ")}`
      );
    }
    await clickOverlayRadio(
      "resolution",
      `(b.innerText || "").trim().toLowerCase().startsWith(${JSON.stringify(normalized.toLowerCase())})`,
      normalized
    );
  }

  if (durationSeconds != null) {
    if (!spec.durations.includes(durationSeconds)) {
      await closeOverlays();
      throw new Error(
        `Google Flow model ${spec.name} offers ${spec.durations.join(", ")} second clips, not ${durationSeconds}`
      );
    }
    if (spec.durationControl === "slider") {
      await setLengthSlider(durationSeconds);
    } else {
      await clickOverlayRadio(
        "duration",
        `(b.innerText || "").trim() === ${JSON.stringify(`${durationSeconds}s`)}`,
        `${durationSeconds}s`
      );
    }
  }

  await clickOverlayRadio("count-1", '(b.innerText || "").trim() === "x1"', "x1");
  await closeOverlays();
}

/** Clear any leftover attached chips or frames from the prompt box before attaching new inputs. */
async function clearComposerAttachments(): Promise<void> {
  await evaluate(`/*nt:flow:clear-attachments*/ (() => {
    const box = document.querySelector(${JSON.stringify(PROMPT_BOX)});
    if (!box) return 0;
    const removeButtons = [...box.querySelectorAll("button")].filter((b) => {
      if (b.closest(".bottom-controls")) return false;
      const icon = b.querySelector("mat-icon")?.textContent?.trim();
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      return icon === "close" || icon === "cancel" || icon === "delete" || aria.includes("remove") || aria.includes("clear");
    });
    for (const b of removeButtons) b.click();
    return removeButtons.length;
  })()`);
  await sleep(250, activeSignal);
}

/**
 * Upload one image through an open Flow media picker (`Start` frame, `End` frame,
 * or `Add ingredients`) by intercepting the transient `<input type="file">.click()`
 * so no native OS file dialog opens.
 */
async function uploadImageInOpenPicker(
  bytes: Uint8Array,
  filenamePrefix: string,
  expectedBoxImagesAfter: number
): Promise<void> {
  const mime = detectImageMime(bytes);
  const ext = extForImageMime(mime);
  const filename = `${filenamePrefix}.${ext}`;
  const stageId = await stageBytesInTab(currentTab(), bytes, activeSignal);

  const beforeOverlayImgs = await evaluate<string[]>(
    `/*nt:flow:picker-before*/ [...document.querySelectorAll(".cdk-overlay-container img")].map((i) => i.src)`
  );

  const triggered = await evaluate<{ ok: boolean; reason?: string }>(`/*nt:flow:upload-trigger*/ (() => {
    let captured = null;
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === "file") {
        captured = this;
        return;
      }
      return origClick.apply(this, arguments);
    };
    try {
      const btn = [...document.querySelectorAll(".cdk-overlay-container button")].find(
        (b) => /upload media/i.test(b.innerText || "")
      );
      if (!btn) return { ok: false, reason: "no Upload media button in picker" };
      btn.click();
      if (!captured) return { ok: false, reason: "Upload media did not open a file input" };
      const binary = atob(window.__ntStage[${JSON.stringify(stageId)}]);
      const data = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([data], ${JSON.stringify(filename)}, { type: ${JSON.stringify(mime)} }));
      captured.files = dt.files;
      captured.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    } finally {
      HTMLInputElement.prototype.click = origClick;
      if (window.__ntStage) delete window.__ntStage[${JSON.stringify(stageId)}];
    }
  })()`);

  if (!triggered.ok) {
    await closeOverlays();
    throw new Error(`Google Flow could not attach ${filename}: ${triggered.reason ?? "unknown error"}`);
  }

  // Wait for either: (a) blocking confirmation dialog (e.g. "Rights to use this image"),
  // (b) Flow auto-attaching the image directly to the prompt box, or
  // (c) the uploaded asset appearing in the picker so we can click it to attach.
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  let pickedFromOverlay = false;
  while (Date.now() < deadline) {
    await sleep(400, activeSignal);
    await assertNoBlockingChallenge();

    const boxImages = await evaluate<number>(
      `/*nt:flow:box-imgs*/ document.querySelectorAll(${JSON.stringify(`${PROMPT_BOX} img`)}).length`
    );
    if (boxImages >= expectedBoxImagesAfter) {
      await closeOverlays();
      return;
    }

    if (!pickedFromOverlay) {
      const clickedNew = await evaluate<boolean>(`/*nt:flow:pick-uploaded*/ (() => {
        const before = new Set(${JSON.stringify(beforeOverlayImgs)});
        const ov = document.querySelector(${JSON.stringify(OVERLAY)});
        if (!ov) return false;
        const fresh = [...ov.querySelectorAll("img")].find((i) => i.src && !before.has(i.src));
        if (!fresh) return false;
        const clickable = fresh.closest('button, [role="option"], [role="button"]') || fresh;
        clickable.click();
        const addBtn = [...ov.querySelectorAll("button")].find((b) => /add to prompt/i.test(b.innerText || ""));
        if (addBtn) addBtn.click();
        return true;
      })()`);
      if (clickedNew) pickedFromOverlay = true;
    }
  }
  await closeOverlays();
  throw new Error(`Google Flow upload for ${filename} did not attach within ${UPLOAD_TIMEOUT_MS / 1000}s`);
}

/** Attach one or more reference images through the Ingredients `+` picker. */
async function attachIngredientImages(images: readonly Uint8Array[]): Promise<void> {
  if (images.length === 0) return;
  if (images.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`Google Flow takes at most ${MAX_REFERENCE_IMAGES} reference images, not ${images.length}`);
  }
  let attached = await evaluate<number>(
    `/*nt:flow:box-imgs*/ document.querySelectorAll(${JSON.stringify(`${PROMPT_BOX} img`)}).length`
  );
  for (const [index, bytes] of images.entries()) {
    const opened = await evaluate<boolean>(`/*nt:flow:ingredients-open*/ (() => {
      const btn = document.querySelector(${JSON.stringify(ADD_INGREDIENTS_BUTTON)});
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!opened) {
      throw new Error("Google Flow composer has no Add ingredients button");
    }
    const ready = await poll<boolean>(
      `/*nt:flow:ingredients-ready*/ [...document.querySelectorAll(".cdk-overlay-container button")].some((b) => /upload media/i.test(b.innerText || ""))`,
      OVERLAY_TIMEOUT_MS
    );
    if (!ready) {
      await closeOverlays();
      throw new Error("Google Flow ingredients picker did not open");
    }
    attached += 1;
    await uploadImageInOpenPicker(bytes, `reference-${index + 1}`, attached);
  }
}

/** Attach start frame (and optional end frame) in Video `Frames` mode. */
async function attachVideoFrames(startImage: Uint8Array, endImage?: Uint8Array | null): Promise<void> {
  const openChip = async (chipIndex: 0 | 1, name: string): Promise<void> => {
    const clicked = await evaluate<boolean>(`/*nt:flow:frame-chip*/ (() => {
      const chips = [...document.querySelectorAll("flow-ingredient-bar .frame-trigger button")];
      const chip = chips[${chipIndex}];
      if (!chip) return false;
      chip.click();
      return true;
    })()`);
    if (!clicked) {
      throw new Error(`Google Flow Frames composer has no ${name} frame slot`);
    }
    const ready = await poll<boolean>(
      `/*nt:flow:frame-picker*/ [...document.querySelectorAll(".cdk-overlay-container button")].some((b) => /upload media/i.test(b.innerText || ""))`,
      OVERLAY_TIMEOUT_MS
    );
    if (!ready) {
      await closeOverlays();
      throw new Error(`Google Flow ${name} frame picker did not open`);
    }
  };

  let attached = await evaluate<number>(
    `/*nt:flow:box-imgs*/ document.querySelectorAll(${JSON.stringify(`${PROMPT_BOX} img`)}).length`
  );
  await openChip(0, "Start");
  attached += 1;
  await uploadImageInOpenPicker(startImage, "start-frame", attached);

  if (endImage && endImage.length > 0) {
    await openChip(1, "End");
    attached += 1;
    await uploadImageInOpenPicker(endImage, "end-frame", attached);
  }
}

interface TileSnapshot {
  kind: "image" | "video";
  mediaId: string | null;
  baseUrl: string | null;
  pending: boolean;
  failedText: string | null;
}

interface GridSnapshot {
  tiles: TileSnapshot[];
  pendingCount: number;
  snackbar: string | null;
}

/** Read the current grid tiles and any error snackbar in one page evaluation. */
async function readGridSnapshot(): Promise<GridSnapshot> {
  return evaluate<GridSnapshot>(`/*nt:flow:grid*/ (() => {
    const strip = (u) => (u ? u.replace(/=[^=/]+$/, "") : null);
    const tiles = [...document.querySelectorAll("flow-tile-container")].map((t) => {
      const isVideo = Boolean(t.querySelector("flow-video-tile"));
      const pending = Boolean(t.querySelector("flow-pending-tile"));
      const mediaEl = t.querySelector("[data-media-id]");
      const mediaId = mediaEl ? mediaEl.getAttribute("data-media-id") : null;
      let rawUrl = null;
      if (isVideo) {
        const v = t.querySelector("flow-video-tile video");
        const thumb = t.querySelector("flow-video-tile img.thumbnail, flow-video-tile img");
        rawUrl = v?.src || v?.querySelector("source")?.src || thumb?.src || null;
      } else {
        const img = t.querySelector("flow-image-tile img");
        rawUrl = img?.src || null;
      }
      const hasAsb = typeof rawUrl === "string" && rawUrl.includes("/asb/");
      const errIcon = [...t.querySelectorAll("mat-icon")].find((i) => /error|warning|report/i.test(i.textContent?.trim() || ""));
      const failedText = !pending && !hasAsb && errIcon ? (t.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 200) : null;
      return {
        kind: isVideo ? "video" : "image",
        mediaId,
        baseUrl: hasAsb ? strip(rawUrl) : null,
        pending,
        failedText
      };
    });
    const pendingCount = document.querySelectorAll("flow-pending-tile").length;
    const snackEl = document.querySelector(".mat-mdc-snack-bar-container, [role=alert]");
    const snackbar = snackEl ? (snackEl.innerText || "").trim().slice(0, 300) || null : null;
    return { tiles, pendingCount, snackbar };
  })()`);
}

/** Type `prompt` into Flow's ProseMirror composer and click Start generation with a trusted CDP click. */
async function submitPrompt(prompt: string, beforePendingCount: number, beforeTileCount: number): Promise<void> {
  await evaluate(`/*nt:flow:type*/ (() => {
    const pm = document.querySelector(${JSON.stringify(COMPOSER)});
    if (!pm) throw new Error("Google Flow prompt box disappeared");
    pm.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
    if (${JSON.stringify(prompt)}) {
      document.execCommand("insertText", false, ${JSON.stringify(prompt)});
    }
    return true;
  })()`);
  await sleep(350, activeSignal);

  const ready = await poll<boolean>(`/*nt:flow:submit-ready*/ (() => {
    const btn = document.querySelector(${JSON.stringify(GENERATE_BUTTON)});
    return Boolean(btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true");
  })()`, SUBMIT_READY_TIMEOUT_MS);
  if (!ready) {
    throw new Error("Google Flow did not enable the generate button (prompt may be empty or upload incomplete)");
  }

  await trustedClick(GENERATE_BUTTON, "Start generation button");

  const started = await poll<boolean>(`/*nt:flow:started*/ (() => {
    const pending = document.querySelectorAll("flow-pending-tile").length;
    const tiles = document.querySelectorAll("flow-tile-container").length;
    const pmText = (document.querySelector(${JSON.stringify(COMPOSER)})?.innerText || "").trim();
    const captcha = [...document.querySelectorAll('iframe[src*="recaptcha"]')].some((f) => {
      const src = f.getAttribute("src") || "";
      const r = f.getBoundingClientRect();
      return src.includes("bframe") && r.width > 20 && r.height > 20;
    });
    const snack = Boolean((document.querySelector(".mat-mdc-snack-bar-container, [role=alert]")?.innerText || "").trim());
    return pending > ${beforePendingCount} || tiles > ${beforeTileCount} || pmText.length === 0 || captcha || snack;
  })()`, SUBMIT_START_TIMEOUT_MS);

  await assertNoBlockingChallenge();
  if (!started) {
    throw new Error(
      "Google Flow did not start generation after clicking submit. Bring the flow.google.com tab to the front and try again"
    );
  }
}

/** Wait until a newly generated image or video tile completes, then return its base `/asb/` URL. */
async function awaitGeneratedAsset(
  kind: "image" | "video",
  beforeUrls: ReadonlySet<string>,
  beforeMediaIds: ReadonlySet<string>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  const intervalMs = kind === "video" ? VIDEO_POLL_INTERVAL_MS : IMAGE_POLL_INTERVAL_MS;
  const started = Date.now();
  let failures = 0;
  let sawPending = false;
  let pendingGoneAt: number | null = null;
  let lastSnackbar: string | null = null;

  for (;;) {
    await sleep(intervalMs, signal);
    try {
      await assertNoBlockingChallenge();
      const grid = await readGridSnapshot();
      failures = 0;
      if (grid.snackbar) lastSnackbar = grid.snackbar;

      // Completed tile matching our kind whose URL or media ID was not present before submit.
      for (const tile of grid.tiles) {
        if (tile.kind !== kind) continue;
        if (tile.failedText) {
          throw new Error(`Google Flow ${kind} generation failed: ${tile.failedText}`);
        }
        const isFresh =
          (tile.baseUrl !== null && !beforeUrls.has(tile.baseUrl)) ||
          (tile.mediaId !== null && !beforeMediaIds.has(tile.mediaId));
        if (!isFresh) continue;

        // Images render their full `/asb/` img URL as soon as ready (even while the
        // pending overlay fades out); videos settle once `flow-pending-tile` detaches.
        if (tile.baseUrl && (kind === "image" || !tile.pending)) {
          log.info("Google Flow generation finished", {
            kind,
            mediaId: tile.mediaId,
            seconds: Math.round((Date.now() - started) / 1000)
          });
          return tile.baseUrl;
        }
      }

      if (grid.pendingCount > 0) {
        sawPending = true;
        pendingGoneAt = null;
      } else if (sawPending) {
        pendingGoneAt ??= Date.now();
        if (Date.now() - pendingGoneAt > MISSING_TILE_GRACE_MS) {
          throw new Error(
            `Google Flow ${kind} generation ended without producing media${lastSnackbar ? `: ${lastSnackbar}` : ""}`
          );
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Google Flow ") || error.name === "AbortError")
      ) {
        throw error;
      }
      failures += 1;
      log.warn("Google Flow poll failed", {
        kind,
        failures,
        error: error instanceof Error ? error.message : String(error)
      });
      if (failures > MAX_POLL_FAILURES) throw error;
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Google Flow ${kind} generation did not finish within ${timeoutMs / 1000}s${lastSnackbar ? ` (${lastSnackbar})` : ""}`
      );
    }
  }
}

function buildPromptText(prompt: string, negativePrompt?: string | null): string {
  return [
    prompt.trim(),
    negativePrompt?.trim() ? `Avoid: ${negativePrompt.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Google Flow (`flow.google.com`) image and video provider driven through the
 * user's signed-in Chrome tab via the NodeTool extension. Local installs only.
 */
export class GoogleFlowProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  constructor(_secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.GOOGLE_FLOW);
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "reference_to_video"
    ];
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("google_flow does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("google_flow does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [...GOOGLE_FLOW_IMAGE_MODELS];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [...GOOGLE_FLOW_VIDEO_MODELS];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.runImageGeneration(params.model.id, params.prompt, [], {
      aspectRatio: params.aspectRatio,
      width: params.width,
      height: params.height,
      negativePrompt: params.negativePrompt,
      signal: params.signal
    });
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (images.length === 0) {
      throw new Error("imageToImage needs at least one source image");
    }
    return this.runImageGeneration(params.model.id, params.prompt, images, {
      aspectRatio: params.aspectRatio,
      width: params.targetWidth,
      height: params.targetHeight,
      negativePrompt: params.negativePrompt,
      signal: params.signal
    });
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const refs = (params.references ?? []).map((r) => r.image);
    return this.runVideoGeneration(params.model.id, params.prompt, {
      subMode: "ingredients",
      ingredientImages: refs,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      durationSeconds: params.durationSeconds,
      negativePrompt: params.negativePrompt,
      timeoutSeconds: params.timeoutSeconds,
      signal: params.signal
    });
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    return this.runVideoGeneration(params.model.id, params.prompt ?? "", {
      subMode: "frames",
      startImage: image,
      endImage: params.endImage ?? null,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      durationSeconds: params.durationSeconds,
      negativePrompt: params.negativePrompt,
      timeoutSeconds: params.timeoutSeconds,
      signal: params.signal
    });
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    if (inputs.videos.length > 0 || (inputs.audios?.length ?? 0) > 0) {
      throw new Error(
        "Google Flow referenceToVideo currently supports reference images only"
      );
    }
    const allImages = [
      ...inputs.images,
      ...(params.references ?? []).map((r) => r.image)
    ];
    if (allImages.length === 0) {
      throw new Error("referenceToVideo needs at least one reference image");
    }
    return this.runVideoGeneration(params.model.id, params.prompt, {
      subMode: "ingredients",
      ingredientImages: allImages,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      durationSeconds: params.durationSeconds,
      negativePrompt: params.negativePrompt,
      timeoutSeconds: params.timeoutSeconds,
      signal: params.signal
    });
  }

  private async runImageGeneration(
    modelId: string,
    prompt: string,
    images: readonly Uint8Array[],
    options: {
      aspectRatio?: string | null;
      width?: number | null;
      height?: number | null;
      negativePrompt?: string | null;
      signal?: AbortSignal;
    }
  ): Promise<Uint8Array> {
    const spec = imageSpecFor(modelId);
    const ratio = resolveAspectRatio(
      spec.aspectRatios,
      options.aspectRatio,
      options.width,
      options.height,
      "16:9"
    );
    const text = buildPromptText(prompt, options.negativePrompt);
    if (!text) throw new Error("Google Flow image generation needs a prompt");

    return serialized(async () => {
      activeSignal = options.signal;
      await ensureProjectComposerReady();
      await configureImageSettings(spec, ratio);
      await clearComposerAttachments();
      await attachIngredientImages(images);

      const before = await readGridSnapshot();
      const beforeUrls = new Set(
        before.tiles.map((t) => t.baseUrl).filter((u): u is string => Boolean(u))
      );
      const beforeIds = new Set(
        before.tiles.map((t) => t.mediaId).filter((id): id is string => Boolean(id))
      );

      await submitPrompt(text, before.pendingCount, before.tiles.length);
      const baseUrl = await awaitGeneratedAsset(
        "image",
        beforeUrls,
        beforeIds,
        IMAGE_TIMEOUT_MS,
        options.signal
      );
      return currentTab().download(
        flowImageDownloadUrl(baseUrl),
        DOWNLOAD_TIMEOUT_MS,
        options.signal
      );
    });
  }

  private async runVideoGeneration(
    modelId: string,
    prompt: string,
    options: {
      subMode: "frames" | "ingredients";
      startImage?: Uint8Array;
      endImage?: Uint8Array | null;
      ingredientImages?: readonly Uint8Array[];
      aspectRatio?: string | null;
      resolution?: string | null;
      durationSeconds?: number | null;
      negativePrompt?: string | null;
      timeoutSeconds?: number | null;
      signal?: AbortSignal;
    }
  ): Promise<Uint8Array> {
    const spec = videoSpecFor(modelId);
    const ratio = resolveAspectRatio(
      spec.aspectRatios,
      options.aspectRatio,
      null,
      null,
      "16:9"
    );
    const text = buildPromptText(prompt, options.negativePrompt);
    if (!text && !options.startImage) {
      throw new Error("Google Flow video generation needs a prompt or start frame");
    }
    const timeoutMs = options.timeoutSeconds
      ? options.timeoutSeconds * 1000
      : VIDEO_TIMEOUT_MS;

    return serialized(async () => {
      activeSignal = options.signal;
      await ensureProjectComposerReady();
      await configureVideoSettings(
        spec,
        options.subMode,
        ratio,
        options.resolution,
        options.durationSeconds
      );
      await clearComposerAttachments();
      if (options.subMode === "frames" && options.startImage) {
        await attachVideoFrames(options.startImage, options.endImage);
      } else if (options.ingredientImages?.length) {
        await attachIngredientImages(options.ingredientImages);
      }

      const before = await readGridSnapshot();
      const beforeUrls = new Set(
        before.tiles.map((t) => t.baseUrl).filter((u): u is string => Boolean(u))
      );
      const beforeIds = new Set(
        before.tiles.map((t) => t.mediaId).filter((id): id is string => Boolean(id))
      );

      await submitPrompt(text, before.pendingCount, before.tiles.length);
      const baseUrl = await awaitGeneratedAsset(
        "video",
        beforeUrls,
        beforeIds,
        timeoutMs,
        options.signal
      );
      return currentTab().download(
        flowVideoDownloadUrl(baseUrl),
        DOWNLOAD_TIMEOUT_MS,
        options.signal
      );
    });
  }
}
