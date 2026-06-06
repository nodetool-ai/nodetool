/**
 * Shared `{{ variable }}` / `{variable}` template substitution.
 *
 * Used by the Prompt and Format Text nodes and by the Agent node so they all
 * resolve placeholders the same way:
 *   - `{{ name }}` and `{name}` are replaced with the matching variable value.
 *   - `{{ name|filter1|filter2 }}` applies Jinja-style filters in order
 *     (upper, lower, capitalize, title, trim, truncate(n), default(val)).
 *   - Placeholders whose variable is absent are left intact.
 */

function toTitleCase(value: string): string {
  return value.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}

function applyFilter(value: string, filter: string): string {
  const trimmed = filter.trim();
  if (trimmed === "upper") return value.toUpperCase();
  if (trimmed === "lower") return value.toLowerCase();
  if (trimmed === "capitalize") {
    return value.length === 0
      ? ""
      : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
  if (trimmed === "title") return toTitleCase(value);
  if (trimmed === "trim") return value.trim();
  const truncateMatch = trimmed.match(/^truncate\((\d+)\)$/);
  if (truncateMatch) {
    const n = Number(truncateMatch[1]);
    return value.length <= n ? value : value.slice(0, n) + "...";
  }
  const defaultMatch = trimmed.match(/^default\((.+)\)$/);
  if (defaultMatch) {
    return value === "" ? defaultMatch[1].replace(/^['"]|['"]$/g, "") : value;
  }
  return value;
}

function applyFilters(value: string, filters: string[]): string {
  return filters.reduce((result, f) => applyFilter(result, f), value);
}

/**
 * Substitute `{{ variable }}` / `{variable}` placeholders in `template` with
 * values from `vars`. Unknown placeholders are left intact.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, unknown>
): string {
  let result = template;

  // {{ var|filter1|filter2 }}. The content class excludes both braces so the
  // lazy repetition can't scan across `{`/`}` runs — without that, inputs like
  // `{{{{{{...` give quadratic backtracking (CodeQL polynomial-ReDoS). A
  // placeholder expression never legitimately contains a brace. Surrounding
  // whitespace is handled by the per-part trim() below.
  result = result.replace(/\{\{([^{}]+?)\}\}/g, (match, expr: string) => {
    const parts = expr.split("|").map((p) => p.trim());
    const varName = parts[0];
    if (varName in vars) {
      const strValue = String(vars[varName] ?? "");
      return parts.length > 1
        ? applyFilters(strValue, parts.slice(1))
        : strValue;
    }
    return match;
  });

  // {var} (single brace, no filters)
  for (const [key, value] of Object.entries(vars)) {
    const strValue = String(value ?? "");
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const single = new RegExp(`(?<!\\{)\\{${escapedKey}\\}(?!\\})`, "g");
    result = result.replace(single, () => strValue);
  }

  return result;
}
