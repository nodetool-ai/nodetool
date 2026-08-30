/**
 * Cast registry — the set of demo casts Remotion can render.
 *
 * `sampleCast` is the built-in synthetic demo. To add one, author its module in
 * `web/src/demo/`, export it from that barrel, then import it here and append
 * it to `casts`. Media it references go in `demo/public/casts/<castId>/` and
 * are addressed as `cast-asset://<key>`.
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
  workflowCasts,
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
  ...workflowCasts,
];

/** The cast bound to the canonical `WorkflowDemo` composition id. */
export const DEFAULT_CAST: DemoCast = sampleCast;

export const listCasts = (): DemoCast[] => casts;

export const getCast = (id: string): DemoCast => {
  const cast = casts.find((c) => c.id === id);
  if (!cast) throw new Error(`Unknown cast id: ${id}`);
  return cast;
};
