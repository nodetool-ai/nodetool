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

  export interface DemoPlayerProps {
    cast: DemoCast;
    /** Elapsed time into the cast, in milliseconds. */
    timeMs: number;
    /** Maps a pinned asset file name to a host URL. */
    resolveAssetUrl: (file: string) => string;
    style?: React.CSSProperties;
    /** Controlled, animatable camera (overrides the cast's recorded viewport). */
    viewport?: { x: number; y: number; zoom: number };
  }

  export const DemoPlayer: React.FC<DemoPlayerProps>;
  export const sampleCast: DemoCast;
  export const tutorialCast: DemoCast;
  export const connectRunCast: DemoCast;
  export const listGeneratorCast: DemoCast;
  export const chatQaCast: DemoCast;
  export const templateMergeCast: DemoCast;
  export const summarizeCast: DemoCast;
  export const describeImageCast: DemoCast;
}
