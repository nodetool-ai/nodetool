import { renderHook, act } from "@testing-library/react";
import { useLayoutDirection, getLayoutDirection } from "../useLayoutDirection";
import { useSettingsStore } from "../../stores/SettingsStore";
import { Position } from "@xyflow/react";

describe("useLayoutDirection", () => {
  const initialState = useSettingsStore.getState();

  afterEach(() => {
    act(() => {
      useSettingsStore.setState(initialState, true);
    });
  });

  it("returns horizontal layout direction by default", () => {
    const { result } = renderHook(() => useLayoutDirection());

    expect(result.current.layoutDirection).toBe("horizontal");
    expect(result.current.isVertical).toBe(false);
    expect(result.current.inputPosition).toBe(Position.Left);
    expect(result.current.outputPosition).toBe(Position.Right);
    expect(result.current.toolbarPosition).toBe(Position.Top);
  });

  it("returns vertical positions when layout direction is vertical", () => {
    act(() => {
      useSettingsStore.getState().setLayoutDirection("vertical");
    });

    const { result } = renderHook(() => useLayoutDirection());

    expect(result.current.layoutDirection).toBe("vertical");
    expect(result.current.isVertical).toBe(true);
    expect(result.current.inputPosition).toBe(Position.Top);
    expect(result.current.outputPosition).toBe(Position.Bottom);
    expect(result.current.toolbarPosition).toBe(Position.Left);
  });

  it("returns verticalModeHideProperties from settings", () => {
    const { result } = renderHook(() => useLayoutDirection());
    expect(result.current.verticalModeHideProperties).toBe(true);

    act(() => {
      useSettingsStore.getState().setVerticalModeHideProperties(false);
    });

    const { result: result2 } = renderHook(() => useLayoutDirection());
    expect(result2.current.verticalModeHideProperties).toBe(false);
  });
});

describe("getLayoutDirection", () => {
  const initialState = useSettingsStore.getState();

  afterEach(() => {
    useSettingsStore.setState(initialState, true);
  });

  it("returns horizontal positions by default", () => {
    const layout = getLayoutDirection();

    expect(layout.layoutDirection).toBe("horizontal");
    expect(layout.isVertical).toBe(false);
    expect(layout.inputPosition).toBe(Position.Left);
    expect(layout.outputPosition).toBe(Position.Right);
  });

  it("returns vertical positions when layout direction is vertical", () => {
    useSettingsStore.getState().setLayoutDirection("vertical");

    const layout = getLayoutDirection();

    expect(layout.layoutDirection).toBe("vertical");
    expect(layout.isVertical).toBe(true);
    expect(layout.inputPosition).toBe(Position.Top);
    expect(layout.outputPosition).toBe(Position.Bottom);
  });
});
