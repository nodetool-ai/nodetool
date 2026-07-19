# ui_primitives overhaul — implementation brief

Audit finding: `web/src/components/ui_primitives/` is a naming layer over MUI,
not a design system. The import policy is enforced (never import raw MUI) but
the visual decisions were never made, so screens built 100% from primitives
still look amateur by default. This brief lists the verified defects with
file:line evidence, then the fixes in priority order.

Ground rules for the implementing agent:

- All work in `web/`. After changes: `cd web && npm run typecheck && npm run lint && npm test`.
- Keep the 4px grid (`spacing.ts`), design tokens (`docs/DESIGN.md`), and the
  primitives-first policy (`web/src/components/ui_primitives/STRATEGY.md`).
- Fix defaults *in the primitives*, not by adding props at call sites. The
  measure of success: a bare `<Panel><FlexColumn><TextInput/><SelectField/></FlexColumn></Panel>`
  with no styling props should look like a professional form.
- Reference implementation of the target form look: the storyboard header in
  `web/src/components/storyboard/StoryboardBoard.tsx` (local `Field` wrapper,
  labels above controls, uniform 36px control heights, bordered panel). That
  file hand-fixes everything this brief systematizes; once the primitives are
  fixed, migrate it to the shared versions and delete the local workarounds.

## Defect inventory (verified)

### 1. No control-level tokens

`tokens.ts` exports `FONT_WEIGHT`, `FONT_SIZE_*`, `TYPOGRAPHY`, `MOTION`,
`Z_INDEX`, `BORDER_RADIUS` — but no control height, control padding, or field
radius. Every primitive invents its own:

| Component | Value | Source |
|---|---|---|
| EditorButton | `24` / `28` raw px | `editor_ui/EditorButton.tsx:55` |
| Editor selects | `28px` / `32px` | `theme.editor.heightNode/heightInspector`, `themes/components/editorControls.ts:104,124` |
| TagInput | `48px` | `ui_primitives/TagInput.tsx:51` |
| SearchInput radius | `8px` | `ui_primitives/SearchInput.tsx:46` |
| Editor control radius | `6px` | `themes/ThemeNodetool.tsx:76` |
| MuiButton radius | `theme.rounded.buttonLarge` | `themes/ThemeNodetool.tsx:241` |

Consequences: a compact EditorButton (24px) next to an editor select (28px)
misaligns by 4px; next to an inspector select by 8px. Four independent radius
sources. A second, parallel control scale lives on `theme.editor` that
`EditorButton` does not read.

Off-grid values inside the primitives whose own docs ban them
(`spacing.ts:23` forbids 0.25/0.75/1.25 steps):

- `Slider.tsx:45` — `13px` padding
- `NodeSlider.tsx:56` — `3px` margin
- `Panel.tsx:39` — `comfortable: 2.5` units; `Panel.tsx:151` divides padding to `1.25` units (5px)

### 2. Unrelated defaults across primitives

- `TextInput.tsx:52` → `variant="outlined"`, `size="medium"`
- `SelectField.tsx:98` → `size="medium"`, **`variant="standard"`**

A no-props TextInput above a no-props SelectField renders a boxed field above
an underline-only field — the default composition is broken.

Surfaces:

- `Panel.tsx:88-90` → `background.default`, `bordered=false`. Dark
  `background.default` is `#08090A` (`themes/paletteDark.ts:268`) — same as the
  page. **A default Panel is invisible.**
- `Surface.tsx:64-68` → `background.paper`, `bordered=false`, `elevation=0`,
  explicit `boxShadow: "none"`. Different background and radius source
  (`theme.rounded[...]`) than Panel (`theme.shape.borderRadius`).

`size` semantics diverge: `TextInput` maps `compact`→MUI small;
`SelectField`'s standard variant barely responds to `size`;
`EditorButton.tsx:65` does `height: size ? undefined : height` — passing
`size` silently discards the density height.

Flex containers: `FlexRow.tsx:55`, `FlexColumn.tsx:53`, `Stack.tsx:61` all
default `gap`/`spacing` to `0`, so naive composition glues controls together.

### 3. Four label treatments, none shared

1. MUI floating label — `TextInput`, hand-correcting MUI's transform
   (`TextInput.tsx:96` `translate(14px, 17px)`), forced to 15px, `opacity: 0.6`.
