import { useNotificationStore } from "../stores/NotificationStore";

/**
 * Report a failed mutation to the user instead of only logging it.
 *
 * `label` names the action in lowercase, verb-first form — e.g.
 * "create the timeline" produces "Could not create the timeline. Please try
 * again."
 */
export const notifyMutationError = (label: string, error: unknown): void => {
  console.error(`Failed to ${label}`, error);
  useNotificationStore.getState().addNotification({
    type: "error",
    content: `Could not ${label}. Please try again.`,
    alert: true
  });
};
