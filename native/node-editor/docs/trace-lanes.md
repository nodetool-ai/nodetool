# Native trace lanes

The span rows follow `SpanLane` in
[`TracePanel.tsx`](../../../web/src/components/panels/TracePanel.tsx).
Browser and server spans occupy separate named lanes. Each lane aligns name,
status, duration and timeline columns. Rows are 32 logical pixels high, headers
are 28, and the fixed status and duration columns are 64 and 128 pixels.
Native metrics scale these dimensions with the rest of the interface.

The controller retains the displayed trace's shared time horizon. Bars use its
existing normalized offset and width, including the minimum half-percent width
for zero-duration spans. Status selects the error, primary or disabled ink.
Minimum-width markers stay inside the track at its right endpoint.
The timeline exposes the complete span description to accessibility tools.
Names remain plain text. Indentation stops at depth 16 and shrinks when needed
to retain label space. The whole span row remains an inspection target when
labels are clipped. Focus uses the existing span request and account/workflow
guards.

Each lane virtualizes its rows and scrolls independently when the panel cannot
show them all. A focused row is revealed in its lane. Tests must check source
separation, shared bar proportions, minimum-width spans, aligned columns,
pointer and keyboard focus, narrow bounds and both themes. The existing host
isolation and raw-copy tests remain required.

The full trace panel still needs the web's responsive list/details split and
styled attribute/event details. Adding lanes does not establish complete trace
presentation parity.
