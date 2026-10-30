# Native chat

A C++20 and Qt Quick chat component, exported as `NodeTool.Chat`, with a
standalone development app and an opt-in native timeline host. The server owns
agent execution and stored conversations. The UI follows the
[Qt chat tutorial](https://doc.qt.io/qt-6/qtquickcontrols-chattutorial-example.html)
with a C++ model and server-backed threads in place of local SQL contacts.

See the [contract](docs/CONTRACT.md), [parity checklist](docs/PARITY.md), and
[implementation plan](docs/PLAN.md) for supported interactions and limits.
Measured results and remaining acceptance work are in
[verification evidence](docs/VERIFICATION.md).

## Build and verify

Requires Qt 6.12 with Quick Controls, Network, WebSockets, Test and QuickTest,
CMake, Ninja, and the repository's Node dependencies. Chat uses public Qt APIs
and does not depend on FFmpeg or timeline internals.

```bash
node native/chat/scripts/check.mjs
```

The check locates Qt under `~/qt/6.12.*` or uses `CMAKE_PREFIX_PATH`, configures
and builds with two jobs, runs CTest offscreen, then runs TypeScript fixture
conformance. Missing dependencies fail the check. Set `NODETOOL_CHAT_BUILD_DIR`
to use another build directory.

```bash
cmake -S native/chat -B native/chat/build -G Ninja -DCMAKE_PREFIX_PATH="$HOME/qt/6.12.0/gcc_64"
cmake --build native/chat/build --parallel 2
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir native/chat/build --output-on-failure
native/chat/build/nodetool-chat --server http://127.0.0.1:7777
```

Use `NODETOOL_TOKEN` for an authenticated server. Tokens stay in memory and are
not written to settings. The app also offers a connection form. Provider keys
remain on the server. Use a TLS URL for remote connections.

The command line supports `--replay events.json` for a state dump and
`--screenshot output.png` for an offscreen screenshot. Run GUI checks with
`QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software`.
Replay accepts an event array or the shared fixture object. Combine the options
to capture the resulting conversation:

```bash
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software native/chat/build/nodetool-chat \
  --replay native/chat/fixtures/streaming.json --screenshot native/chat/build/conversation.png
```

The composer keeps Enter for newlines and uses Ctrl+Enter or Cmd+Enter to send.
This avoids submitting text during IME composition. The model button in the
composer opens the provider and model fields. Both are optional and use server defaults when empty. In a narrow dock, chat opens
the conversation first. The Chats button opens the thread list.

## State and media bounds

Each loaded thread retains at most 10,000 messages. The session accepts at most
500 thread states and releases inactive idle histories after eight visited
histories, while keeping drafts. Selected and running histories stay loaded.
Drafts are limited to 64 KiB. `unloadThread` releases an inactive history.
Message text is shown in selectable 4,096-character sections so very large
messages do not block layout. Previous and Next expose the remaining sections,
and Copy message copies the complete text.

Uploads are limited to 32 MiB and can be canceled. Image previews use the
authenticated same-origin boundary, reject SVG, and limit decoded dimensions
to 16 million pixels. At most four image fetches run together and projected
preview data has a 32 MiB budget. Other media remains readable as structured
content. Account changes clear protected state and abort outstanding requests.

Reconnect is manual. Uncertain replay text is withheld until an authoritative
assistant message arrives, rather than appended to a possibly complete reply.
Completed host-tool results are retained for the session, with a 1,024-call
limit, to prevent repeated editor mutations on replay. Calls beyond that limit
fail visibly.

## Timeline integration

Configure `native/timeline` with `-DNT_ENABLE_CHAT=ON` to embed ChatPanel. The
option defaults off while parity and platform acceptance remain incomplete.
The host uses existing timeline commands and advertises only its supported
tools. Standalone chat returns an explicit unsupported result for editor tools.

## Packaging and platform acceptance

```bash
cmake --install native/chat/build --prefix native/chat/install
```

Qt's deployment script installs the app, QML imports and Qt runtime plugins on
supported host platforms. Distribution must include the relevant Qt and font
licenses. Inspect the installed artifact's platform plugin and TLS backend on
the target machine. A successful local build does not establish macOS or
Windows support. Installed-app smoke tests, real IME, screen-reader checks, and
input-to-paint measurements are required before declaring a platform supported.
