import { create } from "zustand";
import { uuidv4 } from "./uuidv4";
import log from "loglevel";
import { sanitizeDisplayText } from "../utils/sanitizeDisplayText";
import {
  NOTIFICATION_TIMEOUT_DEFAULT,
  NOTIFICATION_TIMEOUT_MIN,
  NOTIFICATION_TIMEOUT_MAX,
  NOTIFICATION_READING_WPM
} from "../config/constants";
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

/** Calculate auto-dismiss timeout based on message length. Longer messages get more reading time. */
export function calculateReadingTimeout(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMs = Math.ceil((wordCount / NOTIFICATION_READING_WPM) * 60 * 1000);
  return Math.max(
    NOTIFICATION_TIMEOUT_MIN,
    Math.min(NOTIFICATION_TIMEOUT_MAX, Math.max(readingTimeMs, NOTIFICATION_TIMEOUT_DEFAULT))
  );
}

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
    const sanitizedNotification = {
      ...notification,
      content: sanitizeDisplayText(notification.content),
    };

    // Deduplicate: skip if an identical notification was added recently
    const now = new Date();
    const key =
      sanitizedNotification.dedupeKey ??
      `${sanitizedNotification.type}:${sanitizedNotification.content}`;
    const isDuplicate = get().notifications.some((existing) => {
      const existingKey =
        existing.dedupeKey ?? `${existing.type}:${existing.content}`;
      return (
        existingKey === key &&
        now.getTime() - existing.timestamp.getTime() < DEDUPE_WINDOW_MS
      );
    });

    if (isDuplicate && !sanitizedNotification.replaceExisting) {
      log.debug("NOTIFICATION suppressed (duplicate):", sanitizedNotification);
      return;
    }

    if (sanitizedNotification.type === "warning") {
      log.warn("NOTIFICATION:", sanitizedNotification);
    } else if (sanitizedNotification.type === "error") {
      log.error("NOTIFICATION:", sanitizedNotification);
    } else {
      log.info("NOTIFICATION:", sanitizedNotification);
    }

    set((state) => {
      // When replaceExisting is true, remove previous notifications with the same key
      const base = sanitizedNotification.replaceExisting
        ? state.notifications.filter((existing) => {
            const existingKey =
              existing.dedupeKey ?? `${existing.type}:${existing.content}`;
            return existingKey !== key;
          })
        : state.notifications;

      return {
        notifications: [
          ...base,
          {
            ...sanitizedNotification,
            id: uuidv4(),
            timestamp: now,
            timeout: sanitizedNotification.timeout ?? calculateReadingTimeout(sanitizedNotification.content)
          }
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
