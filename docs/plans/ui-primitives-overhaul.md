# ui_primitives overhaul — verified brief, tech design, implementation plan

> Status: planned. Verified against `main` @ `2cf277b` (2026-07-18). All file:line
> references below were re-checked against that commit; when the code drifts,
> re-verify before implementing.

## 1. Problem statement

`web/src/components/ui_primitives/` is a naming layer over MUI, not a design
system. The import policy is enforced (never import raw MUI outside
`ui_primitives/` and `editor_ui/`) and holds in practice — a sweep found zero
raw `TextField`/`Select` imports in app code. But the visual decisions were
never made, so a screen built 100% from primitives still looks amateur by
default: fields with mismatched variants, invisible panels, four label
treatments, and per-component invented heights.

The measure of success: a bare

```tsx
<Panel><FlexColumn gap={3}><TextInput label="Name" /><SelectField label="Kind" options={...} /></FlexColumn></Panel>
```

with no styling props renders as a professional form — visible panel, two
identically-styled fields, labels above controls, one control height.

**Reference implementation of the target look**: the storyboard header in
`web/src/components/storyboard/StoryboardBoard.tsx` (as of `2cf277b`). It
hand-builds everything this plan systematizes: a local `Field` wrapper
(`StoryboardBoard.tsx:69`) putting labels above controls, uniform 36px control
heights via CSS override (`StoryboardBoard.tsx:131-133`), an uppercase
`.group-label` (`:112-116`), a responsive `.header-grid` (`:102-111`), and an
`overflow: visible` workaround for Panel clipping the floating label
(`:96-98`). Note it does *not* solve everything — its Panel is still the
invisible default background. Once the primitives are fixed, migrate this file
to the shared versions and delete the local workarounds (Fix 4).

## 2. Defect inventory (verified)

Every claim below was verified against the codebase; corrections from the
original audit draft are marked ⚠.

### 2.1 No control-level tokens

`tokens.ts` exports `FONT_WEIGHT`, `FONT_SIZE_SANS`/`FONT_SIZE_MONO`,
`TYPOGRAPHY`, `MOTION`, `reducedMotion`, `Z_INDEX`, `BORDER_RADIUS`, and
scrollbar helpers — but no control height, control padding, or field radius.
Every primitive invents its own:

| Component | Value | Source |
|---|---|---|
| EditorButton | `24` / `28` raw px | `editor_ui/EditorButton.tsx:55` |
| Editor node controls | `28px` | `theme.editor.heightNode` (`ThemeNodetool.tsx:70`), used at `themes/components/editorControls.ts:108` |
| Inspector controls | `32px` | `theme.editor.heightInspector` (`ThemeNodetool.tsx:71`), used at `editorControls.ts:129` |
| TagInput | `48px` | `ui_primitives/TagInput.tsx:51` |
| SearchInput radius | `8px` | `ui_primitives/SearchInput.tsx:48` |
| Editor control radius | `6px` | `theme.editor.controlRadius` (`ThemeNodetool.tsx:76`) |
| MuiButton radius | `theme.rounded.buttonLarge` = 6px | `ThemeNodetool.tsx:241` |

Consequences: a compact EditorButton (24px) next to a node-canvas select
(28px) misaligns by 4px; next to an inspector select by 8px. Three independent
radius sources for controls. A second, parallel control scale lives on
`theme.editor` that `EditorButton` does not read. `EditorButton.tsx:65` does
`height: size ? undefined : height` — passing `size` silently discards the
density height.

Off-grid values inside the primitives whose own docs ban them
(`spacing.ts:23` forbids 0.25/0.75/1.25/2.5/5 steps; canonical scale is
`[0, 0.5, 1, 1.5, 2, 3, 4, 6, 8]` units of 4px):

- `Slider.tsx:45` — `13px` vertical padding (normal density)
- `NodeSlider.tsx:56` — `3px` margin-top (compact)
- `Panel.tsx:39` — `comfortable: 2.5` units; `Panel.tsx:151` computes
  `paddingValue / 2` ⚠ (a computed halving, not a literal 1.25 — yields 1.25
  units = 5px for `comfortable`)

⚠ Additional offenders the original draft missed (same class of defect, fold
into the Fix 1 sweep):

