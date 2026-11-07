# Native UI primitives implementation plan

Create `NodeTool.UiPrimitives`, a reusable Qt Quick module owned entirely by
the native application. Feature authors should be able to build a toolbar,
property section, settings dialog, and chat action row by supplying content,
state, actions, and outer layout. The module supplies typography, internal
spacing, colors, borders, focus, disabled states, and feedback.

This plan covers the complete migration. Completing the foundation or one
vertical slice does not complete the work. The source review used commit
`21e295e5ae` on `feat/native-ui-primitives`. The observations below describe
source inspection, not measured rendering or platform accessibility results.

Engineering follows [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md).
Product intent comes from [Product](../../PRODUCT.md),
[Design System](../../docs/DESIGN.md), and
[UX Guidelines](../../docs/UX_GUIDELINES.md). Those documents are references
for human decisions, never inputs to a native configuration generator.

## Decisions and ownership

| Decision | Required outcome |
| --- | --- |
| D1. Independent native ownership | All configuration, fonts, icons, rendering, tests, and build tooling live under `native/`. No web token imports, neutral JSON package, web-to-QML generation, React icon package, shared runtime theme state, npm dependency, or web build dependency. Matching design values are separately authored. Leave `web/` unchanged. |
| D2. One native module | URI `NodeTool.UiPrimitives`, backing target `nodetool_ui_primitives`, consumer import `import NodeTool.UiPrimitives as Ui`. Private implementation uses `QtQuick.Controls.Basic`. Do not create a full Controls Templates style in this migration. |
| D3. Preserve existing behavior | Retain the inspector's useful row, section, card, draft, preview, commit, stepping, and undo behavior. Extract through tested adapters. Do not replace functioning semantics with a generic control that merely looks similar. |
| D4. Keep feature ownership | Timeline geometry and media-type appearance remain in timeline-owned `TimelineMetrics.qml` and `TimelineVisuals.qml`. Chat column widths and responsive breakpoints remain in chat-owned `ChatMetrics.qml`. Model-picker layout remains in `ModelPickerMetrics.qml`. Models, networking, authentication, document edits, playback, and persistence stay outside primitives. |
| D5. Keep native layout tools | Use `Item`, `Row`, `Column`, `GridLayout`, `RowLayout`, and `ColumnLayout` directly for feature layout. Add no pass-through layout wrappers. Add a public presentation module only when it removes repeated decisions or behavior from real callers. |
| D6. Explicit shell settings | Persist System/Dark/Light, text scale, UI scale, and motion preference in the native shell. Primitives consume resolved inputs and expose effective presentation. They do not read application settings or own OS subscriptions. |
| D7. Complete verification | Native checks run directly through CMake, CTest, and Python. Root repository checks are an additional obligation, not a dependency of the module. Report platform checks separately from local offscreen evidence. |

Creators use this editor for sustained work in both dim studios and bright
desktop environments. Support dark and light schemes with restrained chrome,
compact hierarchy, and an accent reserved for actions, focus, and selection.

## Reviewed gaps

| Finding | Evidence and consequence |
| --- | --- |
| F1. Three independent palettes | `timeline/qml/Theme.qml`, `chat/qml/ChatTheme.qml`, and `model-picker/qml/ModelPickerTheme.qml` each own chrome colors. Timeline/chat divider alpha is 0.08/0.12 and selection alpha is 0.05/0.08. Resolve roles deliberately. A global search-and-replace cannot determine the intended surface. |
| F2. Resources cross ownership seams | Chat CMake embeds fonts from `../timeline/fonts`. Model-picker CMake reads `../../web/src/icons/providers`, rewrites `currentColor` to a fixed dark-theme color, and embeds the generated SVGs. Remove both dependencies. Provider logos also require a provenance and redistribution audit. |
| F3. Module registration assumptions | Timeline's `QmlDiscovery.cmake` scans timeline QML only. `SharedQmlBuild.cmake` counts every generated registration and expects exactly one registration and one Theme cache object. It must check one compilation per intended module, not reject additional legitimate modules. Isolated test modules also need explicit primitive imports. |
| F4. Buttons have inconsistent semantics | `TransportButton.qml` and `Tracks/ToolButton.qml` are Rectangles with pointer handlers. Transport uses `enabledState`. Chat uses a Controls Button with a glyph-string Canvas dispatcher. Audit actual callers before mapping selected actions, toggles, and menu openers. |
| F5. Tooltips can be clipped | Tracks ToolButton paints a timed child Rectangle. DockTabStrip clips its children and uses that button for panel options. Move tooltip presentation to the window overlay and test all edges. |
| F6. Existing field transactions need characterization | InspectorPillInput distinguishes external value, draft, typing, keyboard stepping, and scrubbing. Its pointer cancellation calls `finishGesture()`, which commits. Escape during stepping calls `endStep()`, which also commits. Typing Escape restores the external value. Preserve these differences in an explicit temporary adapter until the host has a tested rollback operation. |
| F7. Inspector selection and slider styling is partial | InspectorSelect customizes the closed control but inherits its popup and delegate. CompactSlider sets `Qt.NoFocus`. InspectorSliderRow has its own origin marker, reset action, preview, and commit paths. Migrate all parts and exercise real keyboard and pointer input. |
| F8. Generic layout borrows timeline geometry | PreferencesDialog sizes itself with `trackHeaderWidth`. DockTabStrip uses `rulerHeight`. Preferences headings combine 15 px and 600 instead of a sanctioned role. Extract generic metrics without changing actual track geometry. |
| F9. Icons assume one raster scale | Timeline Icon builds SVG data URLs at fixed 2x. Chat draws glyphs in Canvas. Model-picker owns another icon renderer. A native catalog must handle current device pixel ratio, alpha, theme updates, missing icons, and specialist glyphs. |
| F10. Mixer presentation includes runtime work | MixerMeter polls `AutomationMeters` every 33 ms and owns hold/clip history. MixerFader imports the dB taper. Extract presentation only and keep one feature-owned poller and conversion path. |
| F11. New surfaces extend the migration | Scripts and Storyboards are separate dock panels. TimelineAgentPanel embeds `NodeTool.Chat.ChatPanel`. Preserve those entry points, stable panel identity, drafts, and the existing host tool engine. Model picker is a third native consumer. |
| F12. Appearance settings are missing from the inspected shell interface | `src/app/Preferences/Preferences.h` exposes keyboard/cache/decoder/audio settings, but no theme, text scale, UI scale, or reduced-motion preference. Add explicit settings and tests, including the standalone chat shell. |

