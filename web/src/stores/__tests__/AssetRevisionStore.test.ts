import { act, renderHook } from "@testing-library/react";
import { useAssetRevision, useAssetRevisionStore } from "../AssetRevisionStore";

describe("AssetRevisionStore", () => {
  beforeEach(() => {
    useAssetRevisionStore.setState({ revisions: {} });
  });

  it("starts an asset at revision 0", () => {
    const { result } = renderHook(() => useAssetRevision("a"));
    expect(result.current).toBe(0);
  });

  it("returns 0 when there is no asset id", () => {
    useAssetRevisionStore.getState().bump("a");
    const { result } = renderHook(() => useAssetRevision(undefined));
    expect(result.current).toBe(0);
  });

  it("increments only the bumped asset", () => {
    const { bump } = useAssetRevisionStore.getState();
    bump("a");
    bump("a");
    bump("b");
    expect(useAssetRevisionStore.getState().revisions).toEqual({ a: 2, b: 1 });
  });

  it("re-renders a subscriber when its asset is bumped", () => {
    const { result } = renderHook(() => useAssetRevision("a"));
    act(() => useAssetRevisionStore.getState().bump("a"));
    expect(result.current).toBe(1);
  });

  it("does not change another asset's revision", () => {
    const { result } = renderHook(() => useAssetRevision("a"));
    act(() => useAssetRevisionStore.getState().bump("b"));
    expect(result.current).toBe(0);
  });
});
