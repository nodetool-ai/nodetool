import {
  FADER_MAX_DB,
  FADER_MIN_DB,
  dbToFaderPosition,
  faderPositionToDb,
  formatDb,
  formatPan,
  panValueText,
  parseDb
} from "../faderTaper";

describe("fader taper", () => {
  it("maps the ends and unity", () => {
    expect(dbToFaderPosition(FADER_MIN_DB)).toBe(0);
    expect(dbToFaderPosition(-Infinity)).toBe(0);
    expect(dbToFaderPosition(FADER_MAX_DB)).toBe(1);
    expect(dbToFaderPosition(24)).toBe(1);
    expect(dbToFaderPosition(0)).toBeCloseTo(0.86);
    expect(faderPositionToDb(0)).toBe(FADER_MIN_DB);
    expect(faderPositionToDb(1)).toBe(FADER_MAX_DB);
  });

  it("is monotonic and round-trips to 0.1 dB", () => {
    let last = -1;
    for (let db = -100; db <= 6; db += 0.5) {
      const p = dbToFaderPosition(db);
      expect(p).toBeGreaterThan(last);
      last = p;
      expect(faderPositionToDb(p)).toBeCloseTo(db, 1);
    }
  });

  it("gives the top of travel more room per dB than the bottom", () => {
    const top = dbToFaderPosition(0) - dbToFaderPosition(-6);
    const bottom = dbToFaderPosition(-54) - dbToFaderPosition(-60);
    expect(top).toBeGreaterThan(bottom * 2);
  });
});

describe("dB and pan text", () => {
  it("formats levels", () => {
    expect(formatDb(undefined)).toBe("0.0 dB");
    expect(formatDb(-6)).toBe("-6.0 dB");
    expect(formatDb(3.46)).toBe("+3.5 dB");
    expect(formatDb(FADER_MIN_DB)).toBe("-inf dB");
  });

  it("parses typed levels", () => {
    expect(parseDb("-6")).toBe(-6);
    expect(parseDb(" +3.5 dB ")).toBe(3.5);
    expect(parseDb("-4db")).toBe(-4);
    expect(parseDb("−3")).toBe(-3);
    expect(parseDb("-inf")).toBe(FADER_MIN_DB);
    expect(parseDb("40")).toBe(24);
    expect(parseDb("-500")).toBe(FADER_MIN_DB);
    expect(parseDb("")).toBeNull();
    expect(parseDb("loud")).toBeNull();
  });

  it("formats pan", () => {
    expect(formatPan(undefined)).toBe("C");
    expect(formatPan(-0.3)).toBe("L 30");
    expect(formatPan(1)).toBe("R 100");
    expect(panValueText(0.001)).toBe("Centre");
    expect(panValueText(-0.5)).toBe("50% left");
  });
});
