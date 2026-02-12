import { create } from "zustand";
import { uuidv4 } from "./uuidv4";
import log from "loglevel";
export type NotificationType =
  | "info"
  | "debug"
  | "error"
  | "warning"
  | "progress"
  | "node"
  | "job"
  | "success";

export interface NotificationAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface Notification {
  id: string;
  type: NotificationType;
  content: string;
  timestamp: Date;
  timeout?: number;
  dismissable?: boolean;
  alert?: boolean;
  action?: NotificationAction;
  /** Optional key for deduplication. If not provided, type + content is used. */
  dedupeKey?: string;
  /** When true, replaces existing notifications with the same dedupeKey instead of accumulating. */
  replaceExisting?: boolean;
}

/** Time window in milliseconds within which duplicate notifications are suppressed. */
const DEDUPE_WINDOW_MS = 5000;

interface NotificationStore {
  notifications: Notification[];
  lastDisplayedTimestamp: Date | null;

  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">
  ) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  updateLastDisplayedTimestamp: (timestamp: Date) => void;
}

export function verbosityCheck(
  notificationType: NotificationType,
  acceptedTypes: string[]
): boolean {
  return acceptedTypes.includes(notificationType);
}

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],
  lastDisplayedTimestamp: null,

  addNotification: (notification) => {
    // Deduplicate: skip if an identical notification was added recently
    const now = new Date();
    const key =
      notification.dedupeKey ?? `${notification.type}:${notification.content}`;
    const isDuplicate = get().notifications.some((existing) => {
      const existingKey =
        existing.dedupeKey ?? `${existing.type}:${existing.content}`;
      return (
        existingKey === key &&
        now.getTime() - existing.timestamp.getTime() < DEDUPE_WINDOW_MS
      );
    });

    if (isDuplicate) {
      log.debug("NOTIFICATION suppressed (duplicate):", notification);
      return;
    }

    if (notification.type === "warning") {
      log.warn("NOTIFICATION:", notification);
    } else if (notification.type === "error") {
      log.error("NOTIFICATION:", notification);
    } else {
      log.info("NOTIFICATION:", notification);
    }

    set((state) => {
      // When replaceExisting is true, remove previous notifications with the same key
      const base = notification.replaceExisting
        ? state.notifications.filter((existing) => {
            const existingKey =
              existing.dedupeKey ?? `${existing.type}:${existing.content}`;
            return existingKey !== key;
          })
        : state.notifications;

      return {
        notifications: [
          ...base,
          { ...notification, id: uuidv4(), timestamp: now }
        ]
      };
    });
  },
  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter(
        (notification) => notification.id !== id
      )
    }));
  },
  clearNotifications: () => {
    set({ notifications: [] });
  },
  updateLastDisplayedTimestamp: (timestamp: Date) => {
    set({ lastDisplayedTimestamp: timestamp });
  }
}));
