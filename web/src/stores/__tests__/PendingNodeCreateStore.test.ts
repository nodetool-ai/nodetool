import usePendingNodeCreateStore from "../PendingNodeCreateStore";
import type { NodeMetadata } from "../ApiTypes";

const fakeMeta = (node_type: string): NodeMetadata =>
  ({ node_type, title: node_type, namespace: "x", outputs: [] }) as unknown as NodeMetadata;

describe("PendingNodeCreateStore", () => {
  beforeEach(() => {
    usePendingNodeCreateStore.setState({ pending: null });
  });

  it("starts with no pending request", () => {
    expect(usePendingNodeCreateStore.getState().pending).toBeNull();
  });

  it("requestCreate stores the metadata with a timestamp", () => {
    usePendingNodeCreateStore.getState().requestCreate(fakeMeta("a"));
    const p = usePendingNodeCreateStore.getState().pending;
    expect(p?.metadata.node_type).toBe("a");
    expect(typeof p?.requestedAt).toBe("number");
  });

  it("consume returns the metadata and clears pending", () => {
    usePendingNodeCreateStore.getState().requestCreate(fakeMeta("a"));
    const got = usePendingNodeCreateStore.getState().consume();
    expect(got?.node_type).toBe("a");
    expect(usePendingNodeCreateStore.getState().pending).toBeNull();
  });

  it("consume returns null for expired requests", () => {
    const old = Date.now() - 1500 - 100;
    usePendingNodeCreateStore.setState({
      pending: { metadata: fakeMeta("a"), requestedAt: old }
    });
    expect(usePendingNodeCreateStore.getState().consume()).toBeNull();
    expect(usePendingNodeCreateStore.getState().pending).toBeNull();
  });

  it("clear() removes any pending request", () => {
    usePendingNodeCreateStore.getState().requestCreate(fakeMeta("a"));
    usePendingNodeCreateStore.getState().clear();
    expect(usePendingNodeCreateStore.getState().pending).toBeNull();
  });
});
