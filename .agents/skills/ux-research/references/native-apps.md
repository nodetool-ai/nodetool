# Studies of the native apps

This page is for the researcher. Never give it to a participant.

A study of a native Qt app (the chat app, the node editor, or the timeline
editor under [`native/`](../../../../native/AGENTS.md)) follows the same
method as a web study: plan, recruit, pilot, run, take notes, synthesize, read
out, and follow up. Only the participant's surface changes. The browser becomes
a disposable Linux desktop, and the runner becomes
`web/tests/agentic-qa/runNativeParticipant.ts`.

Both runners share the session boundary in
`web/tests/agentic-qa/participantLoop.ts`: the isolated SDK options, the init
audit, the limits, and the files a session writes. The knowledge boundary in
agentic-qa [section 3](../../agentic-qa/SKILL.md#3-enforce-the-knowledge-boundary)
applies unchanged.

## What the participant gets

| Boundary | How the desktop runner enforces it |
|---|---|
| Screen | A fresh Xvfb display at the packet's `screen` size (1440 × 900 by default), with the Openbox window manager and a plain grey desktop. Screenshots are the whole screen. |
| Windows | Title bars with maximize and close buttons. No taskbar, start menu, root menu, or minimize button, so no window can be lost. Alt+Tab switches windows and Alt+F4 closes one. The app's first window opens maximized unless the packet sets `window: "as-opened"`. |
| Input | Coordinate click (left, middle, right, up to three clicks), hover, drag, mouse wheel, typing at one key every 15 ms, key presses in the browser runner's spelling (`Enter`, `Control+A`), bounded wait, and `open_app` to start the app again after it closed. Input goes through XTest, as a real mouse and keyboard do. |
| Receipt | The screenshot and its ID, the active window's title, the open windows' titles, windows that opened or closed, and "The app closed." when the process ends. |
| Home | A new home folder per session, so the app starts in its first-run state with no settings. The packet's `assets` are copied into its `Documents` folder, and the app's file dialogs find them there. |
| Other programs | `xdg-open`, `BROWSER`, and the desktop openers are stubs. A link that would open a browser is reported as "The app tried to open a web page (origin) in a web browser … it did not open", as the browser runner reports a blocked navigation. The request is in `private/desktop.jsonl`. |
| Host session | The app does not inherit the host's `XDG_RUNTIME_DIR`, desktop, Wayland display, or `NODETOOL_TOKEN`. |

The participant never receives a widget tree, an accessibility tree, QML
object names, or the app's log. The app's stdout and stderr go to
`private/app.log`.

## Prepare the host

The runner needs Linux with X11 tools. On Debian or Ubuntu:

```bash
apt-get install xvfb openbox xdotool wmctrl imagemagick libxcb-cursor0
```

`npm run test:agentic-qa` (from `web/`) starts a real desktop and checks the
receipts, the window events, the open-request stub, and the key mapping.

Build the apps with Qt 6.12, as each app's README describes. CI installs Qt
with `aqtinstall` from download.qt.io. In a sandbox that blocks that host,
conda-forge's `qt6-main` and `qt6-multimedia` packages are the same release:

```bash
micromamba create -p /opt/qt6 -c conda-forge "qt6-main=6.12.0" "qt6-multimedia=6.12.0"
```

Pass `-DCMAKE_PREFIX_PATH=/opt/qt6` to CMake, and set
`PKG_CONFIG_PATH=/opt/qt6/lib/pkgconfig` for the timeline's FFmpeg and the node
editor's image libraries (`libvips=8.18.7`, `tesseract`, `libwebp=1.6.0`,
`leptonica`, `glib`, all on conda-forge).
The node editor fetches its dependencies with CMake `FetchContent`. Where
sqlite.org or GitHub archive downloads are blocked, point CMake at local copies:
`-DFETCHCONTENT_SOURCE_DIR_SQLITE_AMALGAMATION=node_modules/better-sqlite3/deps/sqlite3`
(the same SQLite release) and `-DFETCHCONTENT_SOURCE_DIR_STB=<a git clone of stb at the pinned commit>`.
Build the node editor with Clang (`-DCMAKE_CXX_COMPILER=clang++`): GCC 13
stops on the graph runner with an internal compiler error. A binary linked
against conda-forge libraries needs `LD_LIBRARY_PATH=/opt/qt6/lib`, which the
packet's `app.env` passes.

The presets in `web/tests/agentic-qa/nativeApps.ts` expect these binaries and
print the build command when one is missing:

