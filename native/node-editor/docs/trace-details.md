# Native trace details

Selected spans follow `SpanDetails` and `AttributeList` in
[`TracePanel.tsx`](../../../web/src/components/panels/TracePanel.tsx).
The details begin with the span name, status, duration, offset from the run
start, optional recorded USD cost and complete span ID. A recorded error is
shown separately. Attributes use sorted keys and separate key/value columns.
Strings remain literal text. Other JSON values retain indented formatting.
An empty attribute object says “None recorded”. Events retain their recorded
order and show their offset from the selected span, name and attributes.

The list and details sit beside each other when two usable columns fit.
Narrow panels stack them with independent scrolling and keep the details
header and actions reachable. The existing virtualized lanes and keyboard
selection remain in place. Changing selection resets the details scroll.
The details use native typography, theme roles and spacing through
`NodeTool.UiPrimitives`.

Display strings are bounded, plain text and wrap within the details column.
Large values scroll within a bounded read-only field. Attribute and event
collections are bounded for display, with an explicit omission notice.
Copy span JSON continues to copy the original complete record, independent
of display limits. Scope changes clear both presentation and original copy
content through the existing controller guards.

Native interaction tests cover structured metadata, sorted attributes,
event offsets, empty attributes, literal markup, display limits, original
JSON copying, wide and narrow bounds, scrolling and selection reset.
Host account/workflow isolation and lane virtualization tests remain required.

“Ask agent” emits the complete selected run ID and optional span ID only on
user activation. The host uses its established run-chat context attachment,
including the selected log’s span when present. The native host owns chat
thread creation and account/workflow isolation.
