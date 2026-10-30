/**
 * One numeric-flag parser for every CLI command.
 *
 * `Number(opts.x)` fails open: `--min-success 0,8` becomes `NaN`, and every
 * comparison against `NaN` is false — so a CI gate silently stops gating and a
 * cost cap silently stops capping. A flag that cannot be read is an error, not
 * a default, so this throws with the flag named.
 *
 * The error is Commander's `InvalidArgumentError`, so a parser used as an
 * `argParser` prints one clean line instead of a stack trace; everywhere else
 * it is an ordinary `Error` the command's own catch reports.
 */
import { InvalidArgumentError } from "commander";

interface NumericOptionConstraints {
  /** Reject values below this bound (inclusive). */
  min?: number;
  /** Reject values above this bound (inclusive). */
  max?: number;
  /** Reject non-integers. */
  integer?: boolean;
}

/**
 * Parse a numeric CLI option, throwing a message that names the flag.
 *
 * @param value Raw option text as Commander handed it over.
 * @param flag Flag name for the error message, e.g. `--min-success`.
 */
export function parseNumericOption(
  value: string,
  flag: string,
  constraints: NumericOptionConstraints = {}
): number {
  const trimmed = value.trim();
  const n = trimmed === "" ? Number.NaN : Number(trimmed);
  const kind = constraints.integer ? "an integer" : "a number";
  if (!Number.isFinite(n)) {
    throw new InvalidArgumentError(`${flag} must be ${kind} (got "${value}")`);
  }
  if (constraints.integer && !Number.isInteger(n)) {
    throw new InvalidArgumentError(
      `${flag} must be an integer (got "${value}")`
    );
  }
  if (constraints.min !== undefined && n < constraints.min) {
    throw new InvalidArgumentError(
      `${flag} must be ${kind} >= ${constraints.min} (got "${value}")`
    );
  }
  if (constraints.max !== undefined && n > constraints.max) {
    throw new InvalidArgumentError(
      `${flag} must be ${kind} <= ${constraints.max} (got "${value}")`
    );
  }
  return n;
}

/**
 * Commander `argParser` form: `.option("--timeout <ms>", "…",
 * numericOptionParser("--timeout", { integer: true, min: 0 }))`.
 */
export function numericOptionParser(
  flag: string,
  constraints: NumericOptionConstraints = {}
): (value: string) => number {
  return (value: string) => parseNumericOption(value, flag, constraints);
}
