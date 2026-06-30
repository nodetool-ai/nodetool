/**
 * Cast registry — the set of demo recordings Remotion can render.
 *
 * `sampleCast` is the built-in synthetic demo. To add a recorded one, drop its
 * JSON in demo/casts/, pin its assets (`npm run pin-assets -- casts/<file>`),
 * then import it here:
 *
 *   import myDemo from "../../casts/my-demo.cast.json";
 *   const casts: DemoCast[] = [sampleCast, myDemo as DemoCast];
 */
import {
  sampleCast,
  tutorialCast,
  connectRunCast,
  listGeneratorCast,
  chatQaCast,
  templateMergeCast,
  summarizeCast,
  describeImageCast,
  cookbookCasts,
  type DemoCast,
} from "@web-demo";

const casts: DemoCast[] = [
  sampleCast,
  tutorialCast,
  connectRunCast,
  listGeneratorCast,
  chatQaCast,
  templateMergeCast,
  summarizeCast,
  describeImageCast,
  ...cookbookCasts,
];

/** The cast bound to the canonical `WorkflowDemo` composition id. */
export const DEFAULT_CAST: DemoCast = sampleCast;

export const listCasts = (): DemoCast[] => casts;

export const getCast = (id: string): DemoCast => {
  const cast = casts.find((c) => c.id === id);
  if (!cast) throw new Error(`Unknown cast id: ${id}`);
  return cast;
};