These findings are an initial map. A1 must enumerate callers, inline controls,
resource aliases, and test hosts before implementation. Do not describe this
table as an exhaustive audit of every native QML file.

The primary checkout also contains uncommitted `PanelField`, `PanelSelect`,
`PanelTextArea`, and `PanelScrollBar` polish. It was reviewed read-only for
intent: Basic controls, full select delegates/popup, selection, readOnly
presentation, and compact scrollbars. Those files are not baseline build
inputs. Preserve their useful intent through the new interfaces without
copying their local styles or changing the primary checkout.

## Module structure and build contract

Use a small public surface. Do not create one singleton for every design
concept merely to reproduce the proposed directory tree.

```text
native/ui_primitives/
  CMakeLists.txt
  README.md
  DESIGN.md
  ALIGNMENT.md
  PLAN.md
  qml/
    Theme.qml                 # resolved scheme, palette, scale, motion inputs
    Typography.qml            # eight complete roles
    Metrics.qml               # spacing, controls, borders, radii, icon sizes
    Icons.qml                 # stable native icon identities
    text/
    controls/
    overlays/
    feedback/
    inspector/
    private/                  # palettes, fonts, state recipes, implementation
  resources/
    fonts/
    icons/
    licenses/
  gallery/
  tests/
    qml/
    fixtures/
    visual/
  tools/
    check_design.py
    check_dependencies.py
    check_isolated_build.py
    capture_gallery.py
    migration.toml
```

`DESIGN.md` is a standalone native specification. `ALIGNMENT.md` records the
intended product relationship, deliberate native differences, and reasons.
Neither file promises machine equality with React. Private palettes, font
loaders, motion, and gradient recipes may be split for maintainability without
becoming separate public configuration interfaces.

Use C++20 and public Qt APIs. The module needs Qt Core, Gui, Qml, Quick,
QuickControls2, and an explicit SVG facility if the chosen renderer needs it.
Test and QuickTest are test-only dependencies. The standalone configuration
must not discover FFmpeg, GuiPrivate, timeline, chat, model-picker, network,
backend, or npm. A presentation module cannot import `NodeTool.Timeline`,
`NodeTool.Chat`, or `NodeTool.ModelPicker`.

Use `qt_add_library(... STATIC)` with `qt_add_qml_module`, a generated static
plugin, explicit `CLASS_NAME NodeToolUiPrimitivesPlugin`, and resource prefix
`/qt/qml`. Consumers link the backing and plugin targets. Each final QML host
imports the static plugin through a small CMake helper that adds one
`Q_IMPORT_QML_PLUGIN(NodeToolUiPrimitivesPlugin)` translation unit per host.
The helper must be idempotent. Apply it to the gallery, isolated import test,
chat app/tests, timeline app/tests, model-picker visual test, and isolated
provider dialog test. Do not add manual type registration beside generated
registration or whole-archive the new module as a second strategy.

