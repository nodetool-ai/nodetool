/**
 * Typed facade for the embedded NodeTool demo player.
 *
 * The demo project imports the player from `@web-demo`. For type-checking, the
 * `@web-demo` specifier resolves here (tsconfig `paths`); at bundle time webpack
 * resolves it to the real source (`web/src/demo/index.ts`, see webpackOverride).
 *
 * This boundary is deliberate: it keeps `tsc` from re-checking the entire web
 * app (its WebGPU/MUI-theme/emotion globals are web's own concern, validated by
 * web's own typecheck) while still typing exactly what the demo consumes. The
 * cast shape mirrors web/src/demo/castTypes.ts.
 */
declare module "@web-demo" {
  import type * as React from "react";

  export interface CastViewport {
    x: number;
    y: number;
    zoom: number;
  }

  /** Mirror of web/src/demo/castTypes.ts `DemoCast` (index-signature kept open). */
  export interface DemoCast {
    version: number;
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    durationMs: number;
    fps?: number;
    viewport?: CastViewport;
    [key: string]: unknown;
  }

  /** Reports a promise per not-yet-decoded video (see web mediaReadiness.ts). */
  export type PendingMediaHandler = (pending: Promise<void>) => void;

  export interface DemoPlayerProps {
    cast: DemoCast;
    /** Elapsed time into the cast, in milliseconds. */
    timeMs: number;
    /** Maps a pinned asset file name to a host URL. */
    resolveAssetUrl: (file: string) => string;
    style?: React.CSSProperties;
    /** Controlled, animatable camera (overrides the cast's recorded viewport). */
    viewport?: { x: number; y: number; zoom: number };
    /** Lets a frame renderer block the capture until videos are paintable. */
    onPendingMedia?: PendingMediaHandler;
  }

  export const DemoPlayer: React.FC<DemoPlayerProps>;
  export const sampleCast: DemoCast;
  /** Promo Act 1 — one brief fans out into four video takes (demo/src/promo). */
  export const promoTrailerCast: DemoCast;
  export const tutorialCast: DemoCast;
  export const connectRunCast: DemoCast;
  export const listGeneratorCast: DemoCast;
  export const chatQaCast: DemoCast;
  export const templateMergeCast: DemoCast;
  export const summarizeCast: DemoCast;
  export const describeImageCast: DemoCast;
  /** One synthetic cast per cookbook recipe (web/src/demo/cookbook). */
  export const cookbookCasts: DemoCast[];
  /** One synthetic cast per workflow-gallery example (web/src/demo/workflows). */
  export const workflowCasts: DemoCast[];

  /** Mirror of web/src/demo/chat/chatCastTypes.ts `ChatDemoCast`. */
  export interface ChatDemoCast {
    version: number;
    kind: "chat";
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    durationMs: number;
    fps?: number;
    [key: string]: unknown;
  }

  export interface ChatDemoPlayerProps {
    cast: ChatDemoCast;
    /** Elapsed time into the cast, in milliseconds. */
    timeMs: number;
    style?: React.CSSProperties;
  }

  export const ChatDemoPlayer: React.FC<ChatDemoPlayerProps>;
  export const agentChatCast: ChatDemoCast;

  /** Mirror of web/src/demo/timeline/timelineCastTypes.ts `TimelineDemoCast`. */
  export interface TimelineDemoCast {
    version: number;
    kind: "timeline";
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    durationMs: number;
    fps?: number;
    [key: string]: unknown;
  }

  export interface TimelineDemoPlayerProps {
    cast: TimelineDemoCast;
    /** Elapsed time into the cast, in milliseconds. */
    timeMs: number;
    /** Maps a pinned asset's `file` name to a host URL (casts with file-backed assets). */
    resolveAssetUrl?: (file: string) => string;
    /** Pixel height of the tracks region. Default 320. */
    tracksHeightPx?: number;
    /** Lets a frame renderer block the capture until videos are paintable. */
    onPendingMedia?: PendingMediaHandler;
    style?: React.CSSProperties;
  }

  export const TimelineDemoPlayer: React.FC<TimelineDemoPlayerProps>;
  export const timelineEditingCast: TimelineDemoCast;
  /** Promo Act 2 — the four takes are cut on the timeline (demo/src/promo). */
  export const promoTimelineCast: TimelineDemoCast;
  /** Prompt typed into the promo's generate-at-the-playhead overlay. */
  export const PROMO_PLAYHEAD_PROMPT: string;
  /** Model id shown in the promo's generate-at-the-playhead overlay. */
  export const PROMO_PLAYHEAD_MODEL: string;
  /** Cast-time (ms) marks the promo scenes key their overlays to. */
  export const PROMO_TIMELINE_MARKS: {
    cutAssembled: number;
    playCut: number;
    playheadParked: number;
    clipQueued: number;
    clipReady: number;
  };
}
