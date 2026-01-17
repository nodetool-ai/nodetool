import { renderHook, act } from "@testing-library/react";
import { useAppHeaderStore } from "../AppHeaderStore";

describe("AppHeaderStore", () => {
  beforeEach(() => {
    useAppHeaderStore.setState(useAppHeaderStore.getInitialState());
  });

  it("initializes with correct default state", () => {
    const { result } = renderHook(() => useAppHeaderStore());
    expect(result.current.helpOpen).toBe(false);
    expect(result.current.helpIndex).toBe(0);
  });

  it("sets help open state", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpOpen(true);
    });

    expect(result.current.helpOpen).toBe(true);
  });

  it("sets help open to false", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpOpen(true);
      result.current.setHelpOpen(false);
    });

    expect(result.current.helpOpen).toBe(false);
  });

  it("sets help index", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpIndex(5);
    });

    expect(result.current.helpIndex).toBe(5);
  });

  it("updates help index multiple times", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpIndex(1);
      result.current.setHelpIndex(2);
      result.current.setHelpIndex(3);
    });

    expect(result.current.helpIndex).toBe(3);
  });

  it("handleOpenHelp sets helpOpen to true", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.handleOpenHelp();
    });

    expect(result.current.helpOpen).toBe(true);
  });

  it("handleCloseHelp sets helpOpen to false", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.handleOpenHelp();
      result.current.handleCloseHelp();
    });

    expect(result.current.helpOpen).toBe(false);
  });

  it("can toggle help open state", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    expect(result.current.helpOpen).toBe(false);

    act(() => {
      result.current.handleOpenHelp();
    });
    expect(result.current.helpOpen).toBe(true);

    act(() => {
      result.current.handleCloseHelp();
    });
    expect(result.current.helpOpen).toBe(false);
  });

  it("can open and close help multiple times", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.handleOpenHelp();
      result.current.handleCloseHelp();
      result.current.handleOpenHelp();
      result.current.handleCloseHelp();
    });

    expect(result.current.helpOpen).toBe(false);
  });

  it("help index persists across open/close operations", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpIndex(2);
      result.current.handleOpenHelp();
    });
    expect(result.current.helpIndex).toBe(2);
    expect(result.current.helpOpen).toBe(true);

    act(() => {
      result.current.handleCloseHelp();
    });
    expect(result.current.helpIndex).toBe(2);
    expect(result.current.helpOpen).toBe(false);
  });

  it("handles negative help index", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpIndex(-1);
    });

    expect(result.current.helpIndex).toBe(-1);
  });

  it("handles large help index", () => {
    const { result } = renderHook(() => useAppHeaderStore());

    act(() => {
      result.current.setHelpIndex(999);
    });

    expect(result.current.helpIndex).toBe(999);
  });
});
