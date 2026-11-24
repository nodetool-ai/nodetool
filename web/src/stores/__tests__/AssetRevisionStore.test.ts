import { renderHook, act } from "@testing-library/react";
import {
  useAssetRevision,
  useAssetRevisionStore
} from "../AssetRevisionStore";

describe("AssetRevisionStore", () => {
  beforeEach(() => {
    useAssetRevisionStore.setState(useAssetRevisionStore.getInitialState());
  });

  it("bump counts up from zero per asset", () => {
    const { bump } = useAssetRevisionStore.getState();
    bump("a");
    bump("a");
    bump("b");
    expect(useAssetRevisionStore.getState().revisions).toEqual({ a: 2, b: 1 });
  });

  it("useAssetRevision is 0 for an unbumped or missing id", () => {
    const missing = renderHook(() => useAssetRevision(undefined));
    const unbumped = renderHook(() => useAssetRevision("x"));
    expect(missing.result.current).toBe(0);
    expect(unbumped.result.current).toBe(0);
  });

  it("useAssetRevision rerenders when its asset is bumped", () => {
    const { result } = renderHook(() => useAssetRevision("a"));
    act(() => useAssetRevisionStore.getState().bump("a"));
    expect(result.current).toBe(1);
    act(() => useAssetRevisionStore.getState().bump("other"));
    expect(result.current).toBe(1);
  });
});