| File | Defect |
|---|---|
| `TabGroup.tsx:86,105` | `minHeight: isSmall ? "36px" : "42px"` — 42 is off-grid |
| `Chip.tsx:64` | `height: "22px"` — off-grid |
| `UndoRedoButtons.tsx:51-52,68,73` | `padding: 6px`, `border-radius: 6px`, `24px` box |
| `MenuItemPrimitive.tsx:46,114,131,135` | `border-radius: 4px` literals, `min-height: 32px`, `min-width: 28px` |
| `MobileBottomSheet.tsx:45-46,62-63` | `16px` corner radii, `40px`/`4px` grab handle |
| `WarningBanner.tsx:73` | `border-radius: 8px` |
| `Breadcrumbs.tsx:56` | `border-radius: 4px` |
| `ZoomControls.tsx:34` | `minWidth: "45px"` — off-grid |
| `InfoTooltip.tsx:77` | `font-size: 14px` — off the type scale |
| `NotificationBadge.tsx:56` | `font-size: 10px` — off the type scale |

### 2.2 Unrelated defaults across primitives

- `TextInput.tsx:52-53` → `variant="outlined"`, `size="medium"`
- `SelectField.tsx:98-99` → `size="medium"`, **`variant="standard"`**

A no-props TextInput above a no-props SelectField renders a boxed field above
an underline-only field — the default composition is broken. Of 29 real
SelectField call sites, 17 rely on the `standard` default and 12 pass
`variant="standard"` redundantly (7 of those in `SettingsMenu.tsx` alone).

Surfaces:

- `Panel.tsx:89-90` → `bordered=false`, `background="default"`. Dark
  `background.default` is `#08090A` (`paletteDark.ts:268`) — same as the page.
  **A default Panel is invisible.** 42 call sites outside the primitives use
  Panel; none pass `background`.
- `Surface.tsx:64-68` → `background="paper"`, `bordered=false`,
  `elevation=0` with explicit `boxShadow: "none"`. Different background AND a
  different radius source (`theme.rounded[...]`, `Surface.tsx:92-95`) than
  Panel (`theme.shape.borderRadius`, `Panel.tsx:135`).

`size` semantics diverge: `TextInput` maps `compact` → MUI `small`
(`TextInput.tsx:73`); `SelectField`'s standard variant barely responds to
`size`; `EditorButton` discards its height when `size` is passed (see 2.1).

Flex containers: `FlexRow.tsx:55`, `FlexColumn.tsx:53`, `Stack.tsx:61` all
default `gap`/`spacing` to `0`. ~374 of ~1010 usages (37%) rely on that
default, so it cannot be changed — form spacing must come from the Fix 4
composition primitives instead.

### 2.3 Four label treatments, none shared

1. MUI floating label — `TextInput`, hand-correcting MUI's transform
   (`TextInput.tsx:95-96` `translate(14px, 17px)`), sized via
   `theme.fontSizeNormal || "15px"` ⚠ (token with fallback, not a hardcoded
   15px), `opacity: 0.6` (`TextInput.tsx:89-92`).
2. MUI `InputLabel` — `SelectField.tsx:123-129`, same 15px, no opacity, no
   transform fix. Renders differently from TextInput's at rest.
3. `Label.tsx` — `Typography component="label"` (`:81`), 13px, weight 500,
   `text.secondary`, baked `marginBottom: theme.spacing(0.5)` = 2px (`:88`).
4. `FormField.tsx:85-96` — reimplements the same thing with its own
   `Typography` (does NOT use `Label`), duplicating the required-asterisk
   logic (`FormField.tsx:98-108` vs `Label.tsx:95-104`).

The theme sets a fifth treatment on `MuiFormLabel`
(`ThemeNodetool.tsx:249-262`): `capitalize`, 13px, `padding: 0 0 8px 0` —
which TextInput/SelectField then override back to 15px, defeating the theme's
label token exactly where labels matter.

The floating-label choice is also a bug class: the shrunk label renders above
the input box, and `Panel.tsx:136` is `overflow: hidden`, so a TextInput at
the top of a Panel gets its label clipped. This shipped (the storyboard
title) and is worked around in `StoryboardBoard.tsx:96-98` with
`overflow: visible`.

Escape hatches are asymmetric: `SelectField` has `hideLabel`
(`SelectField.tsx:48`); `TextInput` has none — the storyboard `Field` wrapper
exists partly because you cannot stop TextInput from floating its label.

### 2.4 No usable form composition primitive

