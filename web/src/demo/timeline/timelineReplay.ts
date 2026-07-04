/**
 * TimelineDemoEngine — deterministic, backend-free replay of a timeline cast.
 *
 * Sibling to `../demoEngine.ts` (the graph-editor engine): owns a real
 * `TimelineInstance` (so the genuine `PreviewArea`/`TracksRegion` render the
 * document) and makes it reflect exactly the events with `t <= timeMs`.
 * Unlike the node-graph engine this recomputes the clip list from scratch on
 * every seek rather than incrementally — timeline casts are short (tens of
 * edits), so the simpler pure fold is not worth trading away for seek perf.
 */
import {
  createTimelineInstance,
  type TimelineInstance
} from "../../stores/timeline/TimelineInstance";
import { useAssetStore } from "../../stores/AssetStore";
import type { Asset } from "../../stores/ApiTypes";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type { TimelineCastAsset, TimelineCastEvent, TimelineDemoCast } from "./timelineCastTypes";

const assetOverrides = new Map<string, { asset: TimelineCastAsset; url: string }>();
let assetStorePatched = false;

/**
 * Serve a cast's media from `useAssetStore.get` instead of the real backend,
 * same "seed the shared store" pattern as `seedCastMetadata` in the workflow
 * demo engine. Inline `dataUri` assets are served as-is; pinned `file` assets
 * resolve through `resolveAssetUrl` (Vite public dir, Remotion `staticFile`).
 * Patches the store's `get` action once; later calls just add more entries to
 * the shared override map.
 */
export function seedTimelineCastAssets(
  assets: TimelineCastAsset[],
  resolveAssetUrl?: (file: string) => string
): void {
  for (const asset of assets) {
    const url =
      asset.dataUri ??
      (asset.file ? resolveAssetUrl?.(asset.file) ?? asset.file : "");
    assetOverrides.set(asset.key, { asset, url });
  }
  if (assetStorePatched) return;
  assetStorePatched = true;

  const original = useAssetStore.getState().get;
  useAssetStore.setState({
    get: async (id: string) => {
      const preset = assetOverrides.get(id);
      if (preset) {
        return {
          id: preset.asset.key,
          name: preset.asset.key,
          content_type: preset.asset.contentType,
          get_url: preset.url,
          thumb_url: preset.url
        } as unknown as Asset;
      }
      return original(id);
    }
  });
}

interface TimelineReplayState {
  clips: TimelineClip[];
  selectedClipIds: string[];
  msPerPx: number;
  currentTimeMs: number;
}

/** Count of events whose timestamp is `<= timeMs` (events are sorted by `t`). */
function countAppliedAt(events: TimelineCastEvent[], timeMs: number): number {
  let n = 0;
  while (n < events.length && events[n].t <= timeMs) n++;
  return n;
}

export interface TimelineDemoEngineOptions {
  /** Maps a pinned asset's `file` name to a host URL (required for casts with file-backed assets). */
  resolveAssetUrl?: (file: string) => string;
}

export class TimelineDemoEngine {
  readonly instance: TimelineInstance;
  readonly durationMs: number;
  readonly fps: number;

  private readonly events: TimelineCastEvent[];
  private readonly pristineClips: TimelineClip[];
  private appliedIndex = 0;
  private state: TimelineReplayState;

  constructor(cast: TimelineDemoCast, options: TimelineDemoEngineOptions = {}) {
    this.durationMs = cast.durationMs;
    this.fps = cast.fps ?? 30;
    this.events = cast.events;
    this.pristineClips = clone(cast.sequence.clips);

    seedTimelineCastAssets(cast.assets, options.resolveAssetUrl);

    this.instance = createTimelineInstance();
    this.instance.doc.getState().loadSequence(cast.sequence);

    this.state = {
      clips: clone(this.pristineClips),
      selectedClipIds: [],
      msPerPx: this.instance.ui.getState().msPerPx,
      currentTimeMs: 0
    };
  }

  /** Make the timeline stores reflect exactly the events with `t <= timeMs`. */
  seekToTime(timeMs: number): void {
    const target = countAppliedAt(this.events, timeMs);
    if (target < this.appliedIndex) {
      this.state = {
        clips: clone(this.pristineClips),
        selectedClipIds: [],
        msPerPx: this.state.msPerPx,
        currentTimeMs: 0
      };
      this.appliedIndex = 0;
    }
    for (let i = this.appliedIndex; i < target; i++) {
      this.applyEvent(this.events[i]);
    }
    this.appliedIndex = target;
    this.applyActivePlayRange(timeMs);
    this.flush();
  }

  private applyEvent(event: TimelineCastEvent): void {
    const { payload } = event;
    switch (payload.kind) {
      case "addClip":
        this.state = { ...this.state, clips: [...this.state.clips, payload.clip] };
        break;
      case "patchClip":
        this.state = {
          ...this.state,
          clips: this.state.clips.map((c) =>
            c.id === payload.clipId ? { ...c, ...payload.patch } : c
          )
        };
        break;
      case "removeClip":
        this.state = {
          ...this.state,
          clips: this.state.clips.filter((c) => c.id !== payload.clipId)
        };
        break;
      case "select":
        this.state = { ...this.state, selectedClipIds: payload.clipIds };
        break;
      case "zoom":
        this.state = { ...this.state, msPerPx: payload.msPerPx };
        break;
      case "seek":
        this.activePlayRange = null;
        this.state = { ...this.state, currentTimeMs: payload.timeMs };
        break;
      case "playRange":
        this.activePlayRange = { ...payload, startT: event.t };
        this.state = { ...this.state, currentTimeMs: payload.fromMs };
        break;
    }
  }

  private activePlayRange:
    | { fromMs: number; toMs: number; rampMs: number; startT: number }
    | null = null;

  private applyActivePlayRange(timeMs: number): void {
    const range = this.activePlayRange;
    if (!range) return;
    const elapsed = timeMs - range.startT;
    const fraction = Math.min(1, Math.max(0, elapsed / range.rampMs));
    this.state = {
      ...this.state,
      currentTimeMs: range.fromMs + (range.toMs - range.fromMs) * fraction
    };
  }

  /** Push the folded state into the real timeline stores. */
  private flush(): void {
    this.instance.doc.setState({ clips: this.state.clips });
    this.instance.ui.getState().setSelection(this.state.selectedClipIds);
    this.instance.ui.getState().setZoom(this.state.msPerPx);
    this.instance.playback.getState().setCurrentTimeMs(this.state.currentTimeMs);
    this.instance.playback.getState().setTimeMs(this.state.currentTimeMs);
  }

  /** Drop all global state this engine wrote. Call when unmounting the player. */
  dispose(): void {
    this.instance.doc.getState().reset();
  }
}

/** Structured deep clone; falls back to JSON for environments without it. */
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
