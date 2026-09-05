/**
 * RemainingTime
 *
 * "~M:SS remaining" under a rendering shot, and only when the number was
 * measured: the store keeps how long finished renders took, per model and per
 * kind, and this reads that bucket (PRD D14). No measurement, no text — the
 * same rule the spend estimate follows. A guessed number is worse than none,
 * because a creator plans around it.
 *
 * The first render on a fresh model therefore shows the progress bar alone,
 * and pays for the measurement the next one uses.
 */

import { memo, useEffect, useState } from "react";

import {
  durationBucketKey,
  measuredDurationMs,
  useStoryboardGenerationStore
} from "../../stores/storyboard/StoryboardGenerationStore";
import { Caption } from "../ui_primitives";

/**
 * Seconds as `~M:SS`. Minutes are not padded and are not capped at 60, so a
 * twelve-minute render reads `~12:05` rather than rolling over into hours.
 */
export const formatRemainingTime = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `~${minutes}:${String(total % 60).padStart(2, "0")}`;
};

export interface RemainingTimeProps {
  /** The shot whose in-flight render is being timed. */
  shotId: string;
  /** Positioning class from the card that mounts it. */
  className?: string;
}

const RemainingTimeImpl = ({ shotId, className }: RemainingTimeProps) => {
  const job = useStoryboardGenerationStore((state) => state.shotJobs[shotId]);
  const model = job?.renderInputs?.model;
  const samples = useStoryboardGenerationStore((state) =>
    job && model
      ? state.durationSamples[durationBucketKey(job.kind, model)]
      : undefined
  );

  const estimateMs = measuredDurationMs(samples);
  const startedAt = job?.startedAt;
  const running = job?.status === "queued" || job?.status === "running";
  const ticking = running && estimateMs !== null && startedAt !== undefined;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  if (!ticking) {
    return null;
  }
  const remainingMs = estimateMs - (now - startedAt);
  // An estimate the render has already overrun has stopped being an estimate;
  // counting `~0:00` at the creator is a worse answer than the progress bar.
  if (remainingMs <= 0) {
    return null;
  }

  return (
    <Caption color="secondary" className={className}>
      {`${formatRemainingTime(remainingMs / 1000)} remaining`}
    </Caption>
  );
};

export const RemainingTime = memo(RemainingTimeImpl);

export default RemainingTime;