- `FormField` exists but has exactly **1 consumer**
  (`components/collections/CollectionForm.tsx`); `STRATEGY.md:47` counts 14+
  places doing label+input+helper by hand.
- `FormField` double-labels: it renders its own label while
  TextInput/SelectField render theirs.
- No `FormRow`, `FormSection`, `FieldGroup`, or grid primitive. Only flex
  helpers — which default to `gap=0` (2.2).
- Spacing ownership is incoherent: `SelectField.tsx:117` comments "spacing is
  the parent's job" while `Label.tsx:88`, `FormField.tsx:120`,
  `AutocompleteTagInput.tsx`, `EmptyState`, `ProgressBar`, `SectionHeader`,
  and `Panel` bake their own margins. Stacking three fields yields four
  different gaps. TextInput additionally inherits MUI's default helper-text
  margin (`3px 14px 0`) which nothing overrides — off-grid and different from
  SelectField's `mt: 0.5` (`SelectField.tsx:157`).

### 2.5 The type scale is fake

`Text.tsx:14` advertises 8 sizes; `ThemeNodetool.tsx:39-46` collapses them to
4 real values: `giant` = `bigger` = `big` = **18px**; `normal` = 15px;
`small` = 13px; `smaller` = `tiny` = `tinyer` = **11px**.
`<Text size="tiny">` and `<Text size="smaller">` are indistinguishable.

Usage counts across `web/src` (for migration sizing): small 277, normal 71,
big 42, smaller 39, tiny 36, bigger 17, tinyer 4, giant 2 — 488 total. The
aliased names (`bigger`, `tiny`, `tinyer`, `giant`) cover 59 call sites.
Nothing consumes the legacy CSS vars (`--fontSizeTiny` etc.) directly.

### 2.6 Zero-opinion passthroughs masquerading as primitives

- `Box.tsx` — 2-line re-export. (Acceptable as an import-policy shim, but
  should say so.)
- `muiReexports.ts:107-130` re-exports `Accordion`/`AccordionSummary`/
  `AccordionDetails`, `Tabs`/`Tab`, `ToggleButton`/`ToggleButtonGroup`,
  `Modal`, `Fade`, `Toolbar`, `LinearProgress` under a header comment
  (`:8-10`) claiming "the MUI theme overrides in ThemeNodetool already style
  them". ⚠ The theme's actual override set is larger than the original draft
  claimed — `MuiCssBaseline`, `MuiTypography`, `MuiButton`, `MuiFormLabel`,
  `MuiFormControl`, `MuiPopover`, `MuiModal`, `MuiToolbar`, `MuiDialogTitle`,
  `MuiTooltip`, `MuiDivider` in `ThemeNodetool.tsx`, plus `MuiOutlinedInput`,
  `MuiSelect`, `MuiPaper`, `MuiMenu`, `MuiMenuItem`, `MuiSwitch` from
  `editorControls.ts` — but the core claim holds: **there is no `MuiTabs`,
  `MuiToggleButton`, `MuiAccordion`, or `MuiLinearProgress` override
  anywhere in `themes/`.** Those four render stock MUI.
- Contrast: `MuiTooltip` (`ThemeNodetool.tsx:301-319`) gets backdrop blur, a
  divider border, and a layered shadow — more surface craft than any panel,
  card, or input receives.

Inputs have no default field background: only editor-scoped controls get
`Paper.overlay`, gated on the `nt-editor-control` marker class
(`editorControls.ts:19-23`, class defined in
`constants/editorUiClasses.ts:10`). `SearchInput.tsx:49` gives itself
`action.hover` — so search boxes read as fields and plain text inputs don't.
`Paper.overlay` exists in both schemes (`#17181B` dark, `#F0EDE6` light), so
a default field background is safe in both.

## 3. Tech design

### 3.1 Control tokens (`CONTROL`)

Add to `ui_primitives/tokens.ts`:

```ts
/**
 * Control-chrome tokens: the five control heights, the two horizontal
 * paddings, and the single field radius. Every interactive control in
 * ui_primitives/ and editor_ui/ derives its box from these.
 */
export const CONTROL = {
  /** px, all on the 4px grid */
  height: {
    xs: 24, // toolbar-density buttons (EditorButton compact)
    sm: 28, // node-canvas controls, EditorButton normal
    md: 32, // inspector controls
    lg: 36, // default form controls (TextInput, SelectField, SearchInput)
    xl: 44, // touch targets (MobileBottomSheet actions, TagInput)
  },
  paddingX: { compact: 8, normal: 12 }, // px, on-grid
  radius: BORDER_RADIUS.md, // 6px — matches editor controlRadius + buttonLarge
} as const;
```

