import { renderHook, act } from "@testing-library/react";
import { useAssetNavigation } from "../useAssetNavigation";

const assets = Array.from({ length: 10 }).map((_, i) => ({
  id: `${i}`
})) as any;

describe("useAssetNavigation", () => {
  test("changes index left/right without ctrl", () => {
    let index = 5;
    const onChangeIndex = (i: number) => {
      index = i;
    };
    const { result } = renderHook(() =>
      useAssetNavigation({
        open: true,
        assets,
        currentIndex: index,
        prevNextAmount: 5,
        onChangeIndex
      })
    );
    act(() => {
      result.current.changeAsset("left", false);
    });
    expect(index).toBe(4);
  });

  test("ctrl jump respects prevNextAmount and clamps", () => {
    let index2 = 4;
    const onChangeIndex2 = (i: number) => {
      index2 = i;
    };
    const { result: result2 } = renderHook(() =>
      useAssetNavigation({
        open: true,
        assets,
        currentIndex: index2,
        prevNextAmount: 5,
        onChangeIndex: onChangeIndex2
      })
    );
    act(() => {
      result2.current.changeAsset("right", true);
    });
    expect(index2).toBe(9);

    act(() => {
      result2.current.changeAsset("right", true);
    });
    expect(index2).toBe(9);
  });
});
