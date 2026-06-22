import { fixupConfigRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    )
  ),
  {
    ignores: [
      "dist/**/*",
      "build/**/*",
      "coverage/**/*",
      "jest.config.ts",
      "vite.config.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        tsconfigRootDir: __dirname,
        project: null,
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      // Surface remaining `any` for incremental cleanup toward the documented
      // "zero any in web/src" target (DEVELOPMENT_STANDARDS §1). Warn, not
      // error, so the legacy backlog and intentional generic-constraint idioms
      // don't break lint.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  },
  // Primitives-first guardrail: discourage importing raw MUI components outside
  // the primitive layer. `warn` (not `error`) so the existing backlog of raw
  // imports is surfaced for incremental migration without breaking lint.
  // ui_primitives/ and editor_ui/ are the legitimate homes for raw MUI and are
  // excluded below. See web/src/components/ui_primitives/STRATEGY.md.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui_primitives/**",
      "src/components/editor_ui/**",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@mui/material",
              importNames: [
                "Typography",
                "Button",
                "IconButton",
                "Tooltip",
                "CircularProgress",
                "Chip",
                "Dialog",
                "Alert",
                "Divider",
                "Paper",
                "Box",
                "Menu",
                "Popover",
                "Select",
                "Switch",
                "Checkbox",
                "Card",
                "Drawer",
              ],
              message:
                "Use the equivalent primitive from components/ui_primitives instead of raw MUI. See ui_primitives/STRATEGY.md.",
            },
          ],
          patterns: [
            {
              group: [
                "@mui/material/Typography",
                "@mui/material/Button",
                "@mui/material/IconButton",
                "@mui/material/Tooltip",
                "@mui/material/CircularProgress",
                "@mui/material/Chip",
                "@mui/material/Dialog",
                "@mui/material/Alert",
                "@mui/material/Divider",
                "@mui/material/Paper",
                "@mui/material/Box",
                "@mui/material/Menu",
                "@mui/material/Popover",
                "@mui/material/Select",
                "@mui/material/Switch",
                "@mui/material/Checkbox",
                "@mui/material/Card",
                "@mui/material/Drawer",
              ],
              message:
                "Use the equivalent primitive from components/ui_primitives instead of raw MUI. See ui_primitives/STRATEGY.md.",
            },
          ],
        },
      ],
      // Design-token guards (warn): discourage hardcoded values that have a
      // named token. See docs/DESIGN.md and ui_primitives/tokens.ts.
      "no-restricted-syntax": [
        "warn",
        {
          // transition: "200ms ease" → use a MOTION token.
          selector:
            "Property[key.name='transition'] > Literal[value=/[0-9]+ms/]",
          message:
            "Use a MOTION token (MOTION.fast/normal/slow/all/…) instead of a hardcoded transition string. See ui_primitives/tokens.ts.",
        },
        {
          // borderRadius: "8px" → use a BORDER_RADIUS token (var(--rounded-*)).
          selector:
            "Property[key.name='borderRadius'] > Literal[value=/[1-9][0-9]*px$/]",
          message:
            "Use a BORDER_RADIUS token (xs/sm/md/lg/xl/xxl/pill/circle) instead of a hardcoded px radius. See ui_primitives/tokens.ts.",
        },
        {
          // borderRadius: 8 (magic number) → use a BORDER_RADIUS token. The
          // px-string rule above misses numeric literals; 0 (flush) is allowed.
          selector: "Property[key.name='borderRadius'] > Literal[value>0]",
          message:
            "Use a BORDER_RADIUS token (xs/sm/md/lg/xl/xxl/pill/circle) instead of a magic-number radius. See ui_primitives/tokens.ts and docs/DESIGN.md §4.",
        },
        {
          // borderRadius: "var(--rounded-lg)" raw string → use the BORDER_RADIUS
          // constant (or theme.rounded.* for semantic aliases) in TSX.
          selector:
            "Property[key.name='borderRadius'] > Literal[value=/var\\(--rounded/]",
          message:
            "Use a BORDER_RADIUS constant (or theme.rounded.*) instead of a raw var(--rounded-*) string in TSX. See docs/DESIGN.md §4.",
        },
        {
          // fontSize: "14px" / "0.85rem" → use a TYPOGRAPHY / FONT_SIZE token
          // (or var(--fontSize*)). Icon sizing should use a token too.
          selector:
            "Property[key.name='fontSize'] > Literal[value=/^[0-9.]+(px|rem|em)$/]",
          message:
            "Use a TYPOGRAPHY/FONT_SIZE token or var(--fontSize*) instead of a hardcoded font size. See ui_primitives/tokens.ts and docs/DESIGN.md.",
        },
        {
          // padding/margin/gap: "10px" → snap to the 4px spacing grid (SPACING
          // tokens in MUI sx; grid-aligned px in emotion css()).
          selector:
            "Property[key.name=/^(padding|margin|gap|rowGap|columnGap)$/] > Literal[value=/^[0-9]+px$/]",
          message:
            "Snap spacing to the 4px grid: use SPACING tokens in MUI sx, or grid-aligned px in emotion css(). See ui_primitives/spacing.ts and docs/DESIGN.md.",
        },
        {
          // zIndex: 9999 (magic integer) → use Z_INDEX.* or theme.zIndex.*.
          // 0 (normal flow) and negative values (UnaryExpression) are allowed.
          selector: "Property[key.name='zIndex'] > Literal[value>0]",
          message:
            "Use a Z_INDEX token (base/raised/dropdown/sticky/overlay/modal/tooltip/toast) or theme.zIndex.* instead of a magic z-index integer. See ui_primitives/tokens.ts and docs/DESIGN.md §6.",
        },
        {
          // fontWeight: 700 / "bold" / 300 → only 400/500/600 (FONT_WEIGHT.*).
          selector:
            "Property[key.name='fontWeight'] > Literal[value=/^(100|200|300|700|800|900|bold|bolder|lighter)$/]",
          message:
            "Use FONT_WEIGHT.normal/medium/semibold (400/500/600). 700/bold/300 are not sanctioned weights. See docs/DESIGN.md §1.",
        },
        {
          // color/background/border/shadow: "#abc" / "rgb(…)" → theme.vars.palette.*.
          selector:
            "Property[key.name=/^(color|background|backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outlineColor|fill|stroke|boxShadow|textDecorationColor|caretColor|columnRuleColor)$/] > Literal[value=/#[0-9a-fA-F]+|rgba?\\(/]",
          message:
            "Use a theme.vars.palette.* token instead of a hardcoded hex/rgb color. New colors go in paletteDark.ts + paletteLight.ts as c_*. See docs/DESIGN.md §3.",
        },
      ],
    },
  },
];