Rationale for five steps rather than the three the draft proposed
(28/36/44): the editor's two densities (28 node, 32 inspector) are real,
shipped, and correct for a dense canvas — collapsing them into a 3-step scale
would either restyle the whole editor or leave `theme.editor` as a second
unreconciled scale, which is the defect we're fixing. Five named steps, one
source.

Radius: `BORDER_RADIUS.md` (6px) — the value the editor controls and
`MuiButton` already use, so the flip is churn-free for the editor and only
moves `SearchInput` (8→6). (Alternative considered: `sm`/4px, rejected —
it would restyle every editor control and button for no gain.)

Wiring:

- `theme.editor.heightNode` / `heightInspector` / `controlRadius`
  (`ThemeNodetool.tsx:69-79`) become derived: `` `${CONTROL.height.sm}px` ``,
  `` `${CONTROL.height.md}px` ``, `CONTROL.radius`. `ThemeNodetool.tsx` may
  import from `ui_primitives/tokens.ts` (tokens has no theme dependency
  beyond types — no cycle). `theme.d.ts` needs no change; the shape of
  `theme.editor` is unchanged.
- `EditorButton`: `density === "compact" ? CONTROL.height.xs :
  CONTROL.height.sm`; the `size` prop maps `small → sm`, `medium → md`
  instead of discarding the height (`EditorButton.tsx:65` bug).
- `TextInput` / `SelectField`: `compact`/`small` → `CONTROL.height.sm`,
  default → `CONTROL.height.lg`, applied as `minHeight` on the input root
  (leave `multiline` free to grow, as the storyboard CSS does at
  `StoryboardBoard.tsx:135`).
- `SearchInput`: radius → `CONTROL.radius`; height → `lg` (or `sm` when its
  compact variant is set).
- `TagInput`: `48px` → `CONTROL.height.xl` (44) as `minHeight` (chips can
  wrap taller).
- Off-grid fixes in the same pass: `Slider` 13px→12px, `NodeSlider` 3px→4px,
  `Panel` `comfortable: 2.5`→`3` (= `SPACING.lg`) and replace the
  `paddingValue / 2` computed bottom padding with `snapSpacing`, plus the
  2.1 ⚠-table sweep (TabGroup 42→40, Chip 22→24 or `pill` height token,
  radius literals → `BORDER_RADIUS.*`, font literals → `FONT_SIZE_SANS.*`).

### 3.2 One label treatment

Standardize on **label above the control**: `fontSizeSmall` (13px), weight
500, `text.secondary`, no text-transform, 4px gap to the control. This is
what `Label.tsx` already implements and what the storyboard `Field` wrapper
hand-rolls.

- `Label` becomes the single renderer. Add `htmlFor` support (already has
  the asterisk); change its baked `marginBottom` from 2px to 4px
  (`theme.spacing(1)`) — the one component allowed to own that gap.
- `TextInput`: stop forwarding `label` to MUI. Render
  `<Label htmlFor={id}>` above the field; generate `id` via `React.useId()`
  when the caller passes none, so `label`/input association survives. Delete
  the floating-label correction sx (`TextInput.tsx:88-101`). Add `hideLabel`
  for parity with SelectField (renders the label visually hidden but keeps
  `aria-label`).
- `SelectField`: drop the `InputLabel` path (`SelectField.tsx:123-129`);
  render the shared `Label` above. `hideLabel` keeps its contract.
- `FormField`: use `Label`; delete its own Typography block and asterisk
  duplicate (`FormField.tsx:85-108`).
- Theme: remove `textTransform: "capitalize"` and the 8px padding from
  `MuiFormLabel` (`ThemeNodetool.tsx:249-262`) — labels are no longer
  MUI-managed; keep the 13px/500 rules for any residual MUI-internal labels.
- Outlined inputs no longer need the label notch; MUI renders no legend when
  no label is passed, so nothing to patch.
- This kills the clipped-label bug class. The `overflow: visible` workaround
  in `StoryboardBoard.tsx:96-98` and its `.field-label` CSS go in Fix 4's
  migration.

