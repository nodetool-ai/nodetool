/**
 * Trim trailing slashes from a URL base. A loop rather than `/\/+$/`: the
 * unanchored regex backtracks quadratically on inputs with long interior
 * slash runs (CodeQL js/polynomial-redos), and a base URL is operator input.
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}
