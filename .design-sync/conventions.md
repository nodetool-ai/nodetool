# Building with the NodeTool design system

These are React components from NodeTool's `ui_primitives` library — built on
MUI v7 + Emotion, theme-driven, and dark by default (NodeTool's signature
`#08090A` canvas). Import every component from the bundle global; compose them
with realistic NodeTool-domain content (workflows, nodes, models, GPU runs,
assets, prompts).

## Wrapping (required)

Every primitive reads the NodeTool theme from React context. **Wrap your app
root in `DSProvider`** (exported from the bundle). Without it components render
with default MUI styling (light, wrong fonts) instead of the NodeTool dark theme.
`DSProvider` applies the theme, CssBaseline, the `dark` color scheme, and the
brand fonts (Inter for UI, JetBrains Mono for code). Do not add your own
ThemeProvider.

```jsx
const { DSProvider, Card, Text, AlertBanner } = window.NodeTool; // names vary by host

<DSProvider>
  <Card>
    <Text size="big" weight={600}>Image Upscaler</Text>
    <Text size="small" color="secondary">4 nodes · last run 2m ago</Text>
    <AlertBanner severity="success">Run completed — 12 assets generated.</AlertBanner>
  </Card>
</DSProvider>
```

## Styling idiom: props + `sx`, no utility classes

This is a **prop- and theme-driven** system — there are NO CSS utility classes.
Style components through their own props, and use MUI's `sx` prop with theme
tokens for any layout glue:

- **Variant props carry the design language.** Common axes across components:
  `size` (Text: `giant | big | normal | small | smaller`), `color`
  (`primary | secondary | success | warning | error`), `variant`
  (AlertBanner: `standard | outlined | filled`), `weight` (400/500/600),
  `compact`, `disabled`, `fullWidth`. Read each component's `<Name>.d.ts` for its
  exact props — they are the contract.
- **Layout** uses the layout primitives instead of raw divs: `FlexRow`,
  `FlexColumn` (numeric `gap`, `align`, `justify`, `padding`), `Stack`,
  `Container`, `Box`. Surfaces: `Card`, `Panel`, `Surface`.
- **`sx` tokens** resolve against the theme via MUI cssVariables (prefix-less,
  e.g. `var(--palette-primary-main)`, `var(--fontSizeNormal)`,
  `var(--rounded-md)`). Prefer `sx={{ color: "text.secondary", p: 2 }}` token
  strings over hardcoded colors/sizes.

## Where the truth lives

- Per component: `components/<group>/<Name>/<Name>.d.ts` (the prop contract) and
  `<Name>.prompt.md` (usage). Read these before composing a component.
- Styling closure: `styles.css` → `_ds_bundle.css` (component styles + bundled
  Inter/JetBrains Mono fonts). The theme tokens themselves are injected at runtime
  by `DSProvider`.

## Surfaces

`Surface` is the low-level elevated container; `background` (`paper | default |
transparent`), `elevation` (0–4), `bordered`, and `rounded` all honor the active
(dark) theme. `Card` is the structured-content surface and `Panel` the layout
region — reach for those first, and drop to `Surface` for custom containers.