Call-site impact: ~56 TextInput `label=` sites (17 files) and 29 SelectField
`label=` sites keep their code unchanged — the prop's meaning changes from
"floating label" to "label above", which is the point. Visual diff at every
one of those sites is expected and desired.

### 3.3 Coherent defaults

- `SelectField`: default `variant="outlined"`. Remove the 12 redundant
  explicit `variant="standard"` props in the same PR (they only restated the
  default; keeping them would fork the look). The `standard` variant stays
  supported but undocumented-discouraged; if post-flip audit finds no
  legitimate use, delete it in a follow-up.
- Inputs get a default field background: `Paper.overlay` on the input root
  (both TextInput and SelectField, outlined variant), matching the editor
  controls' treatment. Change `SearchInput` from `action.hover` to
  `Paper.overlay` so all fields read identically.
- `Panel`: default `background="paper"` **and** `bordered=true`; radius
  source moves to `theme.rounded` (aligning with `Surface` — one radius
  source for surfaces). **Risk**: 42 call sites, none pass `background`.
  Docked workspace panels (`PanelLeft`, `PanelBottom`, `WorkspaceShell`,
  `PanelToolbar`) plausibly want the flush look — audit all 42 during the
  flip and pin `background="default" bordered={false}` (or introduce
  `variant="docked"`) where flush is intentional. Everything else inherits
  the visible default.
- `FlexRow`/`FlexColumn`/`Stack`: keep `gap=0` (37% of ~1010 usages rely on
  it). Form spacing is owned by the Fix 4 primitives.
- `EditorButton` `size` fix lands with Fix 1 (same file).

### 3.4 Form composition primitives

- **`FormField` rework**: owns the label (via `Label`), the 4px label gap,
  and a helper/error line with a fixed on-grid margin (`theme.spacing(1)`),
  overriding MUI's `3px 14px 0` helper margin. Provides a
  `FormFieldContext { controlId, labelless: true }`; `TextInput` and
  `SelectField` consume it and suppress their own labels + adopt the id —
  no double labels by construction, no convention to remember.
- **`FormSection`**: optional group label (uppercase, `smaller`/11px,
  `letterSpacing: "0.08em"`, `text.disabled` — the storyboard `.group-label`
  treatment, `StoryboardBoard.tsx:112-116`) above a `FlexColumn gap={3}`
  body.
- **`FormGrid`**: n-column CSS grid (`gridTemplateColumns` from a `columns`
  prop, default `minmax(0, 1fr) 260px` two-column like `.header-grid`),
  `gap` from `SPACING`, stacking to one column below a `stackBelow`
  breakpoint prop.
- Proof migrations: `StoryboardBoard.tsx` (delete local `Field`, the
  `.header-grid`/`.group-label`/`.field-label`/36px CSS, and the
  `overflow: visible` workaround), `CollectionForm.tsx` (the one existing
  FormField consumer), and `WorkflowForm.tsx`.

### 3.5 Honest type scale

Five real sizes, five names:

| name | px | change |
|---|---|---|
| giant | **22** | gets a real value (was 18; 2 call sites, both want display size) |
| big | 18 | unchanged |
| normal | 15 | unchanged |
| small | 13 | unchanged |
| smaller | 11 | unchanged |

Codemod the aliases with ast-grep (see §4 tooling note; pattern
`<Text size="tiny" $$$REST>$$$C</Text>` verified to match): `bigger`→`big`
(17 sites), `tiny`→`smaller` (36), `tinyer`→`smaller` (4) — mechanical, zero
visual change since the values were already identical. Then narrow `TextProps["size"]` to the five names and
delete `fontSizeGiant`/`fontSizeBigger`/`fontSizeTiny`/`fontSizeTinyer` from
the theme after adding `fontSizeGiant: "22px"` — grep confirmed nothing
consumes the legacy CSS vars directly. `Text.tsx`'s size map shrinks to
five entries. Review the 2 `giant` call sites for the 18→22 bump.

### 3.6 Passthrough honesty

For each re-export in `muiReexports.ts:107-130` that the theme does not
style, add the missing override with tokens (preferred over relabeling —
the primitives-first policy funnels all usage through these re-exports, so a
theme override fixes every consumer at once):

