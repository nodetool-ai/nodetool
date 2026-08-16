/**
 * Tests for the document sync registry — how a `resource_change` on an open
 * document's row is routed to the editor holding it.
 */
import {
  clearDocumentSyncSubscribers,
  handleDocumentResourceChange,
  registerDocumentSync
} from "../documentSync";
import { useNotificationStore } from "../NotificationStore";

const addNotification = jest.fn();

jest.mock("../NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ addNotification })
  }
}));

const subscriber = (
  overrides: Partial<{
    revision: string | null;
    dirty: boolean;
  }> = {}
) => {
  const reload = jest.fn();
  return {
    reload,
    handle: {
      localRevision: () => overrides.revision ?? "rev-1",
      isDirty: () => overrides.dirty ?? false,
      reload
    }
  };
};

describe("handleDocumentResourceChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDocumentSyncSubscribers();
  });

  afterEach(() => {
    // The store mock is shared; keep the type reference honest.
    expect(useNotificationStore.getState).toEqual(expect.any(Function));
  });

  it("reloads a clean editor when the row changed elsewhere", () => {
    const { handle, reload } = subscriber({ revision: "rev-1" });
    registerDocumentSync("timelinesequence", "t1", handle);

    handleDocumentResourceChange("timelinesequence", {
      event: "updated",
      id: "t1",
      updatedAt: "rev-2"
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(addNotification).not.toHaveBeenCalled();
  });

  it("ignores the editor's own write", () => {
    const { handle, reload } = subscriber({ revision: "rev-2" });
    registerDocumentSync("timelinesequence", "t1", handle);

    handleDocumentResourceChange("timelinesequence", {
      event: "updated",
      id: "t1",
      updatedAt: "rev-2"
    });

    expect(reload).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
  });

  it("keeps a dirty editor's edits and says the document changed", () => {
    const { handle, reload } = subscriber({ revision: "rev-1", dirty: true });
    registerDocumentSync("script", "s1", handle);

    handleDocumentResourceChange("script", {
      event: "updated",
      id: "s1",
      updatedAt: "rev-2"
    });

    expect(reload).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        content: expect.stringContaining("changed outside the editor")
      })
    );
  });

  it("reports a delete rather than reloading", () => {
    const { handle, reload } = subscriber();
    registerDocumentSync("storyboard", "b1", handle);

    handleDocumentResourceChange("storyboard", {
      event: "deleted",
      id: "b1",
      updatedAt: null
    });

    expect(reload).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("deleted outside the editor")
      })
    );
  });

  it("routes only to the row that changed, and stops after unsubscribe", () => {
    const first = subscriber();
    const second = subscriber();
    registerDocumentSync("imagedocument", "d1", first.handle);
    const unsubscribe = registerDocumentSync("imagedocument", "d2", second.handle);

    handleDocumentResourceChange("imagedocument", {
      event: "updated",
      id: "d2",
      updatedAt: "rev-2"
    });
    expect(first.reload).not.toHaveBeenCalled();
    expect(second.reload).toHaveBeenCalledTimes(1);

    unsubscribe();
    handleDocumentResourceChange("imagedocument", {
      event: "updated",
      id: "d2",
      updatedAt: "rev-3"
    });
    expect(second.reload).toHaveBeenCalledTimes(1);
  });

  it("hands a custom handler the notice instead of notifying", () => {
    const onExternalChange = jest.fn();
    const reload = jest.fn();
    registerDocumentSync("application", "a1", {
      localRevision: () => "rev-1",
      isDirty: () => true,
      reload,
      onExternalChange
    });

    handleDocumentResourceChange("application", {
      event: "updated",
      id: "a1",
      updatedAt: "rev-2"
    });

    expect(onExternalChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", updatedAt: "rev-2" })
    );
    expect(reload).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
  });
});
