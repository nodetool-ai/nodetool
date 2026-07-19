import { act, renderHook } from "@testing-library/react";

import { openPersistedFold, usePersistedFold } from "../usePersistedFold";

describe("usePersistedFold", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens an already-mounted fold when requested from another control", () => {
    const { result } = renderHook(() => usePersistedFold("animate"));

    expect(result.current[0]).toBe(false);
    act(() => openPersistedFold("animate"));

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("nodetool.timeline.inspector.fold")).toContain(
      '"animate":true'
    );
  });
});
