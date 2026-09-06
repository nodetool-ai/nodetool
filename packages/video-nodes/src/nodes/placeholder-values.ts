/**
 * The `values` bag a template-filling node takes, as strings.
 *
 * `nodetool.script.FillScript` and `nodetool.timeline.FillTimelineText` both
 * accept a `dict` — typically a dataframe row — and both fill the same
 * `{{key}}` grammar, so the coercion lives in one place. A price of `79` must
 * fill as "79" rather than being skipped for not being a string.
 */
export function stringValues(
  values: Record<string, unknown> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === null || value === undefined) continue;
    out[key] =
      typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return out;
}
