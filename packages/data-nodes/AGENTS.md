# data-nodes — Dataframes, Filtering, Feeds & Charts

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **data-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (bounds, empty-input, and parsing rules apply). This overlay covers data-specific correctness.

## Dataframe shapes

- **Any dataframe consumer must accept BOTH shapes data nodes emit** — row-records
  `{ rows }` and the canonical column matrix `{ columns, data }` — by normalizing
  through the shared `asRows` helper. The chart reader and the web
  `DataframeRenderer` once understood only `{ columns, data }` and threw / rendered
  empty for `{ rows }`.

## Filter / query evaluation

- **Never evaluate filter expressions with `new Function`/`with(row)` or naive
  substring `.replace()` of `and`/`or`/`not`.** Substring replacement corrupts
  string literals (`'Research and Development'`); `with`+`new Function` makes
  chained comparisons (`100 <= price <= 200`) always-true and uses JS `in`
  (property check) for membership. Use the recursive-descent parser that supports
  Python-style chained comparisons and array `in`, and respects string literals.
- **Throw on an unparseable condition — never silently swallow to an empty
  result.** A silently-empty filter looks like "no matches" and hides the bug.

## Slicing & empty input

- **Negative slice indices**: `-1` is the only "through the end" sentinel; other
  negatives count back from the end (`max(0, len + end)`); guard non-finite via
  `Number.isFinite`. (See [packages/AGENTS.md § bounds](../AGENTS.md#indices-bounds-and-numeric-guards).)
- **Empty/whitespace input is a valid empty case** — `String(text ?? "").trim()`,
  then `text === "" ? [] : JSON.parse(text)`. Don't let `"   "` reach `JSON.parse`.

## Feed parsing

- **Read feed fields by element/attribute, not RSS-only assumptions.** Atom links
  come from `<link href=...>` (not `<id>`), and the author name is the `<name>`
  inside `<author>` — don't return the literal `<author><name>…</name></author>`
  markup.
