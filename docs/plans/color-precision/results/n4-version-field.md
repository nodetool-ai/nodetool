# A108: Native working color space version

A108 is complete with the authorized editor load-block fallback. The targeted
native build and tests passed.

`TimelineJson` accepts an absent `workingColorSpaceVersion` or numeric `1`.
Both continue through the existing rendering path. The parser retains the root
in `Timeline::raw`, so saves preserve `1` and do not add an absent field.
`FieldAudit` recognizes the field.

Every other explicit value is rejected before a model is constructed. This
includes `2`, `3`, higher versions, zero, negatives, fractions, strings, null,
booleans, arrays and objects. The message includes the original JSON value and
says that this build supports versions up to `1`. No version 2 rendering is
enabled. A103 remains the gate for that change.

## Routes

| Value | Editor | `--export` | `--stills` | Frame server |
| --- | --- | --- | --- | --- |
| Absent | Existing load and render path | Pixels, exit `0` | Pixels, exit `0` | Pixels, exit `0` after EOF |
| Numeric `1` | Existing load and render path | Pixels, exit `0` | Pixels, exit `0` | Pixels, exit `0` after EOF |
| `2`, `3`, higher versions | Load error, no render or save | Load error, exit `1`, no pixels | Load error, exit `1`, no pixels | JSON error response, exit `1`, no pixels |
| Invalid explicit value | Same load error | Same rejection | Same rejection | Same rejection |

The final test observed exit `0` for absent and `1` on all three CLI routes,
and exit `1` for `2`, `3`, zero, a negative, a fraction, a string, null, a
boolean, an array and an object on editor startup and all three CLI routes.
Higher versions use the same rejection branch but were not separately tested.
The accepted-version export check used PNG/ZIP delivery. No MP4 qualification
is claimed by this version-field task.

The editor uses its existing load-failure mechanism in `main.cpp`: print the
message to stderr and exit `1` before constructing the timeline model, renderer,
local saver or server autosave controller. This is the fallback authorized for
A108. Read-only document inspection and an in-window version report remain
missing. The startup path does not provide a read-only document mode. No QML or
UI primitive was changed. `native/timeline/AGENTS.md` is absent in this checkout.

## Native regression coverage

`tst_colorspaceversion` is registered in CMake for all platforms. It covers an
absent field, `1`, `2`, `3`, zero, a negative, a fraction, a string, null and a
boolean, an array and an object. It checks native parsing, raw preservation for accepted documents,
field auditing, actual autosave requests and reparsing the saved content. For
rejected documents it starts the editor and all three CLI routes, requires exit
`1` and the shared message, and checks that the input stays unchanged and no
pixel output is created. The frame-server case leaves stdin open to check that
a rejection terminates the process without waiting for the client. A second
case closes stdin immediately and checks the same rejection.

Autosave preservation of rejected values is exercised directly with source JSON
as the controller's document callback. The editor never opens those values or
installs a saver for them.

## Verification

Read `ntbuild` and `citest` before use. Built with:

```sh
/home/mg/Projects/nodetool-film/bin/ntbuild color-n2 tst_colorspaceversion tst_timelinejson
```

The first build waited at the disk gate. After space was freed, the targeted
build passed with exit `0`. Later rebuilds also waited at the helper's memory
gate. Neither gate was bypassed. The final native test command passed with exit `0`:

```sh
/home/mg/Projects/nodetool-film/bin/citest color-n2 '^tst_(colorspaceversion|timelinejson)$'
```

Both selected tests passed, along with CTest's required preferences setup.
`tst_timelinejson` covers existing parsing behavior. `tst_colorspaceversion`
covers the version matrix, autosave preservation and CLI behavior. The run used
Linux xcb with Vulkan/lavapipe through `citest`. macOS and Windows were not run.

`git diff --check` passed. Changed files were checked for stray control bytes.
TypeScript tests, typecheck, lint, `harness gate` and `/verify` were not run, as
requested. No push, rebase or PR was performed. `build-scene-asan/` was left alone.

The first integration run exposed a frame-server shutdown hang with stdin held
open. `std::exit` waits for C++ stream cleanup while the reader holds stdin's
stream lock. The fatal version rejection now flushes the response, releases
cached documents and uses `std::_Exit(1)`. The immediate-EOF and persistent-client
tests cover this distinction.

Accepted-document editor screenshot checks timed out after 30 seconds and
reported QML binding/radius errors. They are excluded from this boundary test.
Interactive editor rendering for absent and `1` is not verified here. Rejected
values still exercise normal editor startup and require the shared load error.
Accepted versions exercise real export, still capture and frame-server pixels.
