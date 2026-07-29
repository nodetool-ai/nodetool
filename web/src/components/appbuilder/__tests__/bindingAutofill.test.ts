import {
  computeAutofillProps,
  computeNumericStep,
  SLIDER_DEFAULTS,
  NUMBER_INPUT_DEFAULTS
} from "../bindingAutofill";

describe("computeNumericStep", () => {
  it("locks to 1 for integer targets", () => {
    expect(computeNumericStep(0, 100, true)).toBe(1);
  });

  it("uses 0.01 for 0..1 ranges", () => {
    expect(computeNumericStep(0, 1, false)).toBe(0.01);
  });

  it("snaps a wide float range to a clean 1/2/5 step", () => {
    // range 200 → 200/100 = 2
    expect(computeNumericStep(0, 200, false)).toBe(2);
    // range 500 → 5
    expect(computeNumericStep(0, 500, false)).toBe(5);
    // range 30 → raw 0.3 → snaps to 0.2
    expect(computeNumericStep(0, 30, false)).toBe(0.2);
  });
});

describe("computeAutofillProps", () => {
  const untouchedSlider = {
    min: SLIDER_DEFAULTS.min,
    max: SLIDER_DEFAULTS.max,
    step: SLIDER_DEFAULTS.step,
    label: SLIDER_DEFAULTS.label
  };

  it("fills min/max/step and label from an int target at defaults", () => {
    const result = computeAutofillProps(
      { min: 1, max: 10, isInt: true, label: "Steps" },
      untouchedSlider,
      SLIDER_DEFAULTS
    );
    expect(result).toEqual({ min: 1, max: 10, step: 1, label: "Steps" });
  });

  it("derives a float step from a 0..1 target", () => {
    const result = computeAutofillProps(
      { min: 0, max: 1, isInt: false, label: "Strength" },
      untouchedSlider,
      SLIDER_DEFAULTS
    );
    expect(result).toEqual({ min: 0, max: 1, step: 0.01, label: "Strength" });
  });

  it("never overwrites props the user customized away from defaults", () => {
    const result = computeAutofillProps(
      { min: 0, max: 1, isInt: false, label: "Strength" },
      { min: -5, max: 5, step: 0.5, label: "My Label" },
      SLIDER_DEFAULTS
    );
    expect(result).toEqual({});
  });

  it("respects the NumberInput default label", () => {
    const result = computeAutofillProps(
      { isInt: true, label: "Count" },
      {
        min: NUMBER_INPUT_DEFAULTS.min,
        max: NUMBER_INPUT_DEFAULTS.max,
        step: NUMBER_INPUT_DEFAULTS.step,
        label: NUMBER_INPUT_DEFAULTS.label
      },
      NUMBER_INPUT_DEFAULTS
    );
    // No min/max on the target, so only step (int → 1) and label are filled.
    expect(result).toEqual({ step: 1, label: "Count" });
  });

  it("omits step for a float target without a full range", () => {
    const result = computeAutofillProps(
      { min: 0, isInt: false, label: "Gain" },
      untouchedSlider,
      SLIDER_DEFAULTS
    );
    expect(result).toEqual({ min: 0, label: "Gain" });
  });
});
