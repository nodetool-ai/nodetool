/**
 * Tell the creator when a timeline generation lands.
 *
 * A render can take minutes, and the creator usually looks away while it
 * runs. Each landing shows a success toast. Landings that arrive close
 * together share one toast that counts them ("3 clips finished"), so a batch
 * does not stack a toast per clip. While NodeTool is not focused, a desktop
 * notification goes out as well. While the browser has not been asked yet,
 * the toast offers to turn those alerts on.
 */

import {
  useNotificationStore,
  type Notification as Toast
} from "../../stores/NotificationStore";
import {
  canRequestSystemNotifications,
  requestSystemNotifications
} from "../../utils/systemNotification";

/** Landings within this window of the previous one join its toast. */
export const COMPLETION_BURST_MS = 10_000;

export type GenerationCompletionKind = "generation" | "edit";

export interface GenerationCompletion {
  requestId: string;
  sequenceId: string | null;
  clipName: string;
  kind: GenerationCompletionKind;
}

interface Burst {
  count: number;
  lastAt: number;
}

const announced = new Set<string>();
const bursts = new Map<string, Burst>();

const message = (completion: GenerationCompletion, count: number): string => {
  if (count > 1) return `${count} clips finished generating.`;
  const name = completion.clipName.trim() || "Clip";
  return completion.kind === "edit"
    ? `The edit of "${name}" finished.`
    : `"${name}" finished generating.`;
};

/** Announce one landed generation. A request is announced at most once. */
export function announceGenerationFinished(
  completion: GenerationCompletion,
  now: number = Date.now()
): void {
  if (announced.has(completion.requestId)) return;
  announced.add(completion.requestId);

  const burstKey = completion.sequenceId ?? "unsaved";
  const previous = bursts.get(burstKey);
  const count =
    previous && now - previous.lastAt < COMPLETION_BURST_MS
      ? previous.count + 1
      : 1;
  bursts.set(burstKey, { count, lastAt: now });

  const toast: Omit<Toast, "id" | "timestamp"> = {
    type: "success",
    content: message(completion, count),
    // The tag makes a burst replace its earlier desktop notification too.
    dedupeKey: `timeline-generation-finished-${burstKey}`,
    replaceExisting: true,
    system: true
  };
  if (canRequestSystemNotifications()) {
    toast.action = {
      label: "Turn on desktop alerts",
      onClick: requestSystemNotifications
    };
  }
  useNotificationStore.getState().addNotification(toast);
}

export const __resetGenerationCompletionNoticeForTests = (): void => {
  announced.clear();
  bursts.clear();
};