| Preset | Binary | Connects with |
|---|---|---|
| `chat` | `native/chat/build/nodetool-chat` | `--server <server>` |
| `node-editor` | `native/node-editor/build/nodetool-node-editor` | `--server <server>`, and `--workflow <document>` when given. `NODETOOL_SERVER_URL` stops it from starting a bundled server. |
| `timeline` | `native/timeline/build/nodetool-timeline` | `<server>/#timeline=<document>` when given. The Assistant panel reads `NODETOOL_CHAT_SERVER`. |

## Start the backend

A native app talks to the server directly, so start only the backend:

```bash
cd web
npx tsx tests/agentic-qa/serveApp.ts --state working-run --no-web
```

The states, the fake runtime, and its fixture artifacts are the ones in
agentic-qa [runtime.md](../../agentic-qa/references/runtime.md#disposable-app).
Pick the state each task needs. A chat question needs a connected provider
(`working-run`), and a timeline task needs `timeline`, whose timeline id
(`tl-city-night`) goes in the packet's `document`. The timeline state's photos
come from `npm run media:pull`. Without them the backend stops at start, and
placeholder images put in their place show on screen as content. Reset the backend between sessions with
`curl -X POST http://127.0.0.1:7790/api/test/reset`. The app keeps nothing
between sessions, because each one gets a new home folder.

## Packet

```json
{
  "sessionId": "chat-p1",
  "kind": "task",
  "app": { "preset": "chat", "server": "http://127.0.0.1:7790" },
  "persona": "An adult who uses desktop programs and websites every day. You have not used this program before.",
  "goal": "1. Ask the program a question of your own and read the answer.\n2. Later you want to come back to that conversation. Close the program, open it again, and find what you asked.",
  "maxActions": 30,
  "maxMinutes": 12,
  "permittedActions": "This is a disposable test copy. You may create, edit, and send things inside it. Do not enter real personal data, sign in to other sites, or pay.",
  "assets": [{ "name": "holiday-photo.jpg", "path": "/abs/path/holiday-photo.jpg" }],
  "screen": { "width": 1440, "height": 900 }
}
```

`app` is a preset with `server`, an optional `document` (a workflow or timeline
id), an optional `binary` for another build such as a sanitizer build, and an
optional `env` added to the app's environment. It
can instead be `{ "command", "args", "env" }` for any X11 program. The
participant sees none of it. `persona`, `goal`, `permittedActions`, `assets`,
and `credentials` follow the web packet's rules: no product terms, feature
names, or expected steps. Personas from
[study-plan.md](study-plan.md#personas) that say "websites and web apps" read
better as "desktop programs and websites" here. A laptop screen such as
1280 × 720 shows layout faults, as the web viewport does.

## Run

```bash
cd web
npx tsx tests/agentic-qa/runNativeParticipant.ts \
  --packet ux-research-runs/<study>/packets/<session>.json \
  --out ux-research-runs/<study>/<session>
```

The default protocol is this skill's
[participant-desktop.md](participant-desktop.md), the think-aloud protocol with
desktop wording. `--protocol` replaces it. Authentication and the context probe
work as for the browser runner.

Run sessions in series against one backend, and reset it between them. Each
session starts its own display, so sessions against different backends can run
side by side.

## Output

The files are those of the browser runner in agentic-qa
[runtime.md](../../agentic-qa/references/runtime.md#output), with these
differences:

| File | Content |
|---|---|
| `contract.json` | `desktop` in place of `browser`: screen, window mode, and the app's command, arguments, and environment overrides |
| `summary.json` | `desktopMs` in place of `browserMs` |
| `private/app.log` | The app's stdout and stderr |
| `private/desktop.jsonl` | The display, each app launch and exit with its code or signal, open requests, and tool errors |

Read `private/` only after the blind record is frozen, as in agentic-qa
[section 7](../../agentic-qa/SKILL.md#7-diagnose-only-after-the-blind-record-is-frozen).
An app exit with a signal in `desktop.jsonl` is a crash: report it as a defect
with its screenshot.

## Limits

The desktop is Linux under X11 with Openbox, not a participant's macOS or
Windows desktop. Native dialogs, menus, fonts, and the title bar look like that
desktop, and keyboard shortcuts use Control. Treat findings about platform
conventions, such as where a menu bar sits, as questions for a study on that
platform. Rendering is in software, so a session cannot judge playback
smoothness or GPU-only effects.