2. MUI `InputLabel` — `SelectField.tsx:123-129`, 15px, no opacity, no
   transform fix. Renders differently from TextInput's at rest.
3. `Label.tsx:79-90` — `Typography component="label"`, 13px, weight 500,
   `text.secondary`, baked `marginBottom: 2px`.
4. `FormField.tsx:85-95` — reimplements the same thing (does NOT use `Label`),
   duplicating the required-asterisk logic (`FormField.tsx:98-108` vs
   `Label.tsx:16`).

The theme sets a fifth treatment on `MuiFormLabel`
(`ThemeNodetool.tsx:249-259`): `capitalize`, 13px, `padding: 0 0 8px 0` —
which TextInput/SelectField then override back to 15px, defeating the theme's
label token exactly where labels matter.

The floating-label choice is also a bug class: the shrunk label renders above
the input box, and `Panel.tsx:136` is `overflow: hidden`, so a TextInput at
the top of a Panel gets its label clipped. (This shipped: the storyboard
title. Worked around in `StoryboardBoard.tsx` with `overflow: visible`.)

### 4. No usable form composition primitive

- `FormField` exists but per `STRATEGY.md:47` is used in **1 file**, with 14+
  places doing label+input+helper by hand.
- `FormField` double-labels: it renders its own label while
  TextInput/SelectField render theirs. `SelectField` has `hideLabel`
  (`SelectField.tsx:48`); `TextInput` has no escape hatch.
- No `FormRow`, `FormSection`, `FieldGroup`, or grid primitive. Only flex
  helpers.
- Spacing ownership is incoherent: `SelectField.tsx:117` comments "spacing is
  the parent's job" while `Label.tsx:88`, `FormField.tsx:120`,
  `AutocompleteTagInput.tsx:110`, `EmptyState`, `ProgressBar`,
  `SectionHeader`, and `Panel` bake their own margins. Stacking three fields
  yields four different gaps. TextInput additionally inherits MUI's default
  helper-text margin (`3px 14px 0`) which nothing overrides — off-grid and
  different from SelectField's `mt: 0.5` (`SelectField.tsx:158`).

### 5. The type scale is fake

`Text.tsx:14` advertises 8 sizes; `ThemeNodetool.tsx:40-46` collapses them to
~4 real values: `fontSizeBigger` = `fontSizeBig` = `18px`; `fontSizeSmaller` =
`fontSizeTiny` = `fontSizeTinyer` = `11px`. `<Text size="tiny">` and
`<Text size="smaller">` are indistinguishable.

### 6. Zero-opinion passthroughs masquerading as primitives

- `Box.tsx` — 2-line re-export.
- `muiReexports.ts:108-137` re-exports `Tabs`, `ToggleButton`, `Accordion`,
  `LinearProgress`, `Modal` etc. with a comment claiming "ThemeNodetool
  already styles them" — but the theme has no `MuiTabs`, `MuiToggleButton`,
  `MuiAccordion`, or `MuiLinearProgress` overrides (only `MuiButton`,
  `MuiFormLabel`, `MuiFormControl`, `MuiPopover`, `MuiModal`, `MuiToolbar`,
  `MuiDialogTitle`, `MuiTooltip`, `MuiDivider` — `ThemeNodetool.tsx:234-324`).
  Those re-exports render stock MUI.
- Contrast: `MuiTooltip` (`ThemeNodetool.tsx:301-312`) gets backdrop blur, a
  divider border, and a layered shadow — more surface craft than any panel,
  card, or input receives.

Inputs have no default field background: only editor-scoped controls get
`Paper.overlay` (`editorControls.ts:23`, gated on a marker class).
`SearchInput.tsx:48` gives itself `action.hover` — so search boxes read as
fields and plain text inputs don't.

## Fixes, in priority order

Do them as separate commits/PRs in this order. 1–3 are mechanical and improve
every existing screen without call-site changes.

### Fix 1: control tokens

Add to `tokens.ts`:

```ts
export const CONTROL = {
  height: { compact: 28, normal: 36, comfortable: 44 },   // px
  paddingX: { compact: 8, normal: 12 },                    // px, on-grid
  radius: BORDER_RADIUS.sm,                                // one field radius
} as const;
```

