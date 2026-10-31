# Native UI primitives

`NodeTool.UiPrimitives` is a Qt Quick presentation module. A host adds this
directory with CMake and calls `nodetool_use_ui_primitives(target)` once for
each executable that creates a QML engine. Import it as
`import NodeTool.UiPrimitives as Ui`.

`Ui.Theme.preference` uses `Ui.Theme.System`, `Ui.Theme.Dark`, or
`Ui.Theme.Light`. `systemScheme` uses `Ui.Theme.Unknown`,
`Ui.Theme.Dark`, or `Ui.Theme.Light`. Unknown system appearance
resolves to dark. The shell supplies positive `uiScale`, `textScale`, and
`reducedMotion`. Metrics scale by `uiScale`; font sizes scale by both factors.
Qt applies device pixel ratio separately.

`Ui.Text.role` uses `Ui.Typography.SansTitle`, `SansBody`, `SansLabel`,
`SansCaption`, `MonoCode`, `MonoStrong`, `MonoLabel`, or `MonoCaption`.
`Ui.Text.tone` and `Ui.Icon.tone` use `Ui.Text.Primary`, `Secondary`,
`Disabled`, `OnAccent`, `Success`, `Warning`, `Error`, or `Info`. Icon names
are keys in `Ui.Icons`, and `size` is a named `Ui.Metrics.icon*` value.
`Ui.Text.domainColor` and `Ui.Icon.domainColor` accept a feature-owned
semantic color for document or media visuals. Chrome uses `tone`.

Buttons use `Ui.EditorButton.Compact`, `Standard`, or `Comfortable` density
and `Ui.EditorButton.Default`, `Primary`, `Flat`, or `Destructive` variant. Compact and
standard controls have minimum heights of 28 and 32 logical pixels. Text may
increase either height. `providerEntry` selects a provider logo in place of
`iconName`.
`contentAlignment` accepts `Qt.AlignLeft`, `Qt.AlignHCenter`, or
`Qt.AlignRight`. `iconTone` and `textTone` accept the semantic tones of
`Ui.Text`. Shortcut text is display only; the host owns accelerator registration.

The bundled Inter and JetBrains Mono files use TrueType so native and offscreen
Qt font engines can load the same faces. They were decompressed from the WOFF2
fonts with `woff2_decompress` and cover Latin subsets. The regular
faces include U+0301 combining acute but not the tested U+0105, U+0416,
U+03A9, U+4E2D, U+0645, or U+1F600 samples. Qt selects installed platform
fallback fonts for missing glyphs. Windows offscreen runs set `QT_QPA_FONTDIR`
to `%WINDIR%/Fonts` so the FreeType backend can discover those fonts. A macOS offscreen sample selected SF Arabic,
Apple Simplified Chinese, and Apple Color Emoji. Fallback family, shaping,
emoji presentation, and coverage vary by platform. Test each translation and input method on its
target system; these samples do not describe every glyph in a script. See
[the native design](DESIGN.md) and
[resource licenses](resources/licenses/).

`Ui.Select` takes `value`, `options` entries `{label, value, enabled?}`,
`accessibleName`, `enabled`, `readOnly`, `valid`, `errorText`, and `density`.
It emits `valueCommitted(value)` only for a user choice. The caller owns the value.

`Ui.TextArea.variant` is `Ui.TextArea.Field`, `Plain`, `Bubble`, `Code`, or `Quiet`.
Quiet is transparent until hovered or focused. The role and inherited
`textFormat` choose type and rich text behavior.

Presentation types:

- `Ui.Surface.variant` is `Ui.Surface.Canvas`, `Panel`, `Input`, or `Overlay`.
- `Ui.Separator.orientation` uses `Qt.Horizontal` or `Qt.Vertical`.
- `Ui.PanelHeader.text` supplies the label; its default content is trailing
  actions.
- `Ui.ListRow.active` supplies selection appearance; its default content holds
  the row's label and nested actions. It inherits button activation.
- `Ui.Popover.openAt(item)` and `Ui.ContextMenu.openAt(item)` anchor to an item
  and return focus to it on close. Popup content and menu items are supplied by
  the caller. `Ui.Popover.contentItem` is its explicit body layout slot.
  `Ui.MenuItem` inherits native menu-item and Action semantics.
