/**
 * Tell the creator when a timeline generation lands.
 *
 * A render can take minutes, and the creator usually looks away while it
 * runs. Each landing shows a success toast. Landings that arrive close
 * together share one toast that counts them ("3 clips finished"), so a batch
 * does not stack a toast per clip. When the tab is hidden and the browser
 * allows it, a system notification goes out as well. While the browser has
 * not been asked yet, the toast offers to turn those alerts on.
 */

import {
  useNotificationStore,
  type Notification as Toast
} from "../../stores/NotificationStore";

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

const browserNotifications = (): typeof Notification | undefined =>
  typeof Notification === "undefined" ? undefined : Notification;

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

  const content = message(completion, count);
  const api = browserNotifications();
  const toast: Omit<Toast, "id" | "timestamp"> = {
    type: "success",
    content,
    dedupeKey: `timeline-generation-finished-${burstKey}`,
    replaceExisting: true
  };
  if (api?.permission === "default") {
    toast.action = {
      label: "Turn on desktop alerts",
      onClick: async () => {
        await api.requestPermission();
      }
    };
  }
  useNotificationStore.getState().addNotification(toast);

  if (
    api?.permission === "granted" &&
    typeof document !== "undefined" &&
    document.hidden
  ) {
    try {
      // The tag makes a burst replace its earlier system notification.
      new api("NodeTool", {
        body: content,
        tag: `timeline-generation-finished-${burstKey}`
      });
    } catch {
      // Some browsers only allow notifications from a service worker. The
      // toast is still there when the creator comes back.
    }
  }
}

export const __resetGenerationCompletionNoticeForTests = (): void => {
  announced.clear();
  bursts.clear();
};