- `MuiTabs`/`MuiTab`: `minHeight: CONTROL.height.lg`, label 13px/500, 2px
  indicator (match `TabGroup`'s look so the two tab systems agree).
- `MuiToggleButton`: `CONTROL` height/radius/padding.
- `MuiAccordion`: `Paper.paper` background, divider border, radius
  `theme.rounded.md`, no default elevation shadow.
- `MuiLinearProgress`: 4px track, `BORDER_RADIUS.pill`, primary bar (match
  `ProgressBar`).

Rewrite the `muiReexports.ts` header comment to state which exports are
themed and which are deliberate raw escape hatches (`MuiAutocomplete`,
`MuiDialog` at `:132-141` already are). Document `Box.tsx` as an
import-policy shim.

## 4. Implementation plan

**Codemod tooling**: the mechanical rewrites in PRs 3 and 5 (and future
large migrations — this repo refactors heavily) use **ast-grep**, driven by
the official agent skill vendored at `.claude/skills/ast-grep/` (plus
`ast-grep-outline` for structural surveys). Run it via
`npx --yes --package @ast-grep/cli ast-grep <args>` — it is not a repo
dependency. For multi-step, test-gated migrations beyond single-pattern
rewrites (e.g. the raw-MUI → primitives sweep STRATEGY.md tracks), evaluate
the Codemod CLI + MCP stack (`npx codemod ai`), which layers AST inspection
and codemod tests on top of ast-grep.

Six PRs, in order. 1–3 change no call-site code (PR 3 removes 12 redundant
props); every existing screen improves without migration. Each PR:
`cd web && npm run typecheck && npm run lint && npm test`, plus
`npm run lint:design`, plus the visual-suite step below.

### PR 1 — control tokens (mechanical)

1. Add `CONTROL` to `tokens.ts`; export from the barrel; unit test alongside
   `tokens.test.ts` (all heights on 4px grid, radius is a `--rounded-*` var).
2. Wire: `EditorButton` (incl. the `size`-discards-height fix),
   `theme.editor` derivation in `ThemeNodetool.tsx`, `TextInput`,
   `SelectField`, `SearchInput`, `TagInput`.
3. Off-grid sweep: `Slider`, `NodeSlider`, `Panel` padding, plus the ⚠ table
   in 2.1 (TabGroup, Chip, UndoRedoButtons, MenuItemPrimitive,
   MobileBottomSheet, WarningBanner, Breadcrumbs, ZoomControls, InfoTooltip,
   NotificationBadge).
4. Add a `DesignTokens.Control` Storybook story (heights/paddings/radius
   swatches) next to the existing `DesignTokens.*` stories.

Acceptance: an EditorButton (normal), a compact TextInput, a compact
SelectField, and a node-canvas select in one FlexRow share one height (28px),
one radius, one horizontal padding; grep gates (§5) pass.

### PR 2 — one label treatment

1. `Label`: add `htmlFor`; margin 2px→4px.
2. `TextInput`: label-above via `Label` + `useId`; delete floating-label sx;
   add `hideLabel`.
3. `SelectField`: drop `InputLabel`; label-above via `Label`.
4. `FormField`: render via `Label`; delete duplicate asterisk logic.
5. Theme: trim `MuiFormLabel` override.
6. Tests: update `TextInput.test.tsx` (label association via
   `getByLabelText` must still pass — it proves the `htmlFor` wiring); add
   the missing `SelectField.test.tsx` (render, a11y, ref, label
   association, `hideLabel`).

Acceptance: TextInput, SelectField, and a `Field`-wrapped model select render
pixel-identical labels; no label renders outside the control's box (Panel
`overflow: hidden` no longer clips anything).

### PR 3 — coherent defaults

1. `SelectField` default `variant="outlined"`; delete the 12 redundant
   `variant="standard"` props (`SettingsMenu.tsx` ×7, `LayerRow`,
   `GetVariableBody`, `PropertiesPanel`, `WorkersPanel`,
   `SearchProviderSetupDialog`).
2. Default field background `Paper.overlay` for TextInput/SelectField;
   switch `SearchInput` from `action.hover`; verify both schemes (dark
   `#17181B`, light `#F0EDE6`).
3. `Panel` defaults `background="paper"`, `bordered=true`; radius from
   `theme.rounded`; audit all 42 call sites and pin the docked panels
   (`PanelLeft`, `PanelBottom`, `PanelToolbar`, `WorkspaceShell`, timeline/
   sketch inspectors as judged) to the flush look explicitly.
