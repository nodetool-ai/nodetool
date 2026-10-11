import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { notifyMutationError } from "../notifyMutationError";
import { useNotificationStore } from "../../stores/NotificationStore";

describe("notifyMutationError", () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("adds an alerting error notification naming the action", () => {
    notifyMutationError("create the timeline", new Error("boom"));
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "error",
      content: "Could not create the timeline. Please try again.",
      alert: true
    });
  });

  it("logs the underlying error", () => {
    const error = new Error("boom");
    notifyMutationError("delete the sketch", error);
    expect(errorSpy).toHaveBeenCalledWith("Failed to delete the sketch", error);
  });
});
