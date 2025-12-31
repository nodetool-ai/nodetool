import { act } from "@testing-library/react";
import { useNotificationStore, verbosityCheck, NotificationType } from "../NotificationStore";

describe("NotificationStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useNotificationStore.setState({
      notifications: [],
      lastDisplayedTimestamp: null
    });
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has empty notifications array", () => {
      const { notifications } = useNotificationStore.getState();
      expect(notifications).toEqual([]);
    });

    it("has null lastDisplayedTimestamp", () => {
      const { lastDisplayedTimestamp } = useNotificationStore.getState();
      expect(lastDisplayedTimestamp).toBeNull();
    });
  });

  describe("addNotification", () => {
    it("adds a notification with generated id and timestamp", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Test notification"
        });
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].content).toBe("Test notification");
      expect(notifications[0].type).toBe("info");
      expect(notifications[0].id).toBeDefined();
      expect(notifications[0].timestamp).toBeInstanceOf(Date);
    });

    it("adds multiple notifications in order", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "First"
        });
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Second"
        });
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(2);
      expect(notifications[0].content).toBe("First");
      expect(notifications[1].content).toBe("Second");
    });

    it("preserves optional properties", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "warning",
          content: "Warning message",
          timeout: 5000,
          dismissable: true,
          alert: true
        });
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].timeout).toBe(5000);
      expect(notifications[0].dismissable).toBe(true);
      expect(notifications[0].alert).toBe(true);
    });

    it("handles all notification types", () => {
      const types: NotificationType[] = [
        "info",
        "debug",
        "error",
        "warning",
        "progress",
        "node",
        "job",
        "success"
      ];

      act(() => {
        types.forEach((type) => {
          useNotificationStore.getState().addNotification({
            type,
            content: `${type} notification`
          });
        });
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(types.length);
      types.forEach((type, index) => {
        expect(notifications[index].type).toBe(type);
      });
    });

    it("generates unique IDs for each notification", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "First"
        });
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Second"
        });
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].id).not.toBe(notifications[1].id);
    });
  });

  describe("removeNotification", () => {
    it("removes a notification by id", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "To be removed"
        });
      });

      const { notifications } = useNotificationStore.getState();
      const idToRemove = notifications[0].id;

      act(() => {
        useNotificationStore.getState().removeNotification(idToRemove);
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it("only removes the specified notification", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Keep this"
        });
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Remove this"
        });
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Keep this too"
        });
      });

      const { notifications } = useNotificationStore.getState();
      const idToRemove = notifications[1].id;

      act(() => {
        useNotificationStore.getState().removeNotification(idToRemove);
      });

      const updatedNotifications = useNotificationStore.getState().notifications;
      expect(updatedNotifications).toHaveLength(2);
      expect(updatedNotifications[0].content).toBe("Keep this");
      expect(updatedNotifications[1].content).toBe("Keep this too");
    });

    it("does nothing if id not found", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "Test"
        });
      });

      act(() => {
        useNotificationStore.getState().removeNotification("non-existent-id");
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe("clearNotifications", () => {
    it("clears all notifications", () => {
      act(() => {
        useNotificationStore.getState().addNotification({
          type: "info",
          content: "First"
        });
        useNotificationStore.getState().addNotification({
          type: "warning",
          content: "Second"
        });
        useNotificationStore.getState().addNotification({
          type: "error",
          content: "Third"
        });
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(3);

      act(() => {
        useNotificationStore.getState().clearNotifications();
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it("works when already empty", () => {
      act(() => {
        useNotificationStore.getState().clearNotifications();
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });
  });

  describe("updateLastDisplayedTimestamp", () => {
    it("updates the lastDisplayedTimestamp", () => {
      const testDate = new Date("2024-01-15T10:30:00Z");

      act(() => {
        useNotificationStore.getState().updateLastDisplayedTimestamp(testDate);
      });

      expect(useNotificationStore.getState().lastDisplayedTimestamp).toEqual(
        testDate
      );
    });

    it("can update timestamp multiple times", () => {
      const date1 = new Date("2024-01-15T10:30:00Z");
      const date2 = new Date("2024-01-15T11:45:00Z");

      act(() => {
        useNotificationStore.getState().updateLastDisplayedTimestamp(date1);
      });
      expect(useNotificationStore.getState().lastDisplayedTimestamp).toEqual(date1);

      act(() => {
        useNotificationStore.getState().updateLastDisplayedTimestamp(date2);
      });
      expect(useNotificationStore.getState().lastDisplayedTimestamp).toEqual(date2);
    });
  });
});

describe("verbosityCheck", () => {
  it("returns true when notification type is in accepted types", () => {
    expect(verbosityCheck("info", ["info", "warning", "error"])).toBe(true);
    expect(verbosityCheck("warning", ["info", "warning", "error"])).toBe(true);
    expect(verbosityCheck("error", ["info", "warning", "error"])).toBe(true);
  });

  it("returns false when notification type is not in accepted types", () => {
    expect(verbosityCheck("debug", ["info", "warning", "error"])).toBe(false);
    expect(verbosityCheck("progress", ["info", "warning"])).toBe(false);
  });

  it("handles empty accepted types array", () => {
    expect(verbosityCheck("info", [])).toBe(false);
  });

  it("handles all notification types", () => {
    const allTypes: NotificationType[] = [
      "info",
      "debug",
      "error",
      "warning",
      "progress",
      "node",
      "job",
      "success"
    ];

    allTypes.forEach((type) => {
      expect(verbosityCheck(type, allTypes)).toBe(true);
    });
  });
});