Set resource aliases and `QT_QML_SINGLETON_TYPE` before adding the module.
Keep the existing timeline `NO_PLUGIN` strategy outside this extraction.
Update its host helper only to link/import the new module. Explicit sibling
`add_subdirectory` guards prevent duplicate module targets when timeline
includes chat and model-picker. Qt's generated qmldir, qmltypes, cache sources,
and registration metadata are normal native build outputs.
[Qt documents the backing/plugin arrangement](https://doc.qt.io/qt-6/qt-add-qml-module.html)
and the [singleton property ordering](https://doc.qt.io/qt-6/qml-singleton.html).

The build smoke test must run a copied install/build outside the checkout
without source import paths. A source-tree import succeeding does not prove
the static plugin and resources were packaged correctly.

## Native configuration

### Typography, density, and scale

Author these exact native roles independently:

| Role | Family | Logical px | Weight | Proportional line height |
| --- | --- | --- | --- | --- |
| SansTitle | Inter | 18 | 600 | 1.30 |
| SansBody | Inter | 15 | 400 | 1.45 |
| SansLabel | Inter | 13 | 500 | 1.35 |
| SansCaption | Inter | 11 | 400 | 1.40 |
| MonoCode | JetBrains Mono | 13 | 400 | 1.50 |
| MonoStrong | JetBrains Mono | 13 | 600 | 1.50 |
| MonoLabel | JetBrains Mono | 13 | 500 | 1.35 |
| MonoCaption | JetBrains Mono | 11 | 400 | 1.40 |

`Ui.Text` chooses a typed role and semantic tone. Convenience names such as
`Ui.Label`, `Ui.Caption`, and `Ui.Code` are allowed only if useful to actual
callers. Do not expose independent family, size, weight, or line-height
decisions at feature call sites. Native multiline editor and selectable rich
text renderers receive a complete role from the same definition.

Own all six font weights and their licenses under `resources/`. Verify font
registration status, actual family, requested weight, and rendered metrics.
Test fallback explicitly, but reject fallback-rendered reference screenshots.
Audit Latin extension, Cyrillic, Greek, CJK, RTL, combining marks, and emoji
coverage. Document fallback families and shaping limitations rather than
assuming the existing Latin-only files cover translated content.

Spacing is `none=0`, `micro=2`, `xs=4`, `sm=6`, `md=8`, `lg=12`, `xl=16`,
`xxl=24`, `xxxl=32`. Control minima are 24, 28, 32, 36, and 44 logical px.
Name densities by intent. Compact inspector controls keep their 28 px minimum.
Standard fields use 32 px. Do not enlarge every compact control mechanically.
Control implicit height is the greater of its density minimum and measured
text plus internal padding. Fixed-height feature parents must accommodate it.

`uiScale` scales authored chrome metrics and base type size. `textScale`
additionally scales typography. Document the formula once and reject invalid
settings at the shell seam. Device pixel ratio is separate and never multiplies
the whole QML layout. Qt already uses device-independent coordinates.
[Qt high-DPI guidance](https://doc.qt.io/qt-6.12/highdpi.html) distinguishes those
coordinates from raster image buffers. Test UI and text scale independently.

### Palette and recipes

Both schemes must define the same complete semantic roles:

| Group | Roles |
| --- | --- |
| Surface | canvas, panel, overlay, input |
| Text | primary, secondary, disabled, onAccent |
| Action | hover, pressed, selected, disabled |
| Border | subtle, control, strong, focus, error |
| Accent | primary, hover |
| Status | success, warning, error, info |
| Scrim | media, modal |

Choose actual colors in A2 using measured contrast on their composited
backgrounds. Do not preserve a low-contrast accent merely because it is in
the old dark palette. Targets are 4.5:1 for normal text and 3:1 for necessary
non-text affordances. Disabled text is still reviewed for usability. Store
testable foreground/background pairings and opacity recipes. Static source
review alone cannot establish accessibility conformance.

Use `Qt.rgba` for alpha colors. QML's eight-digit hex order is AARRGGBB,
which differs from CSS's common RRGGBBAA notation.
[Qt color documentation](https://doc.qt.io/qt-6/qml-color.html) defines the
supported forms. Media readability scrims remain dark in both schemes.
Document-authored colors remain document data and do not change with chrome.

Borders are 1 logical px and focus outlines 2 logical px. Draw focus without
changing control geometry. Field/control radius is 6 logical px. Name other
needed roles, including overlay, card, pill, and circle, in Metrics. Keep
persistent editor chrome flat. Elevation belongs to transient overlays.

Flat is the default fill. Named recipes are None, RunningIndicator, and
MediaReadabilityScrim. Reserve MeterScale for an actual future use rather
than implementing it now. RunningIndicator uses native rendering of the
intended rotating perimeter/conic treatment. A vertical gradient is not an
equivalent implementation. Hidden, inactive, and reduced-motion indicators
stop animation. Reduced motion retains a static indicator and state text.
Document content gradients remain unrestricted.

Theme changes update open menus, tooltips, icons, and any Canvas paint cache.
They must not reconstruct documents, clear selection, lose drafts, or recolor
user content. Inherit one effective presentation configuration across each
native engine, including the embedded chat and model picker.

### Theme input interface

`Ui.Theme` accepts `preference` (System/Dark/Light), `systemScheme`,
`uiScale`, `textScale`, and resolved `reducedMotion`. It exposes readonly
`effectiveScheme` and palette roles. The default System fallback is documented
and deterministic when the platform reports an unknown scheme. One shell
binding per engine supplies inputs before visible content is created.

Timeline Preferences and a small standalone-chat appearance adapter own
QSettings and OS signal subscriptions. Use public Qt style-hint APIs where
available. Audit reduced-motion availability on each supported OS. Where Qt
does not expose it, use a narrowly scoped shell platform adapter and retain
an explicit user preference. No platform adapter belongs in primitives.
Embedded chat must consume its host settings rather than create a competing
settings writer. Tests inject scheme and motion changes without global OS
changes or writes to a person's preferences.

## Minimal presentation interfaces

| Module | Caller supplies | Module owns |
| --- | --- | --- |
| Text | text, role, tone, wrapping/elision, selection intent | font and line metrics, semantic color |
| Icon | catalog identity, named size, semantic tone | resource lookup, monochrome tint/alpha, DPR handling, decorative accessibility |
| EditorButton / ToolbarIconButton | text or accessible name, icon identity, Action, density, variant, loading, disabled reason | native enabled/checked/checkable behavior, keyboard activation, visual states, focus, tooltip, internal layout |
| MenuButton | menu content and accessible name | open/close, expanded state, focus return. Expanded is not a toggle's checked state |
| TextField / NumberField | controlled value, label, placeholder/unit, readOnly, enabled, validity/error text, numeric bounds/step where applicable | editable draft, user transaction lifecycle, selection, focus, input presentation |
| TextArea / ScrollBar | controlled text and editing intent, or native scroll position/size/orientation | multiline selection/wrapping/role and field state, or hover/drag/disabled scroll presentation |
| Select | options with label/value, controlled selection, accessible label | closed field, popup, delegate, selection/focus, keyboard search/navigation, disabled options |
| Slider / Toggle | controlled value or checked state, range/step, accessible name, enabled | native input semantics, focus and state rendering, user-only changes |
| InspectorRow / Section / Card | labels, body, leading/trailing/header-action slots, expansion state | internal alignment, indentation, divider, label and value roles, compact density |
| Dialog / Popover / ContextMenu / MenuItem | content, title/actions, anchor, modal intent | overlay parent, bounds, focus entry/return, Escape, keyboard traversal, scrim and surface |
| Tooltip / ShortcutHint | description, shortcut display, trigger and disabled reason | overlay positioning, pointer/focus triggers, timing, dismissal, readable typography |
| Status / Banner / EmptyState / Progress | semantic status, message, optional action/progress | icon/text state combination, reduced motion, role-appropriate feedback |
| Fader | normalized position, tick positions/labels, accessible value text, step intent | cap/rail rendering and pointer/keyboard editing transaction |
| LevelMeter | normalized levels and held values, clip flags, accessible labels | passive rendering and reset request. No polling, dB conversion, hold decay, or automation |

Freeze these names before parallel consumer work:

```text
Theme.preference: System | Dark | Light
Theme.systemScheme: Dark | Light | Unknown
Theme.uiScale, Theme.textScale: positive real
Theme.reducedMotion: bool
Theme.effectiveScheme: readonly Dark | Light
Theme.surfaceCanvas / surfacePanel / surfaceOverlay / surfaceInput: readonly color
Theme.textPrimary / textSecondary / textDisabled / textOnAccent: readonly color
Theme.actionHover / actionPressed / actionSelected / actionDisabled: readonly color
Theme.borderSubtle / borderControl / borderStrong / borderFocus / borderError: readonly color
Theme.accentPrimary / accentHover: readonly color
Theme.statusSuccess / statusWarning / statusError / statusInfo: readonly color
Theme.scrimMedia / scrimModal: readonly color

Text.text, Text.role, Text.tone, Text.wrapMode, Text.elide
Icon.name, Icon.size, Icon.tone
EditorButton / ToolbarIconButton:
  inherited text, action, enabled, checkable, checked, clicked
  iconName, accessibleName, density, variant, active, loading,
  disabledReason, shortcutText, description
TextField / TextArea:
  value: string, accessibleName, placeholderText, readOnly, enabled,
  valid, errorText, density
NumberField:
  value: real, accessibleName, unit, from, to, stepSize, readOnly,
  enabled, valid, errorText, density
Select:
  value, options [{label, value, enabled?}], accessibleName, enabled, density
Slider:
  value, from, to, stepSize, origin?, resetValue?, accessibleName, enabled, density
```

Role, tone, density, and variant are enumerated choices with tests rejecting
unknown values. Use QML enums or C++20 enum classes registered with Qt.
Metrics exposes named spacing/control/icon/radius values. Default text role
is SansBody, default field/button role is SansLabel, and default field density
is Standard. Inspector adapters select Compact explicitly. `Ui.Icon.size`
accepts named Metrics values. A documented semantic color override may be
used by domain visuals, but cannot become an escape hatch for chrome literals.
The foundation implementation records final enum spellings in README before
handing consumers to other owners.

The table is the initial common interface, not an excuse to omit an audited
control. Add CheckBox, RadioButton, tabs, list delegates, or another primitive
when the A1 manifest identifies a real presentation need. Native editing and
selection signals remain available only where their semantics are documented.

Keep complete slots rather than allowing callers to override `background`,
`contentItem`, delegates, or focus recipes. Private Basic controls remain
implementation details. This follows
[Qt's reusable control customization model](https://doc.qt.io/qt-6/qtquickcontrols-customize.html).
Do not rely on customizing the globally attached ToolTip. Own an explicit
tooltip instance inside the primitive so the Basic attached implementation
cannot bypass the native recipe.

Use native `Action`, `enabled`, `checked`, and `checkable` semantics. A public
`active` appearance is permitted for non-toggle selected tool state but cannot
substitute for checked semantics. Button shortcut text is display only when
the host already owns the shortcut. Never register a second accelerator.
Loading suppresses duplicate activation without losing focus or accessible
state. Disabled reasons remain discoverable through the field/row or its
overlay trigger. Decorative icons are ignored by accessibility. Icon buttons
always provide names.

Catalog identities replace path strings and chat glyph dispatch. Include
Material Outlined identities and audited native specialist glyphs. Provider
logos have explicit multicolor/monochrome behavior. Vendor licensed native
copies with provenance and modifications recorded locally, with no build-time
read of web assets. Named icon sizes are 14, 16, 18, and 20 logical px. Verify
1x, fractional, 2x, higher DPR, and cross-screen changes. Missing catalog names
produce a visible diagnostic in tests rather than a silent unrelated icon.

## Editing contract and compatibility

New editable primitives expose `editStarted()`, `valuePreviewed(value)`,
`valueCommitted(value)`, and `editCanceled()`. A transaction starts at the
first user edit, emits zero or more previews, and ends exactly once with a
commit or cancellation. Programmatic value changes emit none of these.
Focus alone does not start a transaction. An unchanged focus visit does not
create undo. The host owns validation rules, persistence, rollback, and undo.

| Trigger | New primitive behavior | Host responsibility |
| --- | --- | --- |
| Enter or valid focus loss | Commit the changed draft once | Validate business rules and accept/reject the proposed value |
| Escape | Cancel, discard draft, emit no commit | Roll back any previewed document edit |
| Pointer release or final non-repeat step-key release | Commit once if a transaction exists | Group previews into one undoable edit |
| Pointer cancellation or disable/readOnly during gesture | Cancel once | Restore the preview baseline |
| Invalid input | Preserve the invalid draft while editing, expose invalid state, never commit invalid data | Supply validation result/error message and decide allowed focus-loss behavior |
| External update while idle | Refresh displayed value | No transaction or undo |
| External update while editing | Preserve typed draft and update authoritative value. Escape reveals the latest authoritative value | Handle document selection/revision changes explicitly by ending the old edit before rebinding to a different subject |
| Step/modifier input | Respect bounds, step, Shift/Alt policy, repeat and key release | Preserve feature-specific unit conversion and documented modifier meaning |

Use typed values for NumberField and explicit formatting/parsing where needed.
Do not silently parse arbitrary partial text into a valid number, and do not
normalize invalid data merely on theme changes or focus movement. Reset and
double-click are explicit user actions with one transaction.

The existing inspector `gestureStarted`, `preview`, `commit`/`change`,
`disabled`, and `ariaLabel` interfaces remain in temporary feature adapters.
Characterize each before replacing its internals. Legacy cancellation that
commits must remain explicit in the adapter, with a regression test. Migrate a
host to true rollback only with a reproduction and an asserted undo outcome.
Do not change the old behavior incidentally while renaming signals. Remove
legacy policies with the adapters in A7 after every caller has the new
transaction contract.

## Delivery slices

Use Sol or Terra for implementation. Each slice has one owner for its files.
The integration owner alone edits shared CMake wiring and the migration
manifest. Parallel work starts only after the relevant interfaces are merged
into the working tree. Agents request interface changes rather than editing
each other's shared files. Re-run affected host tests after integration.

### A1. Inventory, native specification, and baseline

Owner paths: `native/ui_primitives/{README.md,DESIGN.md,ALIGNMENT.md}`,
`native/ui_primitives/tools/migration.toml`, and
`native/ui_primitives/tests/visual/`.

Documentation owner additionally owns `native/ui_primitives/AGENTS.md` and its
`CLAUDE.md` containing only `@AGENTS.md`, the root `AGENTS.md` navigation link,
and targeted updates to `native/chat/AGENTS.md`, `docs/DESIGN.md`, and
`docs/DEVELOPMENT_STANDARDS.md`. Add an explicit native scope/reference so
React/MUI-specific implementation instructions cannot be mistaken for Qt
requirements. Keep product intent shared and native implementation rules in
the native specification. Do not rewrite unrelated web guidance or change web
source. Check the instruction graph after these documentation edits.

Enumerate QML under `native/timeline/qml`, `native/timeline/src`,
`native/chat/qml`, and `native/model-picker/qml`. Record file, presentation
category, old primitives, signal/Action/shortcut contract, test host, intended
replacement, and justified domain exceptions. Include inline controls and
resource consumers. Record every executable that creates a QQmlEngine and
every isolated QML resource collection. An unclassified file is a gate failure.

Capture current toolbar, inspector, dock, preferences, mixer, chat, model
picker, Script, and Storyboard views through offscreen fixture hosts. Include
long labels and a narrow window. Record Qt version, rendering backend, font
families, DPR, window size, and text/UI scale with images. Existing views are
baseline evidence, not the new module gallery. A2 builds that independent
gallery. Do not use a running desktop session for automated GUI tests.

Exit: reviewed native specification, explicit compact 28/standard 32 decision,
call-site/test-host manifest, baseline artifacts, and a state/transaction
characterization table. Preserve all existing native features in the manifest.

### A2. Configuration, resources, and isolated build

Owner paths: `native/ui_primitives/CMakeLists.txt`, `qml/{Theme,Typography,Metrics,Icons}.qml`,
`qml/private/`, `resources/`, `gallery/`, `tests/`, and `tools/`.
Integration owner additionally owns `native/{timeline,chat,model-picker}/CMakeLists.txt`,
`native/timeline/src/app/QmlDiscovery.cmake`,
`native/timeline/cmake/tests/SharedQmlBuild.cmake`,
`native/timeline/src/providersettings/ProviderDialogTests.cmake`,
`native/chat/tests/CMakeLists.txt`, and affected `module.cmake` host registrations.

Build the independent module and gallery, complete both palettes, load fonts,
establish resource provenance, and implement the static registration helper.
Copy provider logos into native ownership and remove model-picker's web SVG
rewrite. Move shared fonts into the module and remove chat's timeline font
dependency. Audit other font consumers before deleting timeline copies,
especially document/scene text rendering and packaging scripts.

Add temporary Theme, ChatTheme, and ModelPickerTheme facades that bind native
roles without redefining them. Keep feature metrics in dedicated feature files.
The facades may expose old names but may not carry copied palette literals or
font loaders. Add palette completeness, resource registration, dependency,
import, and metric tests. Fix shared-QML compilation accounting per module.

Exit: standalone gallery and import/resource tests pass from a copied native
source tree containing no `web/`, `node_modules/`, timeline, chat, model-picker,
or backend. A second isolation fixture builds chat plus model-picker plus
primitives with no timeline/web/npm trees. Host smoke tests load the module.

### A3. Text, icons, buttons, surfaces, tooltip, and focus

Primitive owner paths: `native/ui_primitives/qml/{text,controls,overlays,feedback}/`,
with matching `tests/qml/` and gallery cases. Start only with interfaces needed
by this slice. The integration owner adds QML files to CMake.

Timeline slice owner paths: `native/timeline/qml/TransportButton.qml`,
`native/timeline/qml/Tracks/{ToolButton,ToolToggle,TrackIconButton,ZoomStepButton,ToolbarDivider}.qml`,
`native/timeline/qml/{Icon,Icons}.qml`, and their enumerated toolbar callers.
Chat slice owner paths: `native/chat/qml/ChatButton.qml` and action rows in
`ChatPanel.qml`, `ChatComposer.qml`, `ThreadList.qml`, and `MessageDelegate.qml`.

First migrate one timeline toolbar and one chat action row end to end. Replace
glyph/path dispatch with catalog identities. Retain feature wrappers only when
they encode semantic actions or compatibility. Then migrate the enumerated
button callers. Add selected tool, checked toggle, menu-expanded, loading,
disabled-reason, pressed, hover, and keyboard focus cases.

Exit: keyboard activation and accessible metadata pass in both hosts. The
tooltip survives clipped parents and viewport edges. Scheme/scale changes
preserve mounted state. No migrated action row chooses its own font or chrome
recipe. Input, selection, and focus states are visually distinguishable.

### A4. Fields and inspector migration

Primitive owner paths: `native/ui_primitives/qml/controls/` field/select/slider/toggle
modules and `qml/inspector/`, with matching transaction tests and gallery cases.
Inspector owner paths: `native/timeline/qml/Inspector/`,
`native/timeline/src/edit/inspectorsections/`,
`native/timeline/src/edit/clipeffects/`,
`native/timeline/src/edit/keyframes/qmltests/`,
`native/timeline/qml/Tracks/CompactSlider.qml`, and manifest-listed field
consumers under `native/timeline/src/motion/controls/` and `qml/wiring/w/`.

Preserve InspectorRow, Section, SectionTitle, Card, Divider, headers, and
ClipIdentityCard composition while replacing their presentation dependencies.
Keep feature-specific identity content in timeline. Replace PillInput through
the transaction adapter, not a plain TextField. Migrate select popup and
delegates, keyboard slider behavior, origin/reset affordances, validation,
readOnly, disabled, unit suffixes, and focus movement.

Exit: tests send actual key and pointer events for every transaction-table row,
including repeated stepping, modifier changes during drag, invalid input,
focus loss, cancellation, disable mid-gesture, and external update. Assert
preview values and one undo entry for a completed edit, zero for programmatic
updates, and restored document state for true cancellation. Existing
`tst_inspectorsections` and `tst_keyframesui` cases continue to pass. Calling
signals manually is insufficient evidence of interaction behavior.

### A5. Overlays and shell presentation

Primitive owner paths: `native/ui_primitives/qml/overlays/`, presentation
modules needed for tabs/panel headers, and their tests/gallery cases.
Shell owner paths: `native/timeline/qml/dock/*.qml`,
`native/timeline/qml/Preferences/*.qml`,
`native/timeline/qml/{ProjectSettingsDialog,ExportVideoDialog,PasteAttributesDialog}.qml`,
`native/timeline/qml/providersettings/`, `qml/menus/`,
`qml/wiring/RegistryContextMenu.qml`, `qml/wiring/RegistryMenuItems.qml`,
and manifest-listed context menus/popovers in `qml/Tracks/`, `qml/preview/`,
`qml/Inspector/`, and `qml/mixer/EffectDevicePopover.qml`.

Replace presentation while leaving DockLayout.js, DockLayoutStore, docking
controllers, stable panel hosting, persistence, command routing, export logic,
and provider credential handling in place. Give generic dialogs and dock
headers their own semantic metrics. Keep Script, Storyboard, and Assistant
panels separate and preserve panel IDs. Native OS file pickers and the existing
native application menubar remain explicit platform exceptions.

Exit: nested menu navigation, Escape, focus entry/return, keyboard context menu,
disabled items, overlay edges, long labels, narrow windows, open-overlay theme
switching, and dock drag/resize tests pass. Closing a dialog restores focus to
a live trigger or a documented shell fallback if that trigger was removed.
Presentation changes must not recreate panels or lose drafts.

### A6. Remaining surfaces, appearance settings, and mixer

Chat/model-picker owner paths: `native/chat/qml/`, `native/model-picker/qml/`,
`native/chat/tests/`, and `native/model-picker/tests/`. Migrate remaining text,
composer, thread list, message status/action presentation, and picker rows.
Preserve virtualization, streaming, account clearing, selection, and draft
ownership. No changes to chat protocol or model-provider semantics.

Timeline presentation owner paths: `native/timeline/qml/assets/`, `qml/ai/`,
`qml/activity/`, `qml/storyworkspace/`, `qml/aiassist/`, `qml/fx/`,
`qml/controls/`, `qml/mixer/`, `qml/{SaveBanners,SaveStatus,DocumentBar,TimelineListPanel,SourceViewerPanel}.qml`,
`native/timeline/src/server/sync/ExternalConflictsBanner.qml`,
`native/timeline/src/ui/Tempo/TempoToolbar.qml`, and remaining chrome sites
listed in the manifest. These are presentation edits only.

Appearance owner paths: `native/timeline/src/app/Preferences/`,
`native/timeline/qml/Preferences/`, `native/chat/src/main.cpp`,
`native/chat/src/appearance/` (new shell adapter), and `native/chat/qml/Main.qml`.
This owner receives Preferences QML from A5 before editing. Wire persisted
System/Dark/Light, scale, and motion settings with reactive OS updates. Shared
Qt-only shell helpers may be introduced outside primitives when both shells
actually need the same implementation.

Extract Fader and LevelMeter presentation. Keep `faderTaper.js`,
`meterLevels.js`, automation, clip latching, peak hold, and the existing poll
schedule in mixer-owned adapters. Preserve zero reset, grab offset, fine
adjustment, dB labels, and keyboard range. A passive primitive must introduce
no new timer, subscription, audio read, or backend dependency.

Exit: every inventoried chrome surface is migrated or has a narrow justified
domain/platform exception. Dark/light/System and motion updates work in both
shells and all open overlays. Mixer and chat performance do not regress
against A1 on the same fixture and machine. Hidden presentation adds no
continuing animation or polling.

### A7. Remove compatibility code and enforce the native rules

Owner paths: `native/ui_primitives/tools/`, `tests/`, `README.md`, `DESIGN.md`,
`ALIGNMENT.md`, old facade/wrapper files in the three consumer modules, native
packaging/resource manifests, and the native CI workflow selected by the
integration owner. Changes outside `native/` are limited to wiring that native
check into the existing repository checks and relevant guidance. Web stays
unchanged.

Enumerate remaining references before deleting Theme/ChatTheme/ModelPickerTheme,
legacy adapters, local font loaders, duplicate resources, or unused wrappers.
Feature metrics and semantic wrappers are not obsolete merely because a base
primitive exists. Remove all legacy cancellation policies after the hosts have
rollback tests. Update documentation invalidated by the extraction.

Start `check_design.py` with explicit existing violations in `migration.toml`
and strict enforcement for migrated files. End with no grandfathered chrome
violations. Remaining exceptions must name a file/property or rendering region,
its domain reason, and an owner. Do not exempt all timeline files or all Canvas.

The checker must parse QML tokens, object scopes, properties, imports, and
bindings sufficiently to distinguish comments, strings, nested objects, and
feature content from chrome. A whole-file regex is not sufficient. Use a
Qt-independent tokenizer/parser with failure on unsupported syntax in strict
scope, or a supported native parser. Do not introduce Qt private parser APIs
or npm. Pair it with qmllint for language/type validity.

Reject raw chrome colors, independent font attributes, unapproved spacing and
radii, local font loading, recreated hover/focus recipes, timed Rectangle
tooltips, and direct interactive Controls or Rectangle buttons in migrated
feature code. Allow structural Qt items, domain bounds, timestamps, playback
durations, waveform/document colors, content gradients, and native file/menu
exceptions only in their declared scope. Check imports, resources, CMake
dependency declarations, and isolated builds separately from design syntax.

Exit: deliberately invalid fixtures fail with expected diagnostics, valid
domain fixtures pass, the checker asserts a nonempty inspected set, stale
exceptions fail, and adding an unclassified QML file fails. A large synthetic
input guards against quadratic scans. Inspect edited bytes for stray control
characters. Native commands run without Node or web present. Root checks run
as required by repository policy.

## Acceptance commands and evidence

The commands below specify interfaces to implement in A2/A7. New targets and
scripts do not exist merely because they appear in this plan. Each script must
document arguments, return nonzero on failure, and print the inspected scope.
Run from the repository root, with the Qt installation supplied explicitly.

```bash
cmake -S native/ui_primitives -B native/ui_primitives/build -G Ninja \
  -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt -DBUILD_TESTING=ON
cmake --build native/ui_primitives/build --parallel 2
cmake --build native/ui_primitives/build --target nodetool_ui_primitives_qmllint
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software \
  ctest --test-dir native/ui_primitives/build --output-on-failure
python3 native/ui_primitives/tools/check_design.py --strict
python3 native/ui_primitives/tools/check_dependencies.py
python3 native/ui_primitives/tools/check_isolated_build.py \
  --qt-prefix /opt/homebrew/opt/qt
python3 native/ui_primitives/tools/capture_gallery.py \
  --build native/ui_primitives/build --verify \
  --scales 1,1.25,1.5,2 --text-scales 1,1.5,2
```

The isolated-build script stages only approved native sources in a temporary
tree, uses a restricted tool PATH, makes Node/npm unavailable, and rejects
references that escape the staged tree. It builds the standalone gallery and
the chat/model-picker integration fixture. Do not temporarily rename or remove
the working checkout's web or dependency directories to simulate isolation.

Native tests must cover palette completeness and contrast pairings, role
metrics, font resources and weights, plugin import with no source fallback,
pointer/keyboard/accessible metadata, transaction lifecycle, theme switching
with open overlays, text/UI scale, long translations, RTL, narrow windows, and
idle animation behavior. Visual tests require deterministic fixtures and
loaded fonts, a pinned rendering backend, and explicit tolerance. Inspect
failed image differences rather than automatically accepting new baselines.

Configure/build affected hosts using their existing documented commands.
Select registered tests explicitly, inspect the selection, and require a
nonempty result. Existing relevant test names include:

```bash
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software \
  ctest --test-dir native/timeline/build --output-on-failure \
  -R '^(tst_tracksui|tst_dockui|tst_dockstore|tst_inspectorsections|tst_keyframesui|tst_ai_ui|tst_appshell_preferences|tst_storyworkspace|tst_storydrafts|library_ui|shared_qml_build)$'
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software \
  ctest --test-dir native/chat/build --output-on-failure \
  -R '^(chat-quick-tests|chat-ui-bench|model-picker-visual-tests)$'
```

Add the actual registered provider-dialog, mixer/automation, export, and new
appearance tests to the relevant slice's command after inventory. The list
above is not permission to skip another affected host. Do not suppress QML
import scanning on a tested consumer. Local configure optimizations must not
be committed as unexplained global build policy.

After code changes, run the repository-required checks, building packages
first as documented. Their success is separate from native isolation.

```bash
npm run build:packages
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

For the A1 AGENTS.md instructions, add the sibling CLAUDE.md, link the area
from the root instruction tree, and run `npm run check:agents-docs`.

## Completion and platform limits

| Requirement | Evidence required |
| --- | --- |
| Independent ownership | Isolated build, staged path audit, and dependency checks with web/npm/media/backend unavailable |
| Complete migration | Manifest enumeration, zero remaining facade references, strict design check, feature examples needing no local presentation recipes |
| Preserved behavior | Actual interaction and undo tests, existing host suites, no lost drafts/panel identity/selection |
| Presentation quality | Dark/light galleries, 100/125/150/200 percent display-scale captures, independent text scaling, narrow/translated/RTL fixtures, inspected image differences |
| Performance | Same-fixture before/after measurements, no hidden animation work, no duplicated meter polling, no document reconstruction on theme change |
| Packaged operation | Installed app starts away from source with fonts, icons, plugins, and license files present |
| Accessibility | Keyboard/focus/metadata tests plus platform assistive-technology checks with recorded expected announcements |

R1. Offscreen macOS tests cannot verify Windows/Linux rendering, platform
accessibility bridges, native menu behavior, real mixed-DPR monitor movement,
or OS theme/reduced-motion notifications. Run those checks on their platforms.
Use VoiceOver on macOS, NVDA on Windows, and the supported Linux assistive
technology path. Record unrun checks explicitly. Do not call them passed.

R2. Latin-only font resources and provider-logo licensing need actual audits.
Font presence does not prove glyph coverage or redistribution rights for every
asset. Missing coverage must have a documented fallback and visual evidence.

R3. The existing accent and transparent overlay recipes may fail contrast
targets. Both palettes are implementation work, not constants to preserve at
any cost. Review text-on-accent, selected rows, disabled controls, and focus
outlines against their real composited backgrounds.

R4. Cancellation and focus-loss semantics vary across current controls.
Adapters prevent accidental undo changes during extraction. Full completion
requires tested new contracts and removal of compatibility policies, rather
than leaving both interaction models indefinitely.

R5. Native accessibility guidance is informed by
[WCAG2ICT](https://www.w3.org/TR/wcag2ict/), which is informative guidance for
applying WCAG to non-web software. Contrast calculations, screenshots, and
QML metadata are partial evidence. They do not establish overall conformance.

R6. Text editing also needs platform IME verification: composition, candidate
selection, Enter/Escape during composition, clipboard shortcuts, and focus
transfer. Add deterministic event tests where Qt permits them, then verify the
actual input methods on supported systems. A key-event unit test cannot prove
that an IME's composition was preserved.

Completion means the full module and migration pass the stated checks, React
is unchanged, and any unavailable platform evidence is reported as a remaining
verification gap. A report must distinguish implemented behavior, locally
verified behavior, and platform verification still required.
