import type { Notification } from "../../../stores/NotificationStore";

type AddNotification = (
  notification: Omit<Notification, "id" | "timestamp">
) => void;

/**
 * Waits for every upload in a batch and returns the ones that succeeded, so
 * one failed file does not discard the rest. Failures are reported to the
 * user through `addNotification`.
 */
export const settleUploads = async <T>(
  uploads: Promise<T>[],
  noun: string,
  addNotification: AddNotification
): Promise<T[]> => {
  const results = await Promise.allSettled(uploads);
  const succeeded: T[] = [];
  const reasons: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      succeeded.push(result.value);
    } else {
      reasons.push(
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      );
    }
  }
  if (reasons.length > 0) {
    addNotification({
      type: "error",
      content: `${reasons.length} of ${results.length} ${noun} failed to upload: ${reasons[0]}`
    });
  }
  return succeeded;
};
