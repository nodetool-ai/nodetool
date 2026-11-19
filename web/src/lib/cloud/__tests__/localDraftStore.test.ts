/**
 * @jest-environment node
 */
import { cloudLocalDraftsClient, LocalDraftStore, type CloudLocalCaller } from "../localDraftStore";
import type { CloudDocumentKey } from "../CloudDocumentSaver";

const KEY: CloudDocumentKey = { serverKey: "k", accountId: "u1", kind: "workflow", documentId: "w1" };
const BASE = { updatedAt: "2026-11-19T10:00:00Z", contentHash: "h1" };

describe("the cloud window's drafts client", () => {
  it("sends each call through the desktop app and reads its answer", async () => {
    const call = jest.fn<ReturnType<CloudLocalCaller>, Parameters<CloudLocalCaller>>(async (procedure) =>
      procedure === "cloudLocal.drafts.put"
        ? { ok: true, data: { draft_id: "d1" } }
        : { ok: true, data: { draft: null } }
    );
    const store = new LocalDraftStore(cloudLocalDraftsClient(call));
    expect(await store.put(KEY, BASE, "{}")).toBe("d1");
    expect(call).toHaveBeenCalledWith("cloudLocal.drafts.put", {
      server_key: "k",
      account_id: "u1",
      kind: "workflow",
      document_id: "w1",
      base: { updated_at: BASE.updatedAt, content_hash: "h1" },
      draft: "{}"
    });
    expect(await store.load(KEY)).toEqual({ draft: null });
    expect(call).toHaveBeenLastCalledWith("cloudLocal.drafts.get", expect.objectContaining({ document_id: "w1" }));
  });

  it("reads a refused or unavailable call as the store not answering", async () => {
    const store = new LocalDraftStore(
      cloudLocalDraftsClient(async () => ({ ok: false, error: "UNAVAILABLE" }))
    );
    expect(await store.put(KEY, BASE, "{}")).toBeNull();
    expect(await store.load(KEY)).toBeNull();
    expect(await store.markUnsent(KEY, "d1", "REFUSED")).toBe(false);
  });
});
