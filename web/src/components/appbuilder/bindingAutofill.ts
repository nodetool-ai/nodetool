/**
 * When a Slider or NumberInput binds to a numeric target (a node property or a
 * workflow input that carries min/max), copy those constraints into the widget's
 * own props so the user doesn't retype them. Only props still at their component
 * default are filled — anything the user customized is left alone.
 */

/** The numeric shape of a binding target, distilled from a Property / input. */
export interface NumericBindingTarget {
  min?: number;
  max?: number;
  /** True when the underlying type is integer-valued (step locks to 1). */
  isInt: boolean;
  /** Label to apply (Property.title || name, or the input's label). */
  label?: string;
}

/** The subset of widget props autofill may touch, as currently stored. */
export interface AutofillableProps {
  min?: unknown;
  max?: unknown;
  step?: unknown;
  label?: unknown;
}

export interface WidgetNumericDefaults {
  min: number;
  max: number;
  step: number;
  label: string;
}

export const SLIDER_DEFAULTS: WidgetNumericDefaults = {
  min: 0,
  max: 100,
  step: 1,
  label: "Slider"
};

export const NUMBER_INPUT_DEFAULTS: WidgetNumericDefaults = {
  min: 0,
  max: 100,
  step: 1,
  label: "Number"
};

/** Component defaults keyed by Puck component type, for the numeric widgets. */
export const NUMERIC_WIDGET_DEFAULTS: Record<string, WidgetNumericDefaults> = {
  Slider: SLIDER_DEFAULTS,
  NumberInput: NUMBER_INPUT_DEFAULTS
};

/**
 * A float step derived from the range: `(max - min) / 100` snapped to a clean
 * 1/2/5 × 10ⁿ value. Small 0..1-ish ranges fall back to 0.01.
 */
export const computeNumericStep = (
  min: number,
  max: number,
  isInt: boolean
): number => {
  if (isInt) return 1;
  const range = max - min;
  if (!Number.isFinite(range) || range <= 1) return 0.01;
  const raw = range / 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const clean =
    normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return clean * magnitude;
};

export type AutofillProps = Partial<{
  min: number;
  max: number;
  step: number;
  label: string;
}>;

/**
 * Compute the props to merge into a numeric widget when it binds to `target`.
 * Each prop is filled only if its current value still equals the component
 * default, so a value the user changed is never clobbered.
 */
export const computeAutofillProps = (
  target: NumericBindingTarget,
  current: AutofillableProps,
  defaults: WidgetNumericDefaults
): AutofillProps => {
  const out: AutofillProps = {};
  const hasMin = typeof target.min === "number" && Number.isFinite(target.min);
  const hasMax = typeof target.max === "number" && Number.isFinite(target.max);

  if (hasMin && current.min === defaults.min) out.min = target.min;
  if (hasMax && current.max === defaults.max) out.max = target.max;

  if (current.step === defaults.step) {
    if (target.isInt) {
      out.step = 1;
    } else if (hasMin && hasMax) {
      out.step = computeNumericStep(
        target.min as number,
        target.max as number,
        false
      );
    }
  }

  if (target.label && current.label === defaults.label) out.label = target.label;

  return out;
};
