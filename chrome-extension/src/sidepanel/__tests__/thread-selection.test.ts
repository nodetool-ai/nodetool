import { describe, expect, it } from "vitest";

import { selectThreadAfterLoad } from "../App.js";

describe("selectThreadAfterLoad", () => {
  const threads = [{ id: "existing-thread" }];

  it("keeps an explicit new conversation selected", () => {
    expect(selectThreadAfterLoad(null, threads, true)).toBeNull();
  });

  it("opens the newest thread on initial load", () => {
    expect(selectThreadAfterLoad(null, threads, false)).toBe("existing-thread");
  });
});
