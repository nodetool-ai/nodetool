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
  // Color-picker + sketch tooling: every literal here is a *swatch / default
  // paint color* the user manipulates — color-as-data, not chrome styling.
  "src/components/color_picker/**",
  "src/components/sketch/tools/**",
  "src/components/sketch/types/**",
  "src/components/sketch/state/**",
  "src/components/sketch/ColorFieldPicker.tsx",
  "src/components/sketch/ColorPickerPopover.tsx",
  // 3D environment presets are literal scene colors fed to three.js.
  "src/components/asset_viewer/Model3DViewer.tsx",
  "src/components/model_editor/Model3DEditor.tsx",
  // Standalone debug surface + pre-theme bootstrap app render before the MUI
  // theme/vars exist, so they legitimately carry their own literal colors.
  "src/components/CodeEditorDebug.tsx",
  "src/GraphViewerApp.tsx",
  // Template-category accent colors are catalog data, not component styling.
  "src/utils/templateCategories.ts",
  // Prism/JSON syntax-highlight token colors — a fixed editor color scheme,
  // same category as textEditor/codeHighlightStyles.ts.
  "src/components/node/output/JSONRenderer.tsx",
  "src/components/node/output/ToolCallRenderer.tsx",
  // Canvas / WebGL / xterm surfaces consume *literal* colors (a CSS var() can't
  // be read by a 2D/GL/terminal renderer), so their color config stays literal.
  "src/components/node/NodeTerminal.tsx",
  "src/components/timeline/preview/PreviewCompositor.tsx",
  // Provider brand-identity colors in an onboarding data array.
  "src/components/portal/PortalSetupFlow.tsx",
  // "Add Black/White/Gray layer" swatch buttons — the button color *is* the
  // paint value it creates (color-as-data).
  "src/components/sketch/SketchLayersPanel.tsx",
  // Decorative multi-hue @keyframes "running" status pulse — a rainbow animation,
  // not semantic chrome.
  "src/components/miniapps/StandaloneMiniApp.tsx",
  // Decorative multi-hue @keyframes "generating" wash + shimmer + aura — a
  // rainbow animation overlay, not semantic chrome.
  "src/components/sketch/GeneratingLayerOverlay.tsx",
  "src/components/sketch/MagicGenerationFill.tsx",
];

const muiPrimitiveMessage =
  "Use the equivalent primitive from components/ui_primitives instead of raw MUI. See ui_primitives/STRATEGY.md.";

// Barrel-only guardrail for ui_primitives. Tests mock the barrel via
// jest.mock(".../ui_primitives"), so deep imports (.../ui_primitives/Button)
// bypass the mock — the failure behind the revert in commit 16a68253f. Import
// through the barrel (`from ".../ui_primitives"`) instead. Files inside the
// primitive layer are exempt via designTokenIgnores.
const uiPrimitivesBarrelMessage =
  "Import from the ui_primitives barrel (.../ui_primitives), not a deep path (.../ui_primitives/Foo). Deep imports bypass jest.mock of the barrel. See ui_primitives/STRATEGY.md and the revert in commit 16a68253f.";

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
      {
        // Deep imports into the primitive layer. The barrel itself
        // (.../ui_primitives, .../ui_primitives/index) is allowed.
        group: ["**/ui_primitives/*", "!**/ui_primitives/index"],
        message: uiPrimitivesBarrelMessage,
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
  // NOTE: Font size is NOT handled here. The `design-tokens/font-size-tokens`
  // custom rule below covers object props AND px/rem inside `styled`/`css`
  // template literals, and (per DESIGN.md §1) deliberately allows `em` for icon
  // glyph scaling. See eslint.design.mjs → fontSizeTokensRule and docs/DESIGN.md §1.
  // NOTE: Spacing (padding/margin/gap) is NOT handled here. A `no-restricted-syntax`
  // selector can only see object-literal `Property > Literal` nodes, which misses
  // (a) shorthand strings ("8px 12px"), (b) MUI sx short props (p/px/mt/…), and
  // (c) raw px inside `styled`/`css` template literals. The richer
  // `design-tokens/spacing-tokens` custom rule below covers all of those. See
  // eslint.design.mjs → spacingTokensRule and docs/DESIGN.md §2.
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
  // NOTE: Color is NOT handled here. The `design-tokens/color-tokens` custom
  // rule below covers object props AND hex/rgb inside `styled`/`css` template
  // literals, and skips values that already reference a CSS var (e.g.
  // `rgba(var(--palette-primary-main-channel) / 0.1)`), which are theme-driven.
  // See eslint.design.mjs → colorTokensRule and docs/DESIGN.md §3.
];

