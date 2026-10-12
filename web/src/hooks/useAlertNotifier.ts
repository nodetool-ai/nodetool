import { useCallback } from "react";
import { useNotificationStore } from "../stores/NotificationStore";

/**
 * Reports a failure or warning in the app's notification stack, the one
 * place transient feedback appears. Passing null does nothing, so the
 * returned function can stand in for a `setError` state setter.
 */
export const useAlertNotifier = (
  type: "error" | "warning"
): ((message: string | null) => void) => {
  const addNotification = useNotificationStore((s) => s.addNotification);
  return useCallback(
    (message: string | null) => {
      if (message) {
        addNotification({ type, alert: true, content: message });
      }
    },
    [addNotification, type]
  );
};
