import {
  clearConsoleEntries,
  formatConsoleEntries,
  getConsoleEntries,
  recordConsoleEntry
} from "../consoleCapture";

describe("consoleCapture", () => {
  beforeEach(() => {
    clearConsoleEntries();
  });

  it("records what was logged, oldest first", () => {
    recordConsoleEntry("warn", ["first"]);
    recordConsoleEntry("error", ["second"]);
    expect(getConsoleEntries().map((entry) => entry.text)).toEqual([
      "first",
      "second"
    ]);
  });

  it("renders an Error with its stack", () => {
    recordConsoleEntry("error", [new Error("boom")]);
    expect(getConsoleEntries()[0].text).toContain("Error: boom");
  });

  it("survives a circular argument", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => recordConsoleEntry("log", [circular])).not.toThrow();
    expect(getConsoleEntries()).toHaveLength(1);
  });

  it("caps a single argument", () => {
    recordConsoleEntry("log", ["x".repeat(50_000)]);
    expect(getConsoleEntries()[0].text.length).toBeLessThan(2100);
  });

  it("drops the oldest entries past the cap", () => {
    for (let i = 0; i < 400; i++) {
      recordConsoleEntry("log", [`entry ${i}`]);
    }
    const entries = getConsoleEntries();
    expect(entries).toHaveLength(300);
    expect(entries[0].text).toBe("entry 100");
  });

  it("says so when nothing was captured", () => {
    expect(formatConsoleEntries([])).toBe("(no console output captured)");
  });

  it("formats entries with level and timestamp", () => {
    recordConsoleEntry("error", ["boom"]);
    expect(formatConsoleEntries(getConsoleEntries())).toContain("[ERROR] boom");
  });
});
