/**
 * Tests for src/commands/output.ts — printTable and asJson.
 *
 * `nodetool.ts` and several command modules import these directly, so this is
 * the one place they're tested against the real implementation rather than a
 * copy re-typed into a test file.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { printTable, asJson } from "../src/commands/output.js";

describe("printTable", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function lines(): string[] {
    return logSpy.mock.calls.map((call) => String(call[0]));
  }

  it("prints (no results) for an empty array", () => {
    printTable([]);
    expect(lines()).toEqual(["(no results)"]);
  });

  it("prints header, separator, and one data row", () => {
    printTable([{ id: "1", name: "test" }]);
    const out = lines();
    expect(out.length).toBe(3);
    expect(out[0]).toContain("id");
    expect(out[0]).toContain("name");
    expect(out[1]).toContain("┼");
    expect(out[2]).toContain("1");
    expect(out[2]).toContain("test");
  });

  it("pads columns to the widest value in that column", () => {
    printTable([
      { key: "a", value: "short" },
      { key: "b", value: "a much longer value" }
    ]);
    const out = lines();
    expect(out[2].length).toBe(out[3].length);
  });

  it("uses only the requested columns when given", () => {
    printTable([{ a: 1, b: 2, c: 3 }], ["a", "c"]);
    const out = lines();
    expect(out[0]).toContain("a");
    expect(out[0]).toContain("c");
    expect(out[0]).not.toContain("b");
  });

  it("renders null/undefined values as an empty cell", () => {
    printTable([{ key: "x", value: null }]);
    expect(lines()[2]).toContain("x");
  });

  it("renders every row", () => {
    printTable([
      { id: "1", name: "alpha" },
      { id: "2", name: "beta" },
      { id: "3", name: "gamma" }
    ]);
    expect(lines().length).toBe(5); // header + separator + 3 rows
  });
});

describe("asJson", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints pretty-printed JSON for an object", () => {
    asJson({ key: "value", num: 42 });
    expect(logSpy).toHaveBeenCalledWith(
      '{\n  "key": "value",\n  "num": 42\n}'
    );
  });

  it("prints arrays", () => {
    asJson([1, 2, 3]);
    expect(logSpy.mock.calls[0]![0]).toContain("[\n");
  });

  it("prints nested objects", () => {
    asJson({ outer: { inner: true } });
    expect(logSpy.mock.calls[0]![0]).toContain('"inner": true');
  });
});