4. Update `Panel.test.tsx` defaults; visual-QA the 17 SelectField sites that
   relied on `standard`.

Acceptance: the bare no-props composition from §1 renders as a visible
bordered panel containing two identically-styled fields.

### PR 4 — form composition primitives

1. Rework `FormField` (context-based label suppression); add `FormSection`,
   `FormGrid`; barrel exports; tests per the STRATEGY.md new-primitive
   checklist (render + axe + ref for each); Storybook stories.
2. Migrate `StoryboardBoard.tsx` header — delete local `Field`, the
   `.header-grid`/`.group-label`/`.field-label`/`minHeight: 36px` CSS, and
   the `overflow: visible` workaround.
3. Migrate `CollectionForm.tsx` and `WorkflowForm.tsx` as proofs.

Acceptance: storyboard header is visually unchanged (within visual-suite
tolerance) but contains zero local form CSS.

### PR 5 — honest type scale

1. Theme: `fontSizeGiant: "22px"`; delete `fontSizeBigger`/`fontSizeTiny`/
   `fontSizeTinyer` keys (and their CSS-var emission).
2. Codemod `size="bigger|tiny|tinyer"` → canonical (59 sites incl. `giant`
   review); narrow `TextProps["size"]`; update `Text.test.tsx`.
3. Review the 2 `giant` sites at 22px.

### PR 6 — passthrough honesty

1. Theme overrides for `MuiTabs`/`MuiTab`, `MuiToggleButton`,
   `MuiAccordion`, `MuiLinearProgress` per §3.6.
2. Rewrite the `muiReexports.ts` header comment; document `Box.tsx` as a
   shim.

## 5. Verification

- Per PR: `cd web && npm run typecheck && npm run lint && npm test` and
  `npm run lint:design`.
- **Visual regression**: `npm run test:visual` (Playwright,
  `web/tests/visual/`, committed baselines, 1% diff tolerance). PRs 1–3 and
  5–6 intentionally change rendering — regenerate baselines with
  `--update-snapshots`, review the image diffs in the PR, and say so in the
  PR body. `design-system.spec.ts` covers the primitives gallery and is the
  primary gate; `settings.spec.ts` catches the SelectField flip.
- Manual before/after screenshots per PR: storyboard header (`/workspace`
  storyboard tab), node inspector, `SettingsMenu`, `CollectionForm` — in
  both color schemes.
- Grep gates after PR 1 (run in `web/src/components/ui_primitives/` and
  `editor_ui/`, excluding `__tests__/` and `*.md`):
  - no `minHeight: "2[248]px"` / `height: "2[24]px"` control literals
  - no `border-?[rR]adius: "?[468](px)?"` literals (use `BORDER_RADIUS`/`CONTROL.radius`)
  - no `13px`/`3px`/`5px`/`42px`/`45px` box values (exception: the 7px/3px
    vertical paddings inside TextInput/SelectField/SearchInput — they are
    derived from the CONTROL heights to make MUI's content box land exactly
    on 36/28px, not layout spacing)
  - no `font-size: 1[04]px` literals
- After PR 2: `grep -rn "MuiInputLabel" web/src/components/ui_primitives/`
  returns nothing.
- After PR 4: `grep -n "header-grid\|group-label\|field-label" web/src/components/storyboard/StoryboardBoard.tsx` returns nothing.

## 6. Risks and open decisions

- **Panel default flip is the widest blast radius** (42 sites, docked
  workspace chrome included). Mitigation: the PR-3 audit step; if the audit
  finds mostly-flush usage, invert the decision — keep `background="default"`
  and only default `bordered=true` — and record it here.
- **Label-above changes every labelled field's geometry** (~85 sites gain
  ~17px of height). Dialogs and dense inspectors may need spot re-layout;
  the visual suite will surface them.
- **`standard`-variant removal** is deferred until post-flip audit; the
  variant remains functional in PR 3.
- **TagInput at 44px vs 36px**: chosen 44 (`xl`) to keep the touch-friendly
  chip row; revisit if it reads oversized next to 36px fields in forms.
- **`giant` at 22px** restyles 2 call sites; trivially reviewable.
- Line numbers in §2 are pinned to `2cf277b`; PRs land sequentially and
  each shifts the next PR's targets — re-grep, don't trust stale lines.
