# Native chat verification

## Reproduce

Run the component check from the repository root:

```bash
node native/chat/scripts/check.mjs
```

For a separately started, isolated NodeTool server, also run the real-server
round trip. This creates a synthetic thread, sends a deliberately invalid
provider/model selection to exercise the error path without a provider call,
and deletes the synthetic thread.

```bash
NODETOOL_CHAT_TEST_SERVER=http://127.0.0.1:17877 \
  ctest --test-dir native/chat/build --output-on-failure
```

The real-server case skips when the environment variable is absent. The
localhost HTTP/WebSocket mock tests always run and inspect actual requests,
text-mode negotiation, authentication headers, prompt fields, stop, approvals,
host results, reconnect, multipart upload, progress, failure, and cancellation.

## Evidence

A Release build with GCC, Qt 6.12.0, and the offscreen software renderer on
Omarchy x86_64 with an AMD Ryzen 5 3600 passed all four CTest targets. The final
run passed 39 Qt test cases, including the structured-parts model and paging
controls. The real-server case ran against
an isolated NodeTool process and database. The TypeScript conformance suite
passed against the production web reducer.

The conformance negative check changed the repeated-space event in
[streaming.json](../fixtures/streaming.json). The production-reducer suite
exited with status 1. Restoring the exact fixture bytes returned status 0.
The native suite also asserts that the corrupted delta changes its normalized
projection. Fixtures contain synthetic IDs and no credentials.

The model benchmark loaded the 10,000-message corpus in pages, retained the
configured 10,000-message bound, and completed in 84 ms in the recorded run.
It also checked that starting another turn evicts old history without
corrupting the previous message.

The rendered benchmark kept the full 128 KiB message in the model, appended
60 text updates, and observed two instantiated message delegates. It recorded
60 input-delivery-to-render samples with p95 6.19 ms. The GUI event-dispatch
busy-slice p95 was 0.001413 ms. These values describe that offscreen run and
are not physical input-to-paint latency or per-frame GUI work measurements.
The benchmark emits fresh machine metadata and measurements on every run.

The Linux install completed through Qt's deployment script. The installed
executable replayed the fixture and captured the conversation under Xvfb using
the deployed xcb platform plugin. The installation includes the OpenSSL TLS
backend and font licenses. This smoke used the installed executable rather
than the build-tree executable.

The visual layout follows the web
[thread styles](../../../web/src/components/chat/thread/ChatThreadView.styles.ts)
and [composer styles](../../../web/src/components/chat/composer/MediaChatComposer.styles.ts).
QML regressions cover the centered conversation/composer column, wrapping copy
actions, keyboard focus through the model popup, narrow navigation, and selected
text contrast. Synthetic multi-turn Markdown and code captures were inspected
in the standalone app and timeline dock, including narrow layouts.

Repository typecheck, lint, and the harness gate passed for the visual changes.
The aggregate `test:affected` run failed on the 60-second timeouts in
`packages/agents/tests/js-sandbox-engine.test.ts` and
`packages/agents/tests/js-sandbox-worker-engine.test.ts`. The earlier
game-runtime script-call budget failure did not recur. No agent or game-runtime
code was changed. A focused rerun passed the worker-engine file but still timed
out in the shared engine file. The aggregate check has not passed.
Repository checks used the Node version in [`.nvmrc`](../../../.nvmrc), with
`lsof` on `PATH` and temporary files on the home filesystem. The `/tmp` quota
caused copy and migration failures before that rerun. One native transport mock
run timed out waiting for a message. The complete native check passed on rerun.

## Timeline integration

The opt-in timeline application built successfully with chat enabled. Host
tests passed for document scope, full and short resource IDs, ambiguity,
undo/redo, save/reload, and preservation of unknown document fields. The audio
classification regression also passed.

```bash
cmake --build native/timeline/build-chat --target nodetool-timeline tst_chathost tst_audioengine --parallel 2
ctest --test-dir native/timeline/build-chat -R '^tst_chathost$' --output-on-failure
QT_QPA_PLATFORM=offscreen native/timeline/build-chat/tst_audioengine audioModeFromParsedOptions
node native/timeline/scripts/chat-integration.mjs --bin native/timeline/build-chat/nodetool-timeline --json
```

The integration harness passed through the real socket client, host dispatch,
timeline command, and local autosave. Replaying the same action ID returned two
identical results and left exactly one new marker. It then reopened the saved
document and captured the docked chat panel. The final image was inspected at
1280 × 720. Chat uses the existing right dock and preserves the timeline's
viewport width. Running the harness with `/usr/bin/true` instead of the app
failed as expected.

The Linux timeline capture used Vulkan on llvmpipe. OpenGL under Xvfb failed
context initialization on this host. These are functional checks and do not
establish GPU performance.
The visual-parity capture used explicit Xvfb display allocation after automatic
display selection failed before Qt could connect.

The original unbounded long-message rendering blocked the GUI during this
benchmark. Message rendering now pages long text into bounded sections with
full-text copy. A visible Quick Test clicks through the sections. Other Quick
Tests exercise multiline input, draft switching, reader scroll restoration,
narrow navigation, history loading, incomplete Markdown, exact code/message
clipboard contents, and accessible composer names. Repeated selection during
pending history loading was reproduced as three requests, then fixed and
retained as a one-request regression test.
Thread error isolation was also reproduced before fixing the session projection.

