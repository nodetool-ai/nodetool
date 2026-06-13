import {
  formatKnobValue,
  knobDenorm,
  knobNorm,
  SYNTH_MODULE_CONFIGS,
  SYNTH_NODE_TYPES,
  type KnobSpec
} from "../synthModules";

const linear: KnobSpec = { name: "x", label: "X", min: 0, max: 10, default: 1 };
const log: KnobSpec = {
  name: "f",
  label: "F",
  min: 20,
  max: 20000,
  default: 1000,
  scale: "log",
  unit: "hz"
};

describe("knob math", () => {
  it("normalizes linearly and round-trips", () => {
    expect(knobNorm(linear, 0)).toBe(0);
    expect(knobNorm(linear, 10)).toBe(1);
    expect(knobNorm(linear, 5)).toBeCloseTo(0.5);
    expect(knobDenorm(linear, knobNorm(linear, 7.3))).toBeCloseTo(7.3);
  });

  it("normalizes log scale: geometric midpoint sits at t = 0.5", () => {
    expect(knobNorm(log, 20)).toBe(0);
    expect(knobNorm(log, 20000)).toBe(1);
    // sqrt(20 * 20000) ≈ 632.45
    expect(knobNorm(log, Math.sqrt(20 * 20000))).toBeCloseTo(0.5);
    expect(knobDenorm(log, knobNorm(log, 440))).toBeCloseTo(440);
  });

  it("clamps out-of-range values", () => {
    expect(knobNorm(linear, -5)).toBe(0);
    expect(knobNorm(linear, 99)).toBe(1);
    expect(knobDenorm(linear, 2)).toBe(10);
  });

  it("formats units compactly", () => {
    expect(formatKnobValue(log, 440)).toBe("440 Hz");
    expect(formatKnobValue(log, 1200)).toBe("1.20 kHz");
    expect(
      formatKnobValue({ ...linear, unit: "s" }, 0.25)
    ).toBe("250 ms");
    expect(formatKnobValue({ ...linear, unit: "s" }, 1.5)).toBe("1.50 s");
    expect(
      formatKnobValue({ ...linear, unit: "db", bipolar: true }, 3)
    ).toBe("+3.0 dB");
  });
});

describe("synth module configs", () => {
  it("log-scaled knobs have a strictly positive minimum", () => {
    for (const t of SYNTH_NODE_TYPES) {
      for (const k of SYNTH_MODULE_CONFIGS[t].knobs) {
        if (k.scale === "log") {
          expect(k.min).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every knob default lies within its range", () => {
    for (const t of SYNTH_NODE_TYPES) {
      for (const k of SYNTH_MODULE_CONFIGS[t].knobs) {
        expect(k.default).toBeGreaterThanOrEqual(k.min);
        expect(k.default).toBeLessThanOrEqual(k.max);
      }
    }
  });
});
