import { renderHook, act } from "@testing-library/react";
import {
  requestDocumentFocus,
  useDocumentFocusRequest,
  useDocumentFocusStore,
  type DocumentFocusRequest
} from "../DocumentFocusStore";


const clip: DocumentFocusRequest = {
  type: "timeline",
  ref: "t1",
  clipId: "c1"
};

describe("DocumentFocusStore", () => {
  beforeEach(() => {
    useDocumentFocusStore.setState(useDocumentFocusStore.getInitialState());
  });

  it("requestDocumentFocus parks a request from outside React", () => {
    requestDocumentFocus(clip);
    expect(useDocumentFocusStore.getState().pending).toBe(clip);
  });

  it("a newer request replaces the pending one", () => {
    const line: DocumentFocusRequest = { type: "script", ref: "s1", lineId: "l1" };
    requestDocumentFocus(clip);
    requestDocumentFocus(line);
    expect(useDocumentFocusStore.getState().pending).toBe(line);
  });

  it("clearDocumentFocus drops the request it was given", () => {
    requestDocumentFocus(clip);
    useDocumentFocusStore.getState().clearDocumentFocus(clip);
    expect(useDocumentFocusStore.getState().pending).toBeNull();
  });

  it("clearDocumentFocus ignores a stale request", () => {
    const shot: DocumentFocusRequest = {
      type: "storyboard",
      ref: "b1",
      shotId: "s1"
    };
    requestDocumentFocus(clip);
    requestDocumentFocus(shot);
    useDocumentFocusStore.getState().clearDocumentFocus(clip);
    expect(useDocumentFocusStore.getState().pending).toBe(shot);
  });

  describe("useDocumentFocusRequest", () => {
    it("returns the request when type and ref match", () => {
      requestDocumentFocus(clip);
      const { result } = renderHook(() =>
        useDocumentFocusRequest("timeline", "t1")
      );
      expect(result.current).toBe(clip);
    });

    it("returns null for another type, another ref, or a missing ref", () => {
      requestDocumentFocus(clip);
      const wrongType = renderHook(() => useDocumentFocusRequest("script", "t1"));
      const wrongRef = renderHook(() => useDocumentFocusRequest("timeline", "t2"));
      const noRef = renderHook(() => useDocumentFocusRequest("timeline", null));
      expect(wrongType.result.current).toBeNull();
      expect(wrongRef.result.current).toBeNull();
      expect(noRef.result.current).toBeNull();
    });

    it("updates when a request arrives after mount and clears", () => {
      const { result } = renderHook(() =>
        useDocumentFocusRequest("timeline", "t1")
      );
      expect(result.current).toBeNull();
      act(() => requestDocumentFocus(clip));
      expect(result.current).toBe(clip);
      act(() => useDocumentFocusStore.getState().clearDocumentFocus(clip));
      expect(result.current).toBeNull();
    });
  });
});
