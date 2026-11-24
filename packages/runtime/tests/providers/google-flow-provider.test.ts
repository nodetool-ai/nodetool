import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flowImageDownloadUrl,
  flowVideoDownloadUrl,
  GoogleFlowProvider,
  resolveAspectRatio,
  setGoogleFlowTab,
  stripFlowMediaSuffix
} from "../../src/providers/google-flow-provider.js";
import type { ExtensionTab } from "../../src/providers/extension-tab.js";
import type { ImageModel, VideoModel } from "../../src/providers/types.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const IMAGE_BASE = "https://flow.google.com/asb/img-token-new";
const VIDEO_BASE = "https://flow.google.com/asb/vid-token-new";
const PRIOR_IMAGE_BASE = "https://flow.google.com/asb/img-token-old";

const imageModel = (id: string): ImageModel => ({ id, name: id, provider: "google_flow" });
const videoModel = (id: string): VideoModel => ({ id, name: id, provider: "google_flow" });

interface FakeFlowState {
  signedIn?: boolean;
  pathname?: string;
  firstProjectHref?: string | null;
  agentOn?: boolean;
  currentModelLabel?: string;
  availableModels?: string[];
  captchaOnPoll?: number;
  dialogOnUpload?: string | null;
  failedText?: string | null;
  pendingPolls?: number;
  resultKind?: "image" | "video";
  resultUrl?: string;
  downloadBytes?: Uint8Array;
  existingTiles?: Array<{
    kind: "image" | "video";
    mediaId: string | null;
    baseUrl: string | null;
    pending: boolean;
    failedText: string | null;
  }>;
}

interface FakeFlowRecorder {
  navigations: string[];
  radios: string[];
  pickedModels: string[];
  typedPrompts: string[];
  clicks: Array<{ x: number; y: number }>;
  downloads: string[];
  uploadedFiles: number;
  releases: number;
  scripts: string[];
  sliderClickXs: number[];
}

