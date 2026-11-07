# Native chat

**Navigation:** [Root AGENTS.md](../../AGENTS.md) → Native chat

Read [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md), the
[plan](docs/PLAN.md), and [contract](docs/CONTRACT.md) before changes.
Use C++20 and public Qt APIs. QObject children follow Qt ownership. Pass a
context object to lambda connections. Keep network reduction in C++, with
row-level model notifications on the GUI thread. QML renders state and invokes
session actions. It must not implement the wire protocol.

The server owns persisted history, agent execution, credentials, and approvals.
Never save a native projection over server messages. Preserve unknown payloads
and full resource IDs. Resolve media through the authenticated client boundary.
Clear protected state on account changes. Advertise only implemented host tools.

Follow the [native design specification](../ui_primitives/DESIGN.md) and
[UX guidelines](../../docs/UX_GUIDELINES.md). Use `NodeTool.UiPrimitives` for
chrome and keep chat layout metrics in chat. Embedded chat consumes its host's
theme settings. Keep drafts and scroll state outside message delegates.
Run GUI tests offscreen, never on the person's desktop.

Build and verification commands are in [README.md](README.md). Run native tests
and shared fixture conformance after protocol changes. A passing model benchmark
does not establish input-to-paint or platform accessibility performance.