// ---------------------------------------------------------------------------
// Spacing custom rule (DESIGN.md §2 — 4px grid, SPACING/PADDING/MARGIN/GAP).
//
// `no-restricted-syntax` only matches object-literal `Property > Literal`
// nodes, so it cannot see shorthand strings, MUI sx short props, or px values
// embedded in `styled`/`css` template literals. This rule covers all three:
//
//   1. Object props   { padding: "8px" }      sx + emotion css({}) objects
//   2. Short props    { p: "8px", mt: "4px" } MUI sx system shorthands
//   3. Template CSS    css`padding: 8px;`      styled-components / emotion css``
//
// Any non-zero px spacing value is reported — full token migration means even
// grid-aligned px ("8px") must become a token. `0` / `0px` (flush) is allowed.
// ---------------------------------------------------------------------------

// Every spacing-related object key: full names, logical props, and MUI sx
// short props (p/px/mt/…). Short props are only flagged when the value is a
// px string, which makes a non-spacing collision (e.g. `{ p: 0.5 }`) impossible.
export const SPACING_PROP_KEYS = new Set([
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingInline",
  "paddingBlock",
  "paddingInlineStart",
  "paddingInlineEnd",
  "paddingBlockStart",
  "paddingBlockEnd",
  "paddingX",
  "paddingY",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "marginInline",
  "marginBlock",
  "marginInlineStart",
  "marginInlineEnd",
  "marginBlockStart",
  "marginBlockEnd",
  "marginX",
  "marginY",
  "gap",
  "rowGap",
  "columnGap",
  "gridGap",
  "gridRowGap",
  "gridColumnGap",
  // MUI sx system shorthands
  "p",
  "pt",
  "pr",
  "pb",
  "pl",
  "px",
  "py",
  "m",
  "mt",
  "mr",
  "mb",
  "ml",
  "mx",
  "my",
]);

// A CSS spacing declaration carrying a px value, for scanning template-literal
// CSS text. Matches `padding: 8px`, `margin-top: 12px`, `gap: 4px 8px`, etc.
const CSS_SPACING_DECL =
  /(?:^|[;{}\n])\s*(?:padding|margin|gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*[^;{}]*?\d+(?:\.\d+)?px/i;

// True when the string contains at least one non-zero px value. `0px` is flush
// and always allowed.
const hasNonZeroPx = (value) => {
  const re = /(\d+(?:\.\d+)?)px/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    if (parseFloat(m[1]) !== 0) return true;
  }
  return false;
};

const SPACING_MESSAGE =
  "Use a spacing token instead of a raw px value for padding/margin/gap. In MUI sx use a numeric token (SPACING.md, PADDING.normal, …); in emotion css()/styled use getSpacingPx(SPACING.md) or createPadding(theme, …). See ui_primitives/spacing.ts and docs/DESIGN.md §2.";

