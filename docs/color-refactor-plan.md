# Colour Refactor Plan

## Context

The codebase still references a bespoke palette via keys like `c_gray2` or CSS vars such as `var(--c_hl1)`. We are migrating to the official MUI palette so that:

- greys come from `theme.palette.grey[50 … 900]`
- highlight colours come from the theme's **primary** (and **secondary**) palette entries, referenced **exclusively via CSS variables** so they can be changed at runtime.

NOTE: we use no mui prefix, so --palette instead of --mui-palette

## Mapping

| Old key / var           | Hex (dark theme) | New destination |
| ----------------------- | ---------------- | --------------- |
| `c_gray0` / `--c_gray0` | `#0E0E0E`        | `grey[900]`     |
| `c_gray1` / `--c_gray1` | `#242424`        | `grey[800]`     |
| `c_gray2` / `--c_gray2` | `#444444`        | `grey[600]`     |
| `c_gray3` / `--c_gray3` | `#6D6D6D`        | `grey[500]`     |
| `c_gray4` / `--c_gray4` | `#959595`        | `grey[400]`     |
| `c_gray5` / `--c_gray5` | `#BDBDBD`        | `grey[200]`     |
| `c_gray6` / `--c_gray6` | `#D9D9D9`        | `grey[100]`     |

Additional shades to be exposed for future use (no direct replacement now):

- `grey[50]` `#F5F5F5`
- `grey[300]` `#A9A9A9`
- `grey[700]` `#333333`

Highlight replacements:
| Old key / var | New replacement |
| ------------- | --------------- |
| `c_hl1`, `c_hl1_1`, `c_hl2`, `--c_hl1`, … | `var(--palette-primary-main)` (or `light` / `dark` as needed) |
NOTE: hl_1_1 maps to primary-light

## Conventions

- **JS/TS/Emotion** – use object-notation: `theme.palette.grey[600]`, except **primary / secondary** where **string CSS vars** are mandatory: `"var(--palette-primary-main)"`.
- **Plain CSS / css-in-js strings** – always use the corresponding CSS variable (`--palette-grey-600`, etc.).
- Obsolete keys (`c_gray*`, `c_hl*`) remain in theme files but are commented out for one release cycle, then deleted.

## Work Breakdown

### 1. Theme Update (setup-grey)

1. Extend the palette in `paletteDark.ts` (and light variant) with our custom grey object, overriding MUI defaults.
2. Comment-out the `c_gray*` and `c_hl*` entries.
3. Exporting the grey mapping enables `theme.palette.grey[…]` throughout the app.

### 2. Grey Migration (commit-grey-pass-1)

1. Code search for `theme\.palette\.c_gray[0-9]` → replace with mapped `theme.palette.grey[#]`.
2. Code search for `var\(--c_gray[0-9]\)` → replace with `var(--palette-grey-###)`.
3. Maintain compatibility by temporarily keeping the old CSS vars in `vars.css` pointing to the new ones:
   ```css
   /* Transitional – to be removed */
   --c_gray2: var(--palette-grey-600);
   ```
4. Commit.

### 2.1 Automated replacement commands (CLI)

These one-liners use `replace-in-files` (or any equivalent grep/sed workflow) and **must be executed in the given order**. The scope should include:

- `nodetool/web/src/components/**`
- `nodetool/web/src/styles/**`
- `nodetool/web/src/utils/**`
- `nodetool/web/src/ErrorBoundary.tsx`

```bash
# -----------------------------
# Grey scale – object notation
# -----------------------------
replace "theme\.palette\.c_gray6" "theme.palette.grey[100]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray5" "theme.palette.grey[200]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray4" "theme.palette.grey[400]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray3" "theme.palette.grey[500]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray2" "theme.palette.grey[600]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray1" "theme.palette.grey[800]"    --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\.palette\.c_gray0" "theme.palette.grey[900]"    --glob="**/*.{ts,tsx,js,jsx}"

# -----------------------------
# Grey scale – CSS var strings
# -----------------------------
replace "var\\(--c_gray6\\)" "var(--palette-grey-100)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray5\\)" "var(--palette-grey-200)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray4\\)" "var(--palette-grey-400)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray3\\)" "var(--palette-grey-500)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray2\\)" "var(--palette-grey-600)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray1\\)" "var(--palette-grey-800)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_gray0\\)" "var(--palette-grey-900)" --glob="**/*.{ts,tsx,js,jsx,css}"

# --------------------------------------
# Highlight colours – run *after* greys
# --------------------------------------
# CSS-var form (preferred everywhere)
replace "var\\(--c_hl1_1\\)" "var(--palette-primary-light)" --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_hl1\\)"   "var(--palette-primary-main)"  --glob="**/*.{ts,tsx,js,jsx,css}"
replace "var\\(--c_hl2\\)"   "var(--palette-primary-dark)"  --glob="**/*.{ts,tsx,js,jsx,css}"

# Fallback: highlight keys accessed through theme
replace "theme\\.palette\\.c_hl1_1" "'var(--palette-primary-light)'" --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\\.palette\\.c_hl1"   "'var(--palette-primary-main)'"  --glob="**/*.{ts,tsx,js,jsx}"
replace "theme\\.palette\\.c_hl2"   "'var(--palette-primary-dark)'"  --glob="**/*.{ts,tsx,js,jsx}"
```

> **Why this order?** We process greys from lightest (`c_gray6`) to darkest (`c_gray0`) to avoid accidental double-replacement of numbers when patterns overlap. Highlights are done afterwards to keep the two concerns separate and to allow an early visual smoke-test after grey migration.

### 3. Highlight Migration (commit-highlight-pass-1)

1. Replace `theme.palette.c_hl*` usages with the appropriate `"var(--palette-primary-main)"` or `light`/`dark` variant.
2. Replace `var(--c_hl1)`