## Remaining acceptance work

A web benchmark using the same corpus, compositor/input-to-paint measurement,
thread-switch and media-heavy rendering benchmarks, process-memory reclamation
measurements, real IME composition, screen-reader operation, and installed
artifacts on macOS and Windows remain unverified.
These checks cannot be inferred from Linux offscreen tests. See
[the parity checklist](PARITY.md) before enabling native chat by default.

Shared TypeScript/C++ conformance compares text and turn state. Tool actions,
history pagination, uploads, and disconnects have separate Qt contract tests.
They are not yet part of the shared reducer fixture corpus.

## Changed files

- [AGENTS.md](../../../AGENTS.md)
- [native/chat/.gitignore](../.gitignore)
- [native/chat/AGENTS.md](../AGENTS.md)
- [native/chat/CLAUDE.md](../CLAUDE.md)
- [native/chat/CMakeLists.txt](../CMakeLists.txt)
- [native/chat/README.md](../README.md)
- [native/chat/docs/CONTRACT.md](CONTRACT.md)
- [native/chat/docs/PARITY.md](PARITY.md)
- [native/chat/docs/PLAN.md](PLAN.md)
- [native/chat/docs/VERIFICATION.md](VERIFICATION.md)
- [native/chat/fixtures/streaming.json](../fixtures/streaming.json)
- [native/chat/qml/ChatComposer.qml](../qml/ChatComposer.qml)
- [native/chat/qml/ChatPanel.qml](../qml/ChatPanel.qml)
- [native/chat/qml/ChatMetrics.qml](../qml/ChatMetrics.qml)
- [native/chat/qml/ConversationView.qml](../qml/ConversationView.qml)
- [native/chat/qml/Main.qml](../qml/Main.qml)
- [native/chat/qml/MessageDelegate.qml](../qml/MessageDelegate.qml)
- [native/chat/qml/ThreadList.qml](../qml/ThreadList.qml)
- [native/chat/scripts/check.mjs](../scripts/check.mjs)
- [native/chat/src/main.cpp](../src/main.cpp)
- [native/chat/src/model/MessageModel.cpp](../src/model/MessageModel.cpp)
- [native/chat/src/model/MessageModel.h](../src/model/MessageModel.h)
- [native/chat/src/model/ThreadModel.cpp](../src/model/ThreadModel.cpp)
- [native/chat/src/model/ThreadModel.h](../src/model/ThreadModel.h)
- [native/chat/src/runtime/ChatSession.cpp](../src/runtime/ChatSession.cpp)
- [native/chat/src/runtime/ChatSession.h](../src/runtime/ChatSession.h)
- [native/chat/src/server/ChatClient.cpp](../src/server/ChatClient.cpp)
- [native/chat/src/server/ChatClient.h](../src/server/ChatClient.h)
- [native/chat/tests/CMakeLists.txt](../tests/CMakeLists.txt)
- [native/chat/tests/ChatModelTests.cpp](../tests/ChatModelTests.cpp)
- [native/chat/tests/QuickTests.cpp](../tests/QuickTests.cpp)
- [native/chat/tests/TransportTests.cpp](../tests/TransportTests.cpp)
- [native/chat/tests/UiBench.cpp](../tests/UiBench.cpp)
- [native/chat/tests/conformance.test.ts](../tests/conformance.test.ts)
- [native/chat/tests/jest.config.ts](../tests/jest.config.ts)
- [native/chat/tests/qml/tst_ChatPanel.qml](../tests/qml/tst_ChatPanel.qml)
- [native/chat/tests/ui-bench.qml](../tests/ui-bench.qml)
- [native/timeline/CMakeLists.txt](../../timeline/CMakeLists.txt)
- [native/timeline/README.md](../../timeline/README.md)
- [native/timeline/qml/TimelineEditor.qml](../../timeline/qml/TimelineEditor.qml)
- [native/timeline/scripts/chat-integration.mjs](../../timeline/scripts/chat-integration.mjs)
- [native/timeline/src/audio/AudioMode.cpp](../../timeline/src/audio/AudioMode.cpp)
- [native/timeline/src/audio/AudioMode.h](../../timeline/src/audio/AudioMode.h)
- [native/timeline/src/chat/TimelineChatHost.cpp](../../timeline/src/chat/TimelineChatHost.cpp)
- [native/timeline/src/chat/TimelineChatHost.h](../../timeline/src/chat/TimelineChatHost.h)
- [native/timeline/src/chat/module.cmake](../../timeline/src/chat/module.cmake)
- [native/timeline/src/main.cpp](../../timeline/src/main.cpp)
- [native/timeline/tests/tst_audioengine.cpp](../../timeline/tests/tst_audioengine.cpp)
- [native/timeline/tests/tst_chathost.cpp](../../timeline/tests/tst_chathost.cpp)
- [packages/cli/src/harness/registry.ts](../../../packages/cli/src/harness/registry.ts)
- [packages/cli/tests/harness-registry.test.ts](../../../packages/cli/tests/harness-registry.test.ts)
- [scripts/__tests__/test-affected.test.mjs](../../../scripts/__tests__/test-affected.test.mjs)
- [scripts/test-affected.mjs](../../../scripts/test-affected.mjs)
