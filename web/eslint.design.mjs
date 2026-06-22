// Shared design-system lint rules (DESIGN.md enforcement).
//
// These guardrails are consumed in two places:
//   - eslint.config.mjs        — the full web lint config (IDE + `lint:eslint`)
//   - eslint.design.config.mjs — a minimal, recommended-rule-free config that
//                                runs in the standard `npm run lint` gate
//
// oxlint (the default `npm run lint`) does not implement `no-restricted-syntax`,
// so the design-token rules can only run through ESLint. The dedicated gate
// config keeps them in CI without dragging in the recommended-rule backlog.
//
// All rules are `warn`: they surface the migration backlog (see docs/DESIGN.md)
// without breaking the build. Promote a category to `error` once it reaches
// zero violations to lock it in (fontWeight is already at zero).

// Files exempt from the design-token guardrails.
export const designTokenIgnores = [
  // Primitive layer + editor chrome are the sanctioned homes for raw values:
  // they define the tokens and wrap raw MUI.
  "src/components/ui_primitives/**",
  "src/components/editor_ui/**",
  // Design tokens govern shipped UI, not test fixtures, mocks, or harnesses.
  "**/__tests__/**",
  "**/*.test.{ts,tsx}",
  "src/__mocks__/**",
  "src/demo/**",
  "src/demo-entry.tsx",
  "src/e2e_runner/**",
  // Pure color-as-data modules: chart palettes, syntax-highlight themes, and
  // node/type color maps are intrinsically literal colors, not styling.
  "src/components/costs/costsData.ts",
  "src/components/textEditor/codeHighlightStyles.ts",
  "src/constants/colors.ts",
  "src/config/data_types.ts",
];

const muiPrimitiveMessage =
  "Use the equivalent primitive from components/ui_primitives instead of raw MUI. See ui_primitives/STRATEGY.md.";

const restrictedMuiNames = [
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
];

// Primitives-first guardrail: discourage importing raw MUI components outside
// the primitive layer. See web/src/components/ui_primitives/STRATEGY.md.
export const noRestrictedImports = [
  "warn",
  {
    paths: [
      {
        name: "@mui/material",
        importNames: restrictedMuiNames,
        message: muiPrimitiveMessage,
      },
    ],
    patterns: [
      {
        group: restrictedMuiNames.map((n) => `@mui/material/${n}`),
        message: muiPrimitiveMessage,
      },
    ],
  },
];

// Design-token guards: discourage hardcoded values that have a named token.
// See docs/DESIGN.md and ui_primitives/tokens.ts.
export const noRestrictedSyntax = [
  "warn",
  {
    // transition: "200ms ease" → use a MOTION token.
    selector: "Property[key.name='transition'] > Literal[value=/[0-9]+ms/]",
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
    // borderRadius: 8 (magic number) → use a BORDER_RADIUS token. The px-string
    // rule above misses numeric literals; 0 (flush) is allowed.
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
    // padding/margin/gap: "10px" → snap to the 4px spacing grid (SPACING tokens
    // in MUI sx; grid-aligned px in emotion css()).
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
    // color/background/border: "#abc" / "rgb(…)" → theme.vars.palette.*.
    // Scoped to text/background/border color props; fill/stroke (SVG & canvas)
    // and boxShadow (rgba shadows) are excluded as commonly legitimate
    // literal-color surfaces.
    selector:
      "Property[key.name=/^(color|background|backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outlineColor|textDecorationColor|caretColor|columnRuleColor)$/] > Literal[value=/#[0-9a-fA-F]+|rgba?\\(/]",
    message:
      "Use a theme.vars.palette.* token instead of a hardcoded hex/rgb color. New colors go in paletteDark.ts + paletteLight.ts as c_*. See docs/DESIGN.md §3.",
  },
];