Wire it into: `EditorButton` (replace raw 24/28), `SelectField`, `TextInput`,
`SearchInput` (replace `8px` radius), `TagInput` (replace `48px`), and
`theme.editor.heightNode/heightInspector/controlRadius` (derive from `CONTROL`
so the two scales can't drift). Fix the off-grid values in `Slider.tsx:45`,
`NodeSlider.tsx:56`, `Panel.tsx:39/151` while touching them.

Acceptance: a compact EditorButton, a small SelectField, a small TextInput,
and the ModelSelectButton in one FlexRow all share one height, one radius,
one horizontal padding.

### Fix 2: one label treatment

Standardize on **label above the control**: 13px (`fontSizeSmall`), weight
500, `text.secondary`, no text-transform, 4px gap to the control.

- Remove the floating-label path: `TextInput` no longer forwards `label` to
  MUI; it renders the standard label above (via the shared `Label`). Delete
  the transform-correction sx (`TextInput.tsx:88-101`).
- `SelectField` same: drop `InputLabel`, render the shared label above.
- `FormField` uses `Label` instead of its own `Typography` block; delete the
  duplicated asterisk logic.
- Remove `textTransform: "capitalize"` and the 8px label padding from
  `MuiFormLabel` in `ThemeNodetool.tsx:249-259` (labels are no longer MUI-managed).
- This kills the clipped-label bug class; the `overflow: visible` workaround
  in `StoryboardBoard.tsx` styles can then go.

Acceptance: TextInput, SelectField, and a labelled ModelSelectButton render
pixel-identical labels; no label ever renders outside the control's box.

### Fix 3: coherent defaults

- `SelectField`: default `variant="outlined"` (matches TextInput). Audit the
  ~few call sites that relied on `standard`.
- Inputs get a default field background (`Paper.overlay` in dark; verify
  light) so fields read as fields outside the editor scope, matching
  SearchInput.
- `Panel`: default `background="paper"` **and** `bordered` — a default Panel
  must be visible on the page background. Align its radius source with
  `Surface` (pick one: `theme.rounded` or `shape.borderRadius`).
- `FlexRow`/`FlexColumn`/`Stack`: keep `gap=0` default (too many call sites
  assume it) — instead fix via Fix 4's form primitives which own their gaps.
- `EditorButton`: passing `size` must not discard density height — make
  `size` map onto the `CONTROL.height` scale or remove the prop.

Acceptance: the bare no-props composition in the ground rules renders as a
visible bordered panel containing two identically-styled fields.

### Fix 4: real form primitives

- Rework `FormField`: it owns the label (children render label-less), the
  4px label gap, and the helper/error line with a fixed on-grid margin.
  Ensure `TextInput`/`SelectField` compose without double labels (either via
  context flag or by convention: never pass `label` to a control inside
  `FormField`).
- Add `FormSection` (optional uppercase group label — see `.group-label` in
  `StoryboardBoard.tsx` — plus a `FlexColumn gap={3}` body) and `FormGrid`
  (n-column CSS grid with a stack breakpoint, like `.header-grid` there).
- Migrate `StoryboardBoard.tsx` to these, deleting its local `Field` and
  grid CSS. Migrate 2–3 of the 14+ hand-rolled label+input sites listed in
  STRATEGY.md as proof.

### Fix 5: honest type scale

Either give the collapsed sizes real values (a modular scale: e.g. 11/12/13/15/18/22)
or remove the aliased size names from `Text` and fix call sites. Don't leave
8 names for 4 values.

### Fix 6: passthrough honesty

For each raw re-export in `muiReexports.ts` that the theme does not style
(`Tabs`, `ToggleButton`, `Accordion`, `LinearProgress` at minimum): either add
the theme override or move it out of the "themed" comment block so the file
stops claiming coverage it doesn't have. Low priority; do last.

## Verification

- `cd web && npm run typecheck && npm run lint && npm test`
- Visual: storyboard header (`/workspace` storyboard tab), node inspector,
  settings dialogs — before/after screenshots for each fix.
- Grep gates after Fix 1: no raw `minHeight: "2[48]px"` in primitives; no
  `borderRadius: "8px"`/`"6px"` literals in `ui_primitives/` or
  `editor_ui/`; no `13px`/`3px`/`5px` paddings in primitives.