- `Ui.Dialog.contentItem` is its explicit body layout slot. The module owns the
  header, background, and focus behavior. `returnFocusTo` supplies the focus
  target on close.
- `Ui.Tooltip.trigger` identifies the anchor. Its inherited `text`, `visible`,
  and `delay` control the message and timing. `Ui.ShortcutHint` renders its
  inherited text in the mono caption role.

`Ui.Slider` takes `value`, `from`, `to`, `stepSize`, `origin`, `resetValue`,
`resetOnDoubleTap`, `accessibleName`, `enabled`, and `density`. It emits `editStarted()`,
`valuePreviewed(real)`, `valueCommitted(real)`, and `editCanceled()`. The host
rolls back previews after cancellation. `reset()` starts and commits a reset
transaction. Set `resetOnDoubleTap` to let the slider own that gesture. A single
tap then commits after the platform double-click interval; a drag commits on
release.

`Ui.TextField` and `Ui.TextArea` take a string `value`; `Ui.NumberField` takes
a numeric `value`, `displayValue`, `unit`, `from`, `to`, and `stepSize`. Fields
also accept `accessibleName`, `readOnly`, `enabled`, `valid`, `errorText`, and
`density`. TextField accepts `suffix`. All emit `editStarted()`,
`valuePreviewed(value)`, `valueCommitted(value)`, and `editCanceled()`.
`cancelEdit()` discards the draft. Invalid focus loss cancels and restores the
latest authoritative value. Hosts roll back previewed document changes.

`Ui.CheckBox` and `Ui.Toggle` retain native `checked`, `enabled`, and keyboard
semantics. They emit `checkedChangedByUser(bool)` only for user changes.
`Ui.BusyIndicator` accepts `running` and `accessibleName`; it stops animation
when hidden, inactive, or reduced motion is selected. `Ui.Progress` is for
determinate progress. `Ui.ScrollBar` retains native position, size,
orientation, and policy.

`EditorButton.menuButton` marks a menu trigger and `menuExpanded` reports its open state independently of `checked`. Set `trailingIconName` to a catalog identity for a trailing icon; the control handles mirrored layout and label elision. `textRole` selects the label's typography role; its default is `Typography.SansLabel`.

`Status` and `Banner` take `status` (`Status.Success`, `Warning`, `Error`,
`Info`) and `message`. `Banner` also accepts optional `actionText` and emits
`actionTriggered()`. `EmptyState` exposes `title`, `message`, optional
`actionText` and `actionTriggered()`. `Progress` reports determinate progress;
`BusyIndicator` handles indeterminate work and respects reduced motion and
visibility.

`MenuButton` accepts a `menu` popup and inherits the button API. Activation opens or closes the popup, reports expanded accessibility state, and returns focus when it closes.

Custom native text renderers can bind `Typography.font(role)` to receive the
approved family, pixel size, and weight for any typography role. Canvas
renderers use `Typography.canvasFont(role)` for the equivalent CSS font string.

Capture the full dark/light, standard/narrow RTL, display-scale, UI-scale, and
text-scale matrix with `python3 tools/capture_gallery.py --build build`.
`--verify` compares the reviewed cases in
`tests/visual/gallery/<platform>-<architecture>/manifest.json`. A selected
case without an image fails. The macOS references are pinned to macOS 27.0,
arm64, Qt 6.12.0, the offscreen software renderer, and the bundled Inter
face. The gallery rejects font fallback for its title before saving any frame.
An unmatched platform or Qt runtime has no accepted visual reference.
Comparison allows a maximum channel difference of 2 in at most 0.1% of
pixels. The full capture matrix also checks flow bounds without accepting
new pixels automatically.

Native CI runs that capture matrix on Linux, macOS, and Windows and uploads
the frames, capture log, and render environment. Each capture fails if a
control exceeds its flow bounds or the title does not render in bundled
Inter. CI compares pixels only when the platform, architecture, OS version,
Qt runtime, and offscreen software renderer exactly match a reviewed manifest.
The current macOS 15 runner does not match the macOS 27 reference, so its
uploaded frames are bounds evidence, not a golden comparison. Linux and
Windows also need reviewed references before CI can compare their pixels.
