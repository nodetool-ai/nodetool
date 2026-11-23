/**
 * In the cloud window the drafts hook reports the open document's
 * synchronization status, and removes it when the document closes.
 */
import { describe, expect, it, jest } from "@jest/globals";
import { renderHook, waitFor } from "@testing-library/react";

import type { DraftableEditor } from "../../lib/cloud/cloudWindowDrafts";
import { flushCloudWindow } from "../../lib/cloud/cloudWindowClosing";
import { useCloudSyncStatusStore } from "../../stores/CloudSyncStatusStore";
import { useCloudWindowDrafts } from "../useCloudWindowDrafts";

jest.mock("../../lib/cloud/cloudWindow", () => ({
  CLOUD_WINDOW: { server: "https://cloud.example", account: "u1" }
}));

jest.mock("../../lib/cloud/localDraftStore", () => ({
  desktopCloudLocalDraftsClient: () => ({}),
  serverKeyOf: async () => "k",
  LocalDraftStore: class {
    async load() {
      return { draft: null };
    }
    async put(_key: unknown, _base: unknown, draft: string) {
      mockPuts.push(draft);
      return "d1";
    }
    async accept() {
      return "deleted";
    }
    async markUnsent() {
      return true;
    }
  }
}));

const mockPuts: string[] = [];

const editor = {
  dirty: false,
  text: "a",
  make(documentId: string): DraftableEditor {
    return {
      kind: "jsscript",
      documentId,
      revision: () => "r1",
      dirty: () => editor.dirty,
      content: () => editor.text,
      document: () => editor.text,
      resume: () => false
    };
  }
};
const makeEditor = (id: string): DraftableEditor => editor.make(id);
const subscribe = (): (() => void) => () => undefined;

describe("useCloudWindowDrafts", () => {
  it("reports the document's status while it is open", async () => {
    const { unmount } = renderHook(() => useCloudWindowDrafts("j1", makeEditor, subscribe));
    await waitFor(() => expect(useCloudSyncStatusStore.getState().statuses["jsscript:j1"]).toBe("savedToCloud"));

    editor.text = "ab";
    editor.dirty = true;
    await waitFor(() => expect(useCloudSyncStatusStore.getState().statuses["jsscript:j1"]).toBe("changesWaiting"));

    unmount();
    expect(useCloudSyncStatusStore.getState().statuses["jsscript:j1"]).toBeUndefined();
  });

  it("writes the open document's latest edit when the window closes", async () => {
    editor.text = "a";
    editor.dirty = false;
    mockPuts.length = 0;
    const { unmount } = renderHook(() => useCloudWindowDrafts("j2", makeEditor, subscribe));
    await waitFor(() => expect(useCloudSyncStatusStore.getState().statuses["jsscript:j2"]).toBe("savedToCloud"));
    editor.text = "closing edit";
    editor.dirty = true;
    await flushCloudWindow();
    expect(mockPuts).toContain("closing edit");
    unmount();
  });
});
