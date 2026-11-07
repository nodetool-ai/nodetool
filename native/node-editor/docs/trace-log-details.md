# Native trace log details

The log inspector follows `LogsView` and `AttributeList` in
[TracePanel.tsx](../../../web/src/components/panels/TracePanel.tsx).
Selecting a log shows its span name, timestamp, level and sorted attributes.
Markup remains literal text. The existing Ask agent action retains the selected
run and optional span, while Close clears only the selected log. The current
controller already supplies these values and bounds attribute strings.

Trace and Logs use one details column for the active view. A remembered span
selection remains available when returning to Trace, but cannot occupy the
Logs details column. Selected logs reuse the responsive split, with independent
scrolling and the existing bounded `TraceAttributeList`. Narrow layouts retain
a visible log row above the details. Changing the selected log resets its scroll.

Native tests must reproduce the old span pane remaining visible in Logs, then
verify structured literal attributes, run/span Ask signals, close behavior,
selection restoration, wide/narrow bounds and dark/light captures. Existing
account/workflow isolation and original span JSON copy checks remain required.
Log row virtualization, aligned log columns, the log span picker and status
pills remain separate visual parity work.
