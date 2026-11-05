# A108: Native working color space version

A108 is implemented but not verified. Its checkbox remains open until the native
build and tests pass.

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
| Absent | Existing load and render path | Existing export path | Existing still path | Existing capture path |
| Numeric `1` | Existing load and render path | Existing export path | Existing still path | Existing capture path |
| `2`, `3`, higher versions | Load error, no render or save | Load error, exit `1`, no pixels | Load error, exit `1`, no pixels | JSON error response, exit `1`, no pixels |
| Invalid explicit value | Same load error | Same rejection | Same rejection | Same rejection |

The exit codes above describe the implementation. No new binary exit code has
yet been observed because the build is blocked.

The editor uses its existing load-failure mechanism in `main.cpp`: print the
message to stderr and exit `1` before constructing the timeline model, renderer,
local saver or server autosave controller. This is the fallback authorized for
A108. Read-only document inspection and an in-window version report remain
missing. The startup path does not provide a read-only document mode. No QML or
UI primitive was changed. `native/timeline/AGENTS.md` is absent in this checkout.

## Native regression coverage

`tst_colorspaceversion` is registered in CMake for all platforms. It covers an
absent field, `1`, `2`, `3`, zero, a negative, a fraction, a string, null and a
boolean. It checks native parsing, raw preservation for accepted documents,
field auditing, actual autosave requests and reparsing the saved content. For
rejected documents it starts the editor and all three CLI routes, requires exit
`1` and the shared message, and checks that the input stays unchanged and no
pixel output is created. The frame-server case leaves stdin open to check that
a rejection terminates the process without waiting for the client.

Autosave preservation of rejected values is exercised directly with source JSON
as the controller's document callback. The editor never opens those values or
installs a saver for them.

## Verification

Read `ntbuild` and `citest` before use. Attempted:

```sh
/home/mg/Projects/nodetool-film/bin/ntbuild color-n2 tst_colorspaceversion tst_timelinejson
```

The helper waits at its disk gate because the shared filesystem has less than
its required 20 GB free. The gate was not bypassed. Build and native tests have
not completed. The intended native test command is:

```sh
/home/mg/Projects/nodetool-film/bin/citest color-n2 '^tst_(colorspaceversion|timelinejson)$'
```

`git diff --check` passed. Changed files were checked for stray control bytes.
TypeScript tests, typecheck, lint, `harness gate` and `/verify` were not run, as
requested. No push, rebase or PR was performed. `build-scene-asan/` was left alone.
