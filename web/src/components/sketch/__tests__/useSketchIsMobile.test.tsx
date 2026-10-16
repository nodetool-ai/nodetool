import { act, renderHook } from "@testing-library/react";
import {
  useSketchAssistantCramped,
  useSketchIsMobile
} from "../hooks/useSketchIsMobile";

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

// Study 4 E3-23: with the Chats panel open on a 1440 px screen the editor was
// about 940 px wide, above the mobile breakpoint, so the docked assistant and
// the right column left the canvas about 300 px.
it("reports the docked assistant as cramped beside a workspace side panel", () => {
  let resize: ResizeObserverCallback = () => {};
  const original = global.ResizeObserver;
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    resize = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  const ref = { current: document.createElement("div") };
  const { result } = renderHook(() => ({
    mobile: useSketchIsMobile(ref),
    cramped: useSketchAssistantCramped(ref)
  }));
  const setWidth = (width: number) =>
    act(() => {
      resize(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

  setWidth(1390);
  expect(result.current.cramped).toBe(false);
  setWidth(940);
  expect(result.current).toEqual({ mobile: false, cramped: true });
  setWidth(0);
  expect(result.current.cramped).toBe(true);
  setWidth(1390);
  expect(result.current.cramped).toBe(false);
  global.ResizeObserver = original;
});