function installFakeFlowTab(options: FakeFlowState = {}): FakeFlowRecorder {
  const rec: FakeFlowRecorder = {
    navigations: [],
    radios: [],
    pickedModels: [],
    typedPrompts: [],
    clicks: [],
    downloads: [],
    uploadedFiles: 0,
    releases: 0,
    scripts: [],
    sliderClickXs: []
  };

  let pathname = options.pathname ?? "/project/proj-123";
  let currentModel = options.currentModelLabel ?? "🍌 Nano Banana 2.1";
  let agentOn = options.agentOn ?? false;
  let boxImages = 0;
  let submitted = false;
  let gridReadsAfterSubmit = 0;
  let uploadTriggered = false;
  let pendingPollsRemaining = options.pendingPolls ?? 1;
  const resultKind = options.resultKind ?? "image";
  const resultUrl = options.resultUrl ?? (resultKind === "video" ? VIDEO_BASE : IMAGE_BASE);
  const existingTiles = options.existingTiles ?? [
    { kind: "image", mediaId: "old-id-1", baseUrl: PRIOR_IMAGE_BASE, pending: false, failedText: null }
  ];
  const models = options.availableModels ?? [
    "🍌 Nano Banana Pro",
    "🍌 Nano Banana 2 Lite",
    "🍌 Nano Banana 2.1",
    "Omni 1.2 Flash",
    "Omni 1.1 Flash Leaving Dec 5",
    "Veo 3.1 - Lite",
    "Veo 3.1 - Fast Leaving Dec 5",
    "Veo 3.1 - Quality Leaving Dec 5"
  ];
  const stage: Record<string, string> = {};

  const tab: ExtensionTab = {
    async release() {
      rec.releases += 1;
    },
    async navigate(url) {
      rec.navigations.push(url);
      pathname = new URL(url).pathname;
    },
    async download(url) {
      rec.downloads.push(url);
      return options.downloadBytes ?? (resultKind === "video" ? MP4 : JPEG);
    },
    async clickAt(x, y) {
      rec.clicks.push({ x, y });
      // Slider sits at y === 520; submit button sits at y === 840.
      if (y === 520) {
        rec.sliderClickXs.push(x);
      } else {
        submitted = true;
      }
    },
    async evaluate(expression: string) {
      // Handle byte staging calls from stageBytesInTab.
      const initStage = /window\.__ntStage\[("[^"]+")\] = ""/.exec(expression);
      if (initStage) {
        stage[JSON.parse(initStage[1]) as string] = "";
        return true;
      }
      const appendStage = /window\.__ntStage\[("[^"]+")\] \+= ("[^"]*")/.exec(expression);
      if (appendStage) {
        stage[JSON.parse(appendStage[1]) as string] += JSON.parse(appendStage[2]) as string;
        return true;
      }

      const tag = /^\/\*nt:flow:([^*]+)\*\//.exec(expression)?.[1] ?? "unknown";
      rec.scripts.push(tag);

      switch (tag) {
        case "status":
          return {
            href: `https://flow.google.com${pathname}`,
            pathname,
            signedIn: options.signedIn ?? true,
            firstProjectHref: options.firstProjectHref ?? "https://flow.google.com/project/proj-first",
            hasNewProjectButton: true
          };
        case "project-ready":
        case "composer":
        case "all-media":
        case "settings-open":
        case "settings-ready":
        case "close-overlays":
        case "clear-attachments":
        case "model-open":
        case "ingredients-open":
        case "ingredients-ready":
        case "frame-chip":
        case "frame-picker":
        case "submit-ready":
          return true;
        case "disable-agent":
          return agentOn;
        case "direct-mode":
          if (agentOn) {
            agentOn = false;
            return "toggled";
          }
          return "already-direct";
        case "check-block": {
          const captcha =
            submitted &&
            options.captchaOnPoll !== undefined &&
            gridReadsAfterSubmit >= options.captchaOnPoll;
          const dialog = uploadTriggered && options.dialogOnUpload ? options.dialogOnUpload : null;
          return { captcha, dialog, snackbar: null };
        }
        case "model-current":
          return currentModel;
        case "model-items":
          return models;
        case "model-pick": {
          const wanted = /includes\(("[^"]+")\)/.exec(expression)?.[1];
          const label = wanted ? (JSON.parse(wanted) as string) : "";
          const match = models.find((m) => m.includes(label));
          if (!match) return false;
          currentModel = match;
          rec.pickedModels.push(label);
          return true;
        }
        case "slider-info":
          return { min: 0, max: 12, current: 5, x: 400, y: 520, width: 200 };
        case "box-imgs":
          return boxImages;
        case "picker-before":
          return [];
        case "upload-trigger":
          uploadTriggered = true;
          rec.uploadedFiles += 1;
          if (!options.dialogOnUpload) boxImages += 1;
          return { ok: true };
        case "pick-uploaded":
          return false;
        case "type": {
          const inserted = /insertText", false, ("(?:[^"\\]|\\.)*")/.exec(expression)?.[1];
          rec.typedPrompts.push(inserted ? (JSON.parse(inserted) as string) : "");
          return true;
        }
        case "rect":
          return { x: 937, y: 840 };
        case "started":
          return submitted;
        case "grid": {
          if (!submitted) {
            return { tiles: existingTiles, pendingCount: 0, snackbar: null };
          }
          gridReadsAfterSubmit += 1;
          if (options.failedText) {
            return {
              tiles: [
                ...existingTiles,
                { kind: resultKind, mediaId: null, baseUrl: null, pending: false, failedText: options.failedText }
              ],
              pendingCount: 0,
              snackbar: null
            };
          }
          if (pendingPollsRemaining > 0) {
            pendingPollsRemaining -= 1;
            return {
              tiles: [
                ...existingTiles,
                { kind: resultKind, mediaId: null, baseUrl: null, pending: true, failedText: null }
              ],
              pendingCount: 1,
              snackbar: null
            };
          }
          return {
            tiles: [
              ...existingTiles,
              {
                kind: resultKind,
                mediaId: "fresh-media-id",
                baseUrl: resultUrl,
                pending: false,
                failedText: null
              }
            ],
            pendingCount: 0,
            snackbar: null
          };
        }
        default:
          if (tag.startsWith("radio:")) {
            rec.radios.push(tag.slice("radio:".length));
            return true;
          }
          throw new Error(`Unhandled fake Flow script: ${tag}`);
      }
    }
  };

  setGoogleFlowTab(tab);
  return rec;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setGoogleFlowTab(null);
  vi.useRealTimers();
});

describe("GoogleFlowProvider URL and aspect helpers", () => {
  it("strips FIFE suffixes and appends full-res image or MP4 suffixes", () => {
    const raw = "https://flow.google.com/asb/abc123=s512-rw";
    expect(stripFlowMediaSuffix(raw)).toBe("https://flow.google.com/asb/abc123");
    expect(flowImageDownloadUrl(raw)).toBe("https://flow.google.com/asb/abc123=s0");
    expect(flowVideoDownloadUrl("https://flow.google.com/asb/vid999")).toBe(
      "https://flow.google.com/asb/vid999=mm,22,15"
    );
  });

  it("resolves explicit ratios, nearest dimensions, and rejects unsupported ratios", () => {
    const ratios = ["16:9", "4:3", "1:1", "3:4", "9:16"];
    expect(resolveAspectRatio(ratios, "1:1")).toBe("1:1");
    expect(resolveAspectRatio(ratios, null, 1080, 1920)).toBe("9:16");
    expect(resolveAspectRatio(ratios, null, 1024, 1024)).toBe("1:1");
    expect(() => resolveAspectRatio(["16:9", "9:16"], "1:1")).toThrow(/aspect ratio 1:1/i);
  });
});

describe("GoogleFlowProvider catalog and chat rejection", () => {
  it("lists static image and video models without attaching to Chrome", async () => {
    const provider = new GoogleFlowProvider();
    expect(GoogleFlowProvider.requiredSecrets()).toEqual([]);

    const images = await provider.getAvailableImageModels();
    const videos = await provider.getAvailableVideoModels();

    expect(images.map((m) => m.id)).toEqual([
      "nano-banana-2.1",
      "nano-banana-pro",
      "nano-banana-2-lite"
    ]);
    expect(videos.map((m) => m.id)).toEqual([
      "omni-1.2-flash",
      "omni-1.1-flash",
      "veo-3.1-lite",
      "veo-3.1-fast",
      "veo-3.1-quality"
    ]);
    expect(images.every((m) => m.provider === "google_flow")).toBe(true);
    expect(videos.every((m) => m.provider === "google_flow")).toBe(true);
  });

  it("rejects chat methods cleanly", async () => {
    const provider = new GoogleFlowProvider();
    await expect(
      provider.generateMessage({ messages: [{ role: "user", content: "hi" }], model: "any" })
    ).rejects.toThrow(/does not support chat/);
    await expect(
      (async () => {
        for await (const _ of provider.generateMessages({
          messages: [{ role: "user", content: "hi" }],
          model: "any"
        })) {
          // unreachable
        }
      })()
    ).rejects.toThrow(/does not support chat/);
  });
});

describe("GoogleFlowProvider image and video generation", () => {
  it("opens the first project from home, runs textToImage with x1, and downloads =s0", async () => {
    const rec = installFakeFlowTab({
      pathname: "/",
      agentOn: true,
      currentModelLabel: "🍌 Nano Banana Pro",
      resultKind: "image",
      downloadBytes: JPEG
    });
    const provider = new GoogleFlowProvider();

    const promise = provider.textToImage({
      model: imageModel("nano-banana-2.1"),
      prompt: "Red ceramic coffee mug",
      aspectRatio: "1:1"
    });
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(JPEG);
    expect(rec.navigations).toEqual(["https://flow.google.com/project/proj-first"]);
    expect(rec.pickedModels).toEqual(["Nano Banana 2.1"]);
    expect(rec.radios).toEqual(["mode-image", "aspect", "count-1"]);
    expect(rec.typedPrompts).toEqual(["Red ceramic coffee mug"]);
    expect(rec.clicks).toEqual([{ x: 937, y: 840 }]);
    expect(rec.downloads).toEqual([`${IMAGE_BASE}=s0`]);
    expect(rec.releases).toBe(1);
  });

  it("uploads source images in imageToImage and appends negativePrompt", async () => {
    const rec = installFakeFlowTab({ resultKind: "image", downloadBytes: JPEG });
    const provider = new GoogleFlowProvider();

    const promise = provider.imageToImage([PNG, JPEG], {
      model: imageModel("nano-banana-pro"),
      prompt: "Place the bottle on marble",
      negativePrompt: "text watermark",
      aspectRatio: "4:3"
    });
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(JPEG);
    expect(rec.uploadedFiles).toBe(2);
    expect(rec.pickedModels).toEqual(["Nano Banana Pro"]);
    expect(rec.typedPrompts).toEqual(["Place the bottle on marble\n\nAvoid: text watermark"]);
    expect(rec.downloads).toEqual([`${IMAGE_BASE}=s0`]);
  });

  it("runs textToVideo with Veo 3.1 Lite and downloads =mm,22,15 MP4", async () => {
    const rec = installFakeFlowTab({ resultKind: "video", downloadBytes: MP4, pendingPolls: 2 });
    const provider = new GoogleFlowProvider();

    const promise = provider.textToVideo({
      model: videoModel("veo-3.1-lite"),
      prompt: "Steam rising from a coffee mug",
      aspectRatio: "16:9",
      durationSeconds: 4
    });
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(MP4);
    expect(rec.pickedModels).toEqual(["Veo 3.1 - Lite"]);
    expect(rec.radios).toEqual(["mode-video", "submode", "aspect", "duration", "count-1"]);
    expect(rec.downloads).toEqual([`${VIDEO_BASE}=mm,22,15`]);
  });

  it("drives Omni 1.2 Flash resolution and length slider via trusted clickAt", async () => {
    const rec = installFakeFlowTab({ resultKind: "video", downloadBytes: MP4 });
    const provider = new GoogleFlowProvider();

    const promise = provider.textToVideo({
      model: videoModel("omni-1.2-flash"),
      prompt: "Ocean waves at dusk",
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 15
    });
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(MP4);
    expect(rec.pickedModels).toEqual(["Omni 1.2 Flash"]);
    expect(rec.radios).toContain("resolution");
    expect(rec.sliderClickXs).toHaveLength(1);
    expect(rec.sliderClickXs[0]).toBeGreaterThan(590);
  });

  it("uploads start and end frames in imageToVideo Frames mode", async () => {
    const rec = installFakeFlowTab({ resultKind: "video", downloadBytes: MP4 });
    const provider = new GoogleFlowProvider();

    const promise = provider.imageToVideo(PNG, {
      model: videoModel("veo-3.1-fast"),
      prompt: "Slow dolly forward",
      endImage: JPEG,
      aspectRatio: "16:9",
      durationSeconds: 6
    });
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(MP4);
    expect(rec.uploadedFiles).toBe(2);
    expect(rec.scripts.filter((s) => s === "frame-chip")).toHaveLength(2);
    expect(rec.downloads).toEqual([`${VIDEO_BASE}=mm,22,15`]);
  });

  it("uploads reference images in referenceToVideo and rejects video/audio references", async () => {
    const rec = installFakeFlowTab({ resultKind: "video", downloadBytes: MP4 });
    const provider = new GoogleFlowProvider();

    await expect(
      provider.referenceToVideo(
        { images: [], videos: [MP4] },
        { model: videoModel("veo-3.1-lite"), prompt: "match motion" }
      )
    ).rejects.toThrow(/reference images only/i);

    const promise = provider.referenceToVideo(
      { images: [PNG], videos: [] },
      { model: videoModel("veo-3.1-lite"), prompt: "character walking" }
    );
    await vi.runAllTimersAsync();
    const bytes = await promise;

    expect(bytes).toEqual(MP4);
    expect(rec.uploadedFiles).toBe(1);
  });
});

describe("GoogleFlowProvider safety, CAPTCHA, dialog, and error handling", () => {
  it("stops immediately with an actionable error when a visible reCAPTCHA challenge appears", async () => {
    installFakeFlowTab({ captchaOnPoll: 0, pendingPolls: 5 });
    const provider = new GoogleFlowProvider();

    const promise = provider.textToImage({
      model: imageModel("nano-banana-2.1"),
      prompt: "a blue cube"
    });
    const assertion = expect(promise).rejects.toThrow(/CAPTCHA verification.*flow\.google\.com/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("stops without auto-accepting when Flow shows the Rights to use this image modal", async () => {
    installFakeFlowTab({
      dialogOnUpload: "Rights to use this image\nMake sure you have the necessary rights..."
    });
    const provider = new GoogleFlowProvider();

    const promise = provider.imageToImage([PNG], {
      model: imageModel("nano-banana-2.1"),
      prompt: "change lighting"
    });
    const assertion = expect(promise).rejects.toThrow(/Rights to use this image/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("fails clearly when not signed in, on unknown model, or when Flow reports a tile error", async () => {
    const provider = new GoogleFlowProvider();

    await expect(
      provider.textToImage({ model: imageModel("nonexistent"), prompt: "test" })
    ).rejects.toThrow(/Unknown Google Flow image model/);

    installFakeFlowTab({ signedIn: false });
    await expect(
      provider.textToImage({ model: imageModel("nano-banana-2.1"), prompt: "test" })
    ).rejects.toThrow(/not signed in/i);

    installFakeFlowTab({ failedText: "Something went wrong with your request" });
    const failPromise = provider.textToImage({
      model: imageModel("nano-banana-2.1"),
      prompt: "test"
    });
    const failAssert = expect(failPromise).rejects.toThrow(/Something went wrong/);
    await vi.runAllTimersAsync();
    await failAssert;
  });
});
