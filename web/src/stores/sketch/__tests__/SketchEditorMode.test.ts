import { act, renderHook } from "@testing-library/react";

import useAuth from "../../useAuth";
import {
  sketchEditorModeKey,
  useSketchEditorMode,
  useSketchEditorModeStore
} from "../SketchEditorMode";

jest.mock("../../useAuth", () => {
  const { create } = jest.requireActual("zustand");
  const store = create(() => ({ user: null as { id: string } | null }));
  return { __esModule: true, default: store };
});

const signIn = (id: string | null) => {
  (useAuth as unknown as { setState: (s: unknown) => void }).setState({
    user: id === null ? null : { id }
  });
};

describe("useSketchEditorMode", () => {
  beforeEach(() => {
    localStorage.clear();
    useSketchEditorModeStore.setState({ modes: {} });
    signIn("alice");
  });

  it("starts in Simple mode", () => {
    const { result } = renderHook(() => useSketchEditorMode());
    expect(result.current.mode).toBe("simple");
  });

  it("remembers Expert mode for the signed-in user", () => {
    const { result } = renderHook(() => useSketchEditorMode());
    act(() => result.current.setMode("expert"));
    expect(result.current.mode).toBe("expert");
    expect(localStorage.getItem(sketchEditorModeKey("alice"))).toBe("expert");

    // A fresh session reads the stored choice back.
    act(() => useSketchEditorModeStore.setState({ modes: {} }));
    const { result: reloaded } = renderHook(() => useSketchEditorMode());
    expect(reloaded.current.mode).toBe("expert");
  });

  it("keeps each user's choice apart", () => {
    const { result } = renderHook(() => useSketchEditorMode());
    act(() => result.current.setMode("expert"));
    act(() => signIn("bob"));
    expect(result.current.mode).toBe("simple");
    act(() => signIn(null));
    expect(result.current.mode).toBe("simple");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(sketchEditorModeKey("alice"), "wizard");
    const { result } = renderHook(() => useSketchEditorMode());
    expect(result.current.mode).toBe("simple");
  });
});
