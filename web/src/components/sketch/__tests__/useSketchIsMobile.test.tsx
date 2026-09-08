import { act, renderHook } from "@testing-library/react";
import { useSketchIsMobile } from "../hooks/useSketchIsMobile";

jest.mock("@mui/material", () => ({ useMediaQuery: () => false }));
jest.mock("@mui/material/styles", () => ({
  useTheme: () => ({ breakpoints: { down: () => "", values: { md: 900 } } })
}));

it("uses the embedded editor width and preserves its layout while hidden", () => {
  let resize: ResizeObserverCallback = () => {};
  const disconnect = jest.fn();
  const original = global.ResizeObserver;
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    resize = callback;
    return { observe: jest.fn(), disconnect };
  });
  const ref = { current: document.createElement("div") };
  const { result, unmount } = renderHook(() => useSketchIsMobile(ref));
  const setWidth = (width: number) =>
    act(() => {
      resize(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

  expect(result.current).toBe(false);
  setWidth(850);
  expect(result.current).toBe(true);
  setWidth(0);
  expect(result.current).toBe(true);
  setWidth(1200);
  expect(result.current).toBe(false);
  unmount();
  expect(disconnect).toHaveBeenCalled();
  global.ResizeObserver = original;
});
