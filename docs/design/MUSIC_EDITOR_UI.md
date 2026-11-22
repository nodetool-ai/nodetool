---
layout: page
title: "Music Editor UI"
permalink: /design/music-editor-ui
description: "Shared web and native rules for the tracks area, regions, piano roll, Step Editor, automation, chord track, mixer, menus and dialogs."
---

# Music Editor UI

**Navigation**: [Design System](../DESIGN.md) | [Native design](../../native/ui_primitives/DESIGN.md) | [UX Guidelines](../UX_GUIDELINES.md) | [UI Primitives Strategy](../../web/src/components/ui_primitives/STRATEGY.md)

This page holds the rules that are specific to music editing. Web and native
follow the same rules. General rules for type, spacing, color, menus, dialogs
and focus stay in the [Design System](../DESIGN.md), the
[native design specification](../../native/ui_primitives/DESIGN.md) and the
[native module rules](../../native/ui_primitives/AGENTS.md). This page does not
repeat them.

Logic Pro 13 is the reference for behavior. Each rule has a tag:

- **Logic**: the rule matches Logic Pro.
- **Differs**: the rule is deliberately different. The reason follows.

## Decisions

These decisions are accepted. The rules below cite them by code.

| Code | Decision |
|---|---|
| D62 | The playhead is magenta (`secondary.main` / `Ui.Theme.accentSecondary`), so it stays distinct from the blue selection and range |
| D63 | One range blue on web and native: `c_timeline_range` and `c_timeline_range_fill` / `TimelineVisuals.editBlue` and `TimelineVisuals.rangeFill` |
| D64 | Menu icons are all or none for the whole menu, here and in [Menus](../DESIGN.md#menus) |
| D65 | Track header: delete moves to the context menu, a control that does not fit becomes an icon menu, and row 2 hides in a fixed order below 280 |
| D66 | No timecode pill on the ruler. The position readout is in the control bar |
| D67 | Mixer strip 72 wide. Plug-in editors open in windows or docked panels. A popover only for 3 or fewer parameters |
| D68 | The region length label shows only on hover. The hatched disabled state stays |

## Token names

A rule names the web token first and the native token second, as
`web` / `native`. A single name means both sides use it. Timeline values that
have no shared token live in these files:

| Side | Sizes | Colors |
|---|---|---|
| Web | `web/src/components/timeline/Tracks/trackHeight.ts`, `stores/timeline/TimelineUIStore.ts`, `Tracks/automation/automationLayout.ts` | theme palette |
| Native | `native/timeline/qml/TimelineMetrics.qml` | `Ui.Theme`, `native/timeline/qml/TimelineVisuals.qml` |

A new music value goes into these files on both sides in the same change.
Do not write a raw value in a component.

## 1. Tracks area

### 1.1 Lanes and headers

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Default lane height | 64 | `DEFAULT_TRACK_HEIGHT_PX` / `TimelineMetrics.trackHeight` | Logic (medium zoom) |
| Lane height range | 24 to 300, changed by the track height slider and by a drag on the lane's lower edge | `MIN_TRACK_HEIGHT_PX`, `MAX_TRACK_HEIGHT_PX` / same values in `TimelineMetrics` | Logic |
| Header width | 320 by default, resizable | `DEFAULT_TRACK_HEADER_WIDTH_PX` / `TimelineMetrics.trackHeaderWidth` | Logic |
| Header row 1 | Drag grip, track icon, name, track ID chip | `ICON_SIZE.sm` / `Ui.Metrics.iconSm` | Logic |
| Header row 2 | Mute, Solo, Record or Lock, then icon buttons only | `CONTROL.height.sm` / `Ui.Metrics.compact` | Logic |
| Lane separator | One 1px line in the subtle border color | `divider` / `Ui.Theme.borderSubtle` | Logic |

**Header controls never truncate (D65).** A header control shows its full value or
an icon. A dropdown whose text does not fit becomes an icon button that opens
a menu, with the value in its tooltip. "W…" and "P…" are defects. At a header
width below 280, hide row 2 controls in this order: delete, effects, input,
then lock. Mute and Solo stay. *Logic: header components are configurable, and
Logic hides controls rather than truncate them.*

**Delete is not a header button (D65).** Delete a track from the header context menu
or with the Delete key. *Logic has no delete
button in the header. A one-click delete next to Solo invites mistakes.*

### 1.2 Ruler and playhead

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Ruler height | 40, two bands: bar numbers on top, cycle and range strip below | `TimelineMetrics.rulerHeight` on both | Logic |
| Ruler labels | Bars and beats (`5`, `5.3`) in music mode, timecode in video mode | `TYPOGRAPHY.mono.caption` / `MonoCaption` | Logic |
| Playhead line | 1px, full height of ruler and lanes | `secondary.main` / `Ui.Theme.accentSecondary` | Differs (D62): Logic uses white. Magenta stays distinct from the blue selection and range |
| Playhead head | A small triangle in the ruler, no wider than 12 | same color | Logic |
| Position readout | In the transport or control bar, not on the ruler | `TYPOGRAPHY.mono.label` / `MonoLabel` | Logic |

**No pill on the ruler (D66).** A timecode pill covers the first bar and the
ruler labels. The readout is in the control bar. *Logic shows position in the
LCD only.*

### 1.3 Selection and range colors

| State | Rule | Web / native | Tag |
|---|---|---|---|
| Selected region | 1px frame in primary text color and the header band at full color | `text.primary` / `Ui.Theme.textPrimary` | Logic (white frame) |
| Range (marquee) on lanes | Translucent blue fill over the selected tracks only, 1px blue edges | `c_timeline_range_fill`, `c_timeline_range` / `TimelineVisuals.rangeFill`, `TimelineVisuals.editBlue` (D63) | Logic |
| Range in the ruler | The same blue in the lower ruler band, with drag handles at both ends | as above | Logic (marquee ruler) |
| Cycle area | Yellow band in the lower ruler band | `warning.main` / `Ui.Theme.statusWarning` | Logic |
| Rubber band box | 1px dashed frame, no fill | `text.secondary` / `Ui.Theme.textSecondary` | Logic |

A range never tints tracks outside it. Shift-click a header adds or removes a
track from the range. *Logic.*

## 2. Regions

### 2.1 Anatomy

```
+-------------------------------------------+  1px frame (selection state)
| ● Name                             8 bars |  header band, 16 tall
|-------------------------------------------|
|   ———    ——   —————                       |  content (type specific)
|        ——            ———                  |
+-------------------------------------------+
```

| Part | Rule | Web / native | Tag |
|---|---|---|---|
| Header band | 16 tall, region color at full strength | `TimelineMetrics.clipNameBandHeight` on both | Logic |
| Body | Region color at reduced strength, so content reads on it | `action.selected` overlay / `Ui.Theme.actionSelected` over the region color | Logic |
| Label | Name left, length right in mono caption, the length only on hover (D68). Text color is the contrast color of the header band | `TYPOGRAPHY.sans.caption`, `TYPOGRAPHY.mono.caption` / `SansCaption`, `MonoCaption` | Logic |
| Length unit | Bars and beats in music mode. Seconds only in video mode | | Differs: Logic shows no length. The label helps loop work |
| Radius | Control radius | `BORDER_RADIUS.sm` / `Ui.Metrics.radiusControl` | Logic (small radius) |
| Minimum width | Below 40, hide the label. Below 4, draw only the frame | `MIN_LOOP_HANDLE_CLIP_WIDTH_PX`, `MIN_CLIP_WIDTH_PX` | Logic |

**Region color is data.** It comes from the track or the region, never from a
theme token. Only the header band carries it at full strength. Status color
(error, generation) never replaces it. Status uses a badge in the header band.

**The status dot means one thing.** A dot before the name marks a muted
region, as in Logic. Do not use the dot for "MIDI" or "selected". *Logic.*

### 2.2 Content per type

| Type | Rule | Web / native | Tag |
|---|---|---|---|
| MIDI | One horizontal line per note, at its pitch and for its full length. The vertical scale fits the lowest and highest note of the region, with 2px inset. Line thickness 2, or the lane's pitch step if smaller | `MidiNoteLines.qml` on native, the same algorithm on web. Color: the contrast color of the region body | Logic |
| Audio | Waveform centered, filled, scaled to the region gain | `TimelineVisuals.audioWave` on native. Web reads the same value | Logic |
| Pattern (Step Editor) | Steps as short ticks on a row grid, one row per sound | as MIDI | Logic |
| Automation-only | The curve, no fill | see section 5 | Logic |
| Empty | The header band and an empty body. No placeholder text | | Logic |

**No dots for MIDI.** Scattered dots without length and pitch carry no
information. Draw note lines in every region at every zoom. *Logic.*

### 2.3 Loop repeats

| Item | Rule | Tag |
|---|---|---|
| Repeat body | Draw the content of each repeat at 50% opacity, with no header band label | Logic |
| Repeat boundary | A notch at the top and bottom edge at each repeat start, 6 wide, plus a 1px line in the subtle border color | Logic |
| Loop handle | Appears at the upper-right corner on hover, 14 square, cursor shows a loop arrow | Logic (`LOOP_HANDLE_SIZE_PX`) |
| Frame | The original region keeps its frame. Repeats have no frame | Logic |

Repeats must read as copies at a glance. *Logic.*

### 2.4 States

| State | Rule | Web / native | Tag |
|---|---|---|---|
| Hover | Raise the body by the hover overlay. Show trim, loop and fade grips | `action.hover` / `Ui.Theme.actionHover` | Logic |
| Selected | See 1.3 | | Logic |
| Muted | Gray header band and body, the dot before the name, content at 50% opacity | `text.disabled` / `Ui.Theme.textDisabled` | Logic |
| Disabled (not rendered) | As muted, plus a diagonal hatch on the body | same | Differs (D68): Logic has no separate disabled state. NodeTool keeps generated regions out of the mix without deleting them |
| Locked | A 12 lock icon in the header band, right of the name. The region does not move or trim. The cursor is the default arrow | `ICON_SIZE.xs` / `Ui.Metrics.iconXs` | Logic (protected track) |
| Alias | Name in italics | | Logic |
| Generating | A determinate or running indicator in the header band. The body stays visible | see [Progress and generation status](../DESIGN.md#progress-and-generation-status) | Differs: no Logic equivalent |

## 3. Drag, trim and snap

| Gesture | Zone | Cursor | Feedback | Tag |
|---|---|---|---|---|
| Move | Body | Grab, then grabbing | Ghost of the region at the target, help tag with position and track | Logic |
| Trim | Lower-left or lower-right 8px | Trim bracket | Help tag with new start or length | Logic |
| Loop | Upper-right corner | Loop arrow | Notches appear as you drag | Logic |
| Junction | Top edge where two regions meet | Junction | Both regions resize | Logic |
| Fade | Upper corners | Fade cursor | Ramp curve on the body | Logic |
| Time stretch | Option-drag the right edge | Stretch | Help tag with the ratio | Logic |

**Snap feedback.** A 1px vertical line at the snap target across all lanes,
in the edit blue, for as long as the drag snaps. Snap threshold is 8
(`SNAP_THRESHOLD_PX`). *Logic.*

**Help tag.** A small overlay above the pointer with mono caption text. It
shows position, length, pitch or value while the gesture runs. It uses the
overlay surface and never covers the edited edge. *Logic.*

Trim ripple and roll keep their colors (`TimelineVisuals.trimRipple`,
`TimelineVisuals.trimRoll`). *Differs: Logic has no ripple trim. Video mode
needs it.*

## 4. Piano roll and Step Editor

### 4.1 Piano roll

| Item | Rule | Tag |
|---|---|---|
| Keyboard | Left edge, white and black keys, C labels with octave (C3). Click a key selects all notes of that pitch | Logic |
| Grid | Black-key rows darker by the hover overlay. Bar lines stronger than beat lines, beat lines stronger than divisions | Logic |
| Note | Rectangle in the region color, `BORDER_RADIUS.xs` / 2. Selected notes get the selected frame from 1.3 | Logic |
| Velocity in note | A horizontal line inside the note, length proportional to velocity | Logic |
| Note labels | Off by default. A view option shows pitch inside each note | Logic |
| Muted note | No fill, frame only | Logic |
| Multiple regions | Each region start shows as a vertical line in its color | Logic |
| Snap | Separate from the tracks area snap | Logic |

### 4.2 Controller and velocity lanes

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Height | 56, resizable | `VELOCITY_LANE_HEIGHT_PX` / matching `TimelineMetrics` value | Logic |
| Velocity | One stem per note with a round head, in the note color | | Logic |
| CC data | Stepped line with points, as automation in section 5 | | Logic |
| Lane header | Parameter picker as a full-width select. Never truncate | | Logic |

### 4.3 Step Editor

| Item | Rule | Tag |
|---|---|---|
| Name | "Step Editor" on every surface | Differs: Logic calls it Step Sequencer. NodeTool already uses "Step Editor" |
| Step | Square cell. Off: subtle border, no fill. On: track color fill. Value modes show a bar inside the cell from the bottom | Logic |
| Row header | Icon, name, mute, solo, then the row menu. Same height as a step | Logic |
| Edit mode | One selector above the grid. The mode applies to all rows | Logic |
| Page overview | Over 16 steps, show page thumbnails above the grid | Logic |
| Playing step | Frame in the playhead color | Differs: Logic uses a lit column. A frame keeps the step value readable |

## 5. Automation lanes

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Lane height | 56, below its track | `AUTOMATION_LANE_HEIGHT_PX` | Logic |
| Curve | 1.5px line in the parameter color. Stepped segments 1px | | Logic |
| Point | 6 circle, filled. Selected: white fill and the selected range bar under it | `text.primary` / `Ui.Theme.textPrimary` | Logic |
| Value tag | Show the value beside a point while you drag | mono caption | Logic |
| Muted curve | Gray | `text.disabled` / `Ui.Theme.textDisabled` | Logic |
| Mode colors | Off gray, Read green, Touch mustard, Latch orange, Write purple | `success.main`, `warning.main`, `secondary.main` / `Ui.Theme.statusSuccess`, `statusWarning`, `accentSecondary`. Touch mustard is `TimelineVisuals.fxBadge` | Logic |
| Add point | Click the curve or double-click empty space | | Logic |
| Delete point | Double-click the point, or select and Delete | | Logic |
| Bend | Control-Shift-drag a segment | | Logic |

The automation curve also shows on top of the region when the lane is
collapsed, at 50% opacity. *Logic.*

## 6. Chord track

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Position | Global track above all tracks, below the ruler | | Logic |
| Height | 24 | `CONTROL.height.xs` / `Ui.Metrics.compact` minimum | Logic |
| Chord | A region in the chord color with the name in sans label (`Cm7`, `F/A`) | `TimelineVisuals.chord` | Logic |
| Progression | Roman numerals when shown as a progression | | Logic |
| Edit | Double-click opens the Edit Chord dialog | | Logic |

## 7. Mixer

### 7.1 Strip anatomy

Order from top to bottom. A strip shows only the slots it has content for,
plus one empty slot per group.

1. Settings menu
2. EQ thumbnail
3. MIDI effect slots (instrument strips)
4. Instrument or input slot
5. Audio effect slots
6. Send slots
7. Output slot
8. Automation mode
9. Pan knob
10. Peak readout
11. Fader with meter
12. Mute, Solo, Record
13. Track name in the track color

*Logic.*

| Item | Rule | Web / native | Tag |
|---|---|---|---|
| Strip width | 72 fixed. A strip never grows to fill space (D67) | `MIXER_STRIP_WIDTH_PX` / a `TimelineMetrics` value of 72 | Logic |
| Empty area | Space right of the last strip stays empty canvas | `background.default` / `Ui.Theme.surfaceCanvas` | Logic |
| Slot | `CONTROL.height.xs`, label truncates with the full name in the tooltip | `Ui.Metrics.compact` | Logic |
| Peak readout | Orange on clip, red on output strips. Click resets all | `warning.main`, `error.main` / `statusWarning`, `statusError` | Logic |
| Meter | Green to yellow to red. 0 dBFS mark | `success.main`, `warning.main`, `error.main` | Logic |
| Fader | Option-click sets 0 dB. Shift-drag is fine adjust | | Logic |

**No wide empty strips.** Strips keep their fixed width and align left. *Logic.*

### 7.2 Plug-in UI placement

A plug-in editor opens as a floating window or a docked panel (D67). It never opens
as a popover over the strips. A quick-edit popover is allowed for 3 or fewer
parameters, and it anchors to the side of the strip that has room, so it does
not cover the next strip's slots. *Logic: plug-in windows float. The native
effect popover that covers the next strip is a defect.*

## 8. Menus

The base rules are in [Menus](../DESIGN.md#menus). Music menus add these:

| Rule | Tag |
|---|---|
| Group order: edit (split, join, trim), copy (duplicate, repeat), properties (rename, color, loop), range or section, process (fade, regenerate), state (mute, lock, disable), then delete | Logic (region menu) |
| **Icons all or none for the whole menu (D64).** If any row has an icon, every row has one. Otherwise no row has one. [Menus](../DESIGN.md#menus) has the same rule | Logic |
| Shortcut hints use platform symbols on macOS (⌘⌥K) and `Ctrl+Alt+K` elsewhere. Never all caps (`DELETE`) | Logic |
| Range commands appear only when a range exists, as one group with the range length in the subheader | Logic |
| Delete is last, after a divider, in error color | Logic |
| A row that opens a dialog ends with an ellipsis | Logic |
| Toggle rows (Loop, Mute, Lock) use `checkable="checkbox"` instead of separate on and off items | Logic |

Native menus use `ClipMenuEntry.qml` and `MenuActionItem.qml` with the same
rules.

## 9. Dialogs

Base rules: [Dialogs](../DESIGN.md#dialogs) and the
[native dialog rules](../../native/ui_primitives/DESIGN.md#motion-and-recipes).

| Dialog | Rule | Tag |
|---|---|---|
| Repeat | Fields: number of copies, adjustment (snap value), as copies or as aliases. Default 1 copy, as copies. Confirm text "Repeat" | Logic |
| Edit chord | Chord name field, root, type, extensions, bass note, Preview button. Tab moves to the next chord | Logic |
| Split notes | When a split crosses notes, ask Keep, Shorten or Split | Logic |
| Normalize | Process, method (Peak or Loudness), target | Logic |

A music dialog never blocks playback. Space starts and stops the transport
while a dialog is open. *Logic.*

## 10. Keyboard and modifiers

Web on Windows and Linux maps Command to Ctrl and Option to Alt.

| Key | Action | Tag |
|---|---|---|
| Space | Play or stop | Logic |
| Shift-Space | Play from selection | Logic |
| Command-T | Split at playhead | Logic |
| Command-R | Repeat once | Logic |
| L | Loop on or off | Logic |
| Control-M | Mute region | Logic |
| Command-U | Set cycle to selection | Logic |
| Option-drag | Copy | Logic |
| Control-drag | Fine move (one division) | Logic |
| Control-Shift-drag | Finest move (tick or sample) | Logic |
| Shift-drag | Override the one-direction drag lock | Logic |
| Option-click fader | 0 dB | Logic |
| Delete | Delete selection | Logic |

Every key command also has a menu row or button, per
[UX 6.2](../UX_GUIDELINES.md#62-a-shortcut-also-has-a-visible-control).

## 11. Empty states

Base rule: [UX 4.1](../UX_GUIDELINES.md#41-an-empty-state-offers-the-next-step-in-place).

| Surface | Empty state | Tag |
|---|---|---|
| Tracks area, no tracks | One row with "Add track" and the track types | Differs: Logic opens a New Tracks dialog. An inline row keeps the person in the editor |
| Empty lane | No text. Double-click creates an empty MIDI region on an instrument track | Logic |
| Piano roll, no region | "Select a MIDI region to edit notes" and a "Create region" button | Logic |
| Step Editor, no rows | The Add Row menu as the main action | Logic |
| Automation lane, no data | A flat line at the current value | Logic |
| Mixer, no tracks | The same "Add track" action as the tracks area | Differs: same reason |
