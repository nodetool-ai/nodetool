import { act, renderHook } from "@testing-library/react";

import useAuth from "../../useAuth";
import {
  timelineEditorModeKey,
  useTimelineEditorMode,
  useTimelineEditorModeStore
} from "../TimelineEditorMode";

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

describe("useTimelineEditorMode", () => {
  beforeEach(() => {
    localStorage.clear();
    useTimelineEditorModeStore.setState({ modes: {} });
    signIn("alice");
  });

  it("starts in Simple mode", () => {
    const { result } = renderHook(() => useTimelineEditorMode());
    expect(result.current.mode).toBe("simple");
  });

  it("remembers Expert mode for the signed-in user", () => {
    const { result } = renderHook(() => useTimelineEditorMode());
    act(() => result.current.setMode("expert"));
    expect(result.current.mode).toBe("expert");
    expect(localStorage.getItem(timelineEditorModeKey("alice"))).toBe("expert");

    // A fresh session reads the stored choice back.
    act(() => useTimelineEditorModeStore.setState({ modes: {} }));
    const { result: reloaded } = renderHook(() => useTimelineEditorMode());
    expect(reloaded.current.mode).toBe("expert");
  });

  it("keeps each user's choice apart", () => {
    const { result } = renderHook(() => useTimelineEditorMode());
    act(() => result.current.setMode("expert"));
    act(() => signIn("bob"));
    expect(result.current.mode).toBe("simple");
    act(() => signIn(null));
    expect(result.current.mode).toBe("simple");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(timelineEditorModeKey("alice"), "wizard");
    const { result } = renderHook(() => useTimelineEditorMode());
    expect(result.current.mode).toBe("simple");
  });
});
