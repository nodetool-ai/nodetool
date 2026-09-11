/** Shared types for the demo compositions (title cards, captions, cast entries). */

export interface CaptionCue {
  fromMs: number;
  toMs: number;
  text: string;
}

export type FocusTarget =
  | { readonly kind: "overview" }
  | { readonly kind: "node"; readonly nodeId: string }
  | { readonly kind: "component"; readonly focusId: string }
  | { readonly kind: "group"; readonly targets: readonly FocusTarget[] };

export type FocusEmphasis = "outline" | "dim" | "outline-dim";

export interface TutorialShot {
  readonly id: string;
  readonly fromMs: number;
  readonly toMs: number;
  readonly target: FocusTarget;
  readonly moveMs?: number;
  readonly padding?: number;
  readonly maxZoom?: number;
  readonly emphasis?: FocusEmphasis;
  readonly actionAtMs?: number;
  /** Presentation time whose settled layout supplies this shot's target bounds. */
  readonly anchorMs?: number;
}

/** A linear presentation-time interval mapped onto a cast-time interval. */
export interface TimeMapSegment {
  readonly presentationFromMs: number;
  readonly presentationToMs: number;
  readonly castFromMs: number;
  readonly castToMs: number;
}

export type TimeMap = readonly TimeMapSegment[];
