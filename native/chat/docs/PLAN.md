# Native chat implementation plan

Build a reusable C++20 and Qt Quick chat component under `native/chat`, with
a standalone application for development and a later integration into the
native timeline. Keep the NodeTool TypeScript server responsible for agent
execution, providers, permissions, and persisted conversations.

This sequence defines the implementation and its acceptance evidence. See
[the contract](CONTRACT.md) and [parity checklist](PARITY.md) for the inspected
server behavior and delivery scope.

## Starting points

The [native timeline design](../../timeline/docs/DESIGN.md) establishes the
desktop-client/server boundary and the approach of mapping React components
to QML. Its [build](../../timeline/CMakeLists.txt) and
[verification workflow](../../timeline/README.md) provide local conventions.
Use the same Qt minor version when linking chat into that application. Chat
itself should use public Qt APIs and should not inherit the timeline's FFmpeg
or private QRhi dependencies.

Use the [Qt Quick Controls chat tutorial](https://doc.qt.io/qt-6/qtquickcontrols-chattutorial-example.html)
for its Page, ListView, delegate, composer, and C++ model structure. Replace
its contacts with NodeTool threads. Use StackView for narrow-window
navigation. Persist conversations through NodeTool's server rather than
adopting the tutorial's local SQL conversation database.

The existing behavior to inspect and capture in fixtures lives in
[ChatView](../../../web/src/components/chat/containers/ChatView.tsx),
[chatProtocol](../../../web/src/core/chat/chatProtocol.ts),
[threadRuntime](../../../web/src/core/chat/threadRuntime.ts), and
[the threads router](../../../packages/websocket/src/trpc/routers/threads.ts).
The reducer handles mixed text, tool, planning, task, workflow, and generation
events. Runtime state belongs to individual threads. The current wire protocol includes `chat_seq` and `resume_chat`. Repeated
text must be retained, and replay deduplication must use sequence IDs rather
than content. An incomplete replay requires server-history reconciliation.

## Architecture decisions

- **D1.** Export a `NodeTool.Chat` QML module with a `ChatPanel` root Item.
  A small `ApplicationWindow` hosts it in the standalone executable. Keep
  window creation outside the component so the timeline can embed it.
- **D2.** Use C++ `QAbstractListModel` implementations for threads, messages,
  and structured message parts. Keep transport and state reduction out of
  QML delegates. Apply model changes on the GUI thread and update only
  affected rows and roles. Streaming must not reset the whole model.
- **D3.** Put authentication, HTTP calls, and the existing chat wire protocol
  behind `ChatClient`. Verify actual endpoints, envelopes, serialization,
  and resume semantics before implementing this boundary. Use Qt Network
  and Qt WebSockets with the server's required encoding. Do not assume the
  historical REST thread routes remain available because the current router
  is tRPC. Keep provider credentials on the server.
- **D4.** Preserve server IDs and unknown message payloads. Validate incoming
  fields and bound message sizes. Render unsupported content with an explicit
  fallback. Never overwrite server history with a partial native projection.
- **D5.** Keep connection status separate from per-thread turn status.
  Preserve drafts, attachments, scroll anchors, and unfinished turns while
  changing threads. Reconcile server history after reconnect. Never blindly
  resend an unacknowledged prompt or append replayed text to an uncertain
  partial response. Show an interrupted state when safe resume is unavailable.
- **D6.** Match NodeTool typography, spacing, colors, and interaction rules.
  Start from the timeline's QML theme conventions and the
  [design system](../../../docs/DESIGN.md) and
  [UX guidelines](../../../docs/UX_GUIDELINES.md). Extract shared theme code
  only when both native clients need it. Native rendering remains Qt Quick,
  including message text and controls.
- **D7.** Resolve asset identifiers through an authenticated media boundary.
  Do not assign `asset://` identifiers directly to QML image sources. Keep
  caches scoped to the account and clear protected content on logout. Open
  external links through an explicit scheme allowlist. Message content must
  never instantiate arbitrary QML or execute local commands.

## Delivery sequence

### A1. Capture the contract and baseline

Inventory ChatView, ChatThreadView, ChatInputSection, message renderers,
GlobalChatStore, ChatDraftStore, and frontend tool dispatch. Record each
user action and wire event as required for initial delivery or deferred.
Include provider/model selection, context attachments, approval requests,
media results, and editor-specific actions.

Capture sanitized event fixtures from the TypeScript implementation. Include
repeated chunks, concurrent threads, errors, cancellation, tool results,
history pagination, and disconnects. Record expected visible state using
existing reducer behavior. Inspect authentication and the timeline's server
client before deciding which connection code can be reused.

Exit: a reviewed contract, a parity checklist, deterministic fixtures, and
web measurements on the same long conversation used for native benchmarks.
Document unsupported backend capabilities rather than inventing client-side
guarantees.

### A2. Build the fixture-driven native component

Add CMake targets for the reusable module, standalone app, Qt Test, and Qt
Quick tests. Proposed structure:

```text
native/chat/
  CMakeLists.txt
  src/main.cpp
  src/model/ThreadModel.*
  src/model/MessageModel.*
  src/runtime/ChatSession.*
  src/server/ChatClient.*
  qml/ChatPanel.qml
  qml/ThreadList.qml
  qml/ConversationView.qml
  qml/MessageDelegate.qml
  qml/ChatComposer.qml
  tests/
  fixtures/
```

Implement thread navigation, plain text turns, timestamps, multiline input,
send/stop controls, loading, empty, and error states against a fake client.
Use a virtualized ListView. Follow the bottom only while the reader is at
the bottom. Preserve the visible message when prepending history or resizing.
Keep drafts outside delegates. Define Enter/Shift+Enter behavior and test IME
composition before enabling keyboard submission.

Exit: headless interaction tests can select a thread, type, send, stream,
stop, and switch back without losing the draft or scroll position.

### A3. Connect real threads and streaming

Implement authenticated thread/history loading, creation, prompt submission,
model selection, stop, and error reporting through ChatClient. Introduce a
testable event reducer and per-thread turn state. Batch visual notifications
at frame boundaries while retaining every text delta in order. Protect
against late replies after a thread switch or account change.

Port only the required presentation state logic. Run shared event fixtures
through TypeScript and C++ and compare normalized output after each event.
If existing helpers require browser state, isolate a test adapter rather
than duplicating expected outcomes by hand.

Exit: a local server round trip, concurrent-thread tests, and fixture
conformance pass. A disconnect during send produces no silent duplicate turn.

### A4. Implement agent interactions and rich messages

Add selectable Markdown, fenced code with copy, tool-call progress/results,
planning/task updates, and approval or clarification controls where the
contract requires them. Treat server-side action identifiers as authoritative
and prevent repeat submission while an action is pending. Preserve visible
errors and support retry only when the operation's semantics permit it.

Add attachments through the existing upload flow, with progress, cancellation,
failure recovery, and server IDs. Add image previews and media actions using
the media boundary. Test incomplete Markdown during streaming and large code
blocks. Use native media playback only where required by the parity checklist.

Expose host capabilities explicitly. Advertise only implemented `ui_` tools.
The standalone app must return an unsupported-capability result for editor
actions it cannot perform, and must never report that an edit succeeded.

Exit: each required checklist item has a deterministic interaction test.
Deferred content remains readable through a stated fallback and has no
nonfunctional action controls.

### A5. Embed in the native timeline

Link the QML module into the timeline and host ChatPanel in its editor layout.
Supply document/selection context through a small host interface. Connect
supported editor tools to existing timeline commands so undo, persistence,
and validation continue to apply. Avoid a second document mutation path.
Keep the same standalone app for isolated debugging.

Exit: a chat-driven supported edit changes the intended timeline, can be
undone, and survives save/reload. Closing chat disconnects its subscriptions
without interrupting timeline playback. Electron embedding is a separate
decision and is not required for this native-client integration.

### A6. Verify responsiveness and package

Benchmark paged histories representing 10,000 messages, a large individual
message, sustained streaming, thread switching, and media-heavy replies.
Measure GUI frame time, input latency, delegate count, and memory. Proposed
targets on a documented reference machine are p95 GUI work below 8 ms at
60 Hz and p95 input-to-paint below 50 ms. These are acceptance targets, not
claims about current behavior. Check that loaded history and media caches
stay within explicit bounds and memory returns after closing threads.

Test keyboard-only operation, focus restoration, screen-reader names,
selection/copy, contrast, narrow windows, scaling, and IME on each supported
desktop platform. Package required QML modules, platform plugins, fonts, and
TLS support. Smoke-test installed artifacts on macOS, Linux, and Windows
before declaring support for each platform.

Exit: native tests, conformance, performance thresholds, and installed-app
smoke checks pass. Keep the native client opt-in until its required parity
checklist passes.

## Verification and delivery rules

Follow [Harness-First Engineering](../../../docs/HARNESS_FIRST.md): expose
fixture replay, state dumps, screenshots, and benchmark output without a
foreground window. Register native chat checks in the affected-test mapping
and harness gate. Prove conformance checks fail on a deliberately corrupted
event before restoring it. Run GUI tests offscreen or under Xvfb.

For implementation changes, build packages first and run the mandatory
`npm run test:affected`, `npm run typecheck`, `npm run lint`, and
`npm run dev:nodetool -- harness gate --base origin/main`, plus the native
CMake/CTest targets. Add native area instructions with their required
CLAUDE.md sibling and root reachability when implementation begins.

Land A1 through A6 as reviewable changes with their exit evidence. A2 follows
A1, A3 follows A2, A4 follows A3, and A5 follows the required A4 interactions.
Add verification throughout and complete packaging in A6. Estimate dates
after A1 resolves protocol and parity scope.
