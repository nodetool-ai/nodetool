import { create } from "zustand";
import { uuidv4 } from "./uuidv4";
import log from "loglevel";
// import { persist } from "zustand/middleware";
export type NotificationType =
  | "info"
  | "debug"
  | "error"
  | "warning"
  | "progress"
  | "node"
  | "job"
  | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  content: string;
  timestamp: Date;
  timeout?: number;
  dismissable?: boolean;
  alert?: boolean;
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

export const useNotificationStore = create<NotificationStore>()((set) => ({
  notifications: [],
  lastDisplayedTimestamp: null,

  addNotification: (notification) => {
    if (notification.type === "warning") {
      log.warn("NOTIFICATION:", notification);
    } else if (notification.type === "error") {
      log.error("NOTIFICATION:", notification);
    } else {
      log.info("NOTIFICATION:", notification);
    }

    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: uuidv4(), timestamp: new Date() }
      ]
    }));
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