export const spacingTokensRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce SPACING/PADDING/MARGIN/GAP tokens for padding, margin, and gap (DESIGN.md §2).",
    },
    schema: [],
    messages: { raw: SPACING_MESSAGE },
  },
  create(context) {
    const keyName = (key) => {
      if (!key) return null;
      if (key.type === "Identifier") return key.name;
      if (key.type === "Literal") return String(key.value);
      return null;
    };
    return {
      Property(node) {
        const name = keyName(node.key);
        if (!name || !SPACING_PROP_KEYS.has(name)) return;
        const value = node.value;
        if (
          value.type === "Literal" &&
          typeof value.value === "string" &&
          hasNonZeroPx(value.value)
        ) {
          context.report({ node: value, messageId: "raw" });
        }
      },
      TemplateElement(node) {
        const raw = node.value.raw;
        if (CSS_SPACING_DECL.test(raw) && hasNonZeroPx(raw)) {
          context.report({ node, messageId: "raw" });
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Font-size custom rule (DESIGN.md §1 — four sanctioned sizes).
//
// `no-restricted-syntax` only sees object-literal `Property > Literal` nodes, so
// it misses px/rem embedded in `styled`/`css` template literals. This rule
// covers both. Per DESIGN.md §1, `em` is the sanctioned icon-glyph scaling unit
// and is deliberately NOT flagged; only px/rem font sizes must become a token
// (var(--fontSize*) / FONT_SIZE_*). `0`/`inherit`/`%` are not font sizes here.
// ---------------------------------------------------------------------------

// px/rem font size as a standalone object-property value (e.g. "14px", "0.85rem").
const FONT_SIZE_PX_REM = /^[0-9]*\.?[0-9]+(?:px|rem)$/i;
// A `font-size: <n>px|rem` declaration inside template-literal CSS.
const CSS_FONT_SIZE_DECL = /font-size\s*:\s*[^;{}]*?[0-9]*\.?[0-9]+(?:px|rem)/i;

const FONT_SIZE_MESSAGE =
  "Use a font-size token (var(--fontSizeBig/Normal/Small/Smaller), a FONT_SIZE_* token, or spread TYPOGRAPHY.*) instead of a raw px/rem font size. `em` is allowed for icon scaling only. See ui_primitives/tokens.ts and docs/DESIGN.md §1.";

export const fontSizeTokensRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce font-size tokens (var(--fontSize*) / TYPOGRAPHY) for raw px/rem font sizes (DESIGN.md §1).",
    },
    schema: [],
    messages: { raw: FONT_SIZE_MESSAGE },
  },
  create(context) {
    return {
      Property(node) {
        const key = node.key;
        const name =
          key?.type === "Identifier"
            ? key.name
            : key?.type === "Literal"
              ? String(key.value)
              : null;
        if (name !== "fontSize") return;
        const value = node.value;
        if (
          value.type === "Literal" &&
          typeof value.value === "string" &&
          FONT_SIZE_PX_REM.test(value.value.trim())
        ) {
          context.report({ node: value, messageId: "raw" });
        }
      },
      TemplateElement(node) {
        if (CSS_FONT_SIZE_DECL.test(node.value.raw)) {
          context.report({ node, messageId: "raw" });
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Color custom rule (DESIGN.md §3 — theme.vars.palette.* only).
//
// Covers object props AND color declarations inside `styled`/`css` template
// literals. A value is reported only when it carries a raw hex / rgb()/rgba()
// literal AND does NOT reference a CSS var: a value like
// `rgba(var(--palette-primary-main-channel) / 0.12)` is already theme-driven and
// is intentionally allowed. fill/stroke (SVG & canvas) and boxShadow (rgba
// elevation shadows) remain out of scope as legitimate literal-color surfaces.
// ---------------------------------------------------------------------------

// Object-style color property keys (camelCase, MUI sx + emotion objects).
const COLOR_PROP_KEYS = new Set([
  "color",
  "background",
  "backgroundColor",
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outline",
  "outlineColor",
  "textDecorationColor",
  "caretColor",
  "columnRuleColor",
]);

// CSS (kebab-case) color properties for scanning template-literal CSS text.
const CSS_COLOR_PROP =
  "(?:color|background|background-color|border|border-top|border-right|border-bottom|border-left|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|text-decoration-color|caret-color|column-rule-color)";
const CSS_COLOR_DECL = new RegExp(
  `(?:^|[;{}\\n])\\s*${CSS_COLOR_PROP}\\s*:\\s*([^;{}]*)`,
  "gi"
);

// A raw hex or rgb()/rgba() color literal.
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

// True when the value carries a raw color literal that is NOT routed through a
// CSS var. `var(--…)` (incl. `rgba(var(--…channel) / a)`) is theme-driven and OK.
const hasRawColor = (value) =>
  RAW_COLOR.test(value) && !/var\(\s*--/.test(value);

const COLOR_MESSAGE =
  "Use a theme.vars.palette.* token instead of a hardcoded hex/rgb color. New colors go in paletteDark.ts + paletteLight.ts as c_*. Values already routed through a CSS var (e.g. rgba(var(--palette-…-channel) / a)) are fine. See docs/DESIGN.md §3.";

export const colorTokensRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce theme.vars.palette.* tokens for color/background/border (DESIGN.md §3).",
    },
    schema: [],
    messages: { raw: COLOR_MESSAGE },
  },
  create(context) {
    return {
      Property(node) {
        const key = node.key;
        const name =
          key?.type === "Identifier"
            ? key.name
            : key?.type === "Literal"
              ? String(key.value)
              : null;
        if (!name || !COLOR_PROP_KEYS.has(name)) return;
        const value = node.value;
        if (
          value.type === "Literal" &&
          typeof value.value === "string" &&
          hasRawColor(value.value)
        ) {
          context.report({ node: value, messageId: "raw" });
        }
      },
      TemplateElement(node) {
        const raw = node.value.raw;
        CSS_COLOR_DECL.lastIndex = 0;
        let m;
        while ((m = CSS_COLOR_DECL.exec(raw)) !== null) {
          if (hasRawColor(m[1])) {
            context.report({ node, messageId: "raw" });
            return;
          }
        }
      },
    };
  },
};

// Local plugin exposing the design-token rules for the gate config.
export const designTokensPlugin = {
  rules: {
    "spacing-tokens": spacingTokensRule,
    "font-size-tokens": fontSizeTokensRule,
    "color-tokens": colorTokensRule,
  },
};
