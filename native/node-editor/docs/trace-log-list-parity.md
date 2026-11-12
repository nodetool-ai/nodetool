# Native stored-run log list

The source is `LogsView`, `logGrid` and `SpanPicker` in
[TracePanel.tsx](../../../web/src/components/panels/TracePanel.tsx).
[LogPanel.tsx](../../../web/src/components/panels/LogPanel.tsx) is the separate
live workflow log surface. Its newest-first ordering and severity toggles do
not apply to stored-run logs.

## Data and filters

Keep the existing controller query contract: `runs.logs` receives the selected
run, `include_content`, page limit, optional level, source, focused span and
append cursor. Keep ascending timestamp and ID ordering, ID deduplication,
page notices, content-expiration handling and request-generation isolation.
Filtering starts a replacement page. More logs appends only to that query.
Source options include loaded nonempty sources and the selected source.

Add a Logs span selector with an explicit All spans option. Reuse
`spanChoices`, `focusedSpanId`, `focusSpan` and `clearFocus`, retaining complete
span IDs. Choosing a span filters logs and preserves the existing detail/Ask
contracts. Clearing the selector removes the span query filter. If the current
span is outside the returned trace, retain a selectable ID fallback rather than
silently showing All spans. A feature-local picker composes `Ui.EditorButton`, `Ui.Popover`,
`Ui.TextField` and a bounded `ListView`. Search matches span name and status,
with case-insensitive substring matching. Options show depth capped
at eight, relative start and duration, and a visible Error indicator. Keyboard
navigation opens and selects results, and closing restores trigger focus.

## List and layout

Introduce feature-local `TraceLogList.qml` to own aligned headers, bounded
`ListView` delegates and its scrollbar. Keep the Trace list and details
components separate. A fixed-height log viewport receives the available grid
height, so loaded row count does not instantiate all delegates or expand the
panel. Keep More logs outside the scrolling rows. Preserve selected-log
highlighting through stable log IDs.

Wide rows align Time, Level, Source, Span and Message with their headers.
Use existing metrics and type roles. Time and level have fixed token-based
widths. Source, span and message share remaining space. At narrow widths use
aligned Time, Level and Message columns. Source and span stay available in
the row accessible description and the selected details span action. Elide
single-line cells and keep markup literal. Error and warning use semantic
text tones with visible level labels. No color-only meaning or new status-pill
primitive is introduced.

The row message opens the selected log. A separate span action filters to the
row span on wide rows. Arrow keys move the list current row, Home/End reveal
the first/last row, and Enter opens its details. Selection and keyboard focus
have visible primitive styling. Narrow filter controls stack within the panel
instead of forcing the source and span fields beyond its bounds. The existing
responsive details split and independent details scrolling remain intact.

## Verification

Extend the fake stored-run server with multiple levels/sources/spans, a large
log page, duplicate page entries and a cursor. Tests first reproduce the
unbounded delegates and missing span selector. Verify the instantiated delegate
count stays below loaded count, final-row keyboard reachability, aligned cell
geometry, literal text, level tones, selection and span activation. Inspect
query inputs for level/source/span, All spans clearing, cursor append and
filter replacement. Retain existing run/account/workflow isolation tests and
log details Ask/close/remembered-span behavior.

Capture wide and narrow layouts in dark and light schemes, including selected
log details. Check filter and list bounds at narrow width. Run the focused
trace suite and native presentation checks after the parent's execution window
opens. This slice does not change shared primitives, live workflow logs, span
lanes, span details, JSON copy, or Ask attachment behavior.
