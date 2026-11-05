# Native working color space version: A107 and B222

The native version boundary still supports only an absent
`workingColorSpaceVersion` or numeric `1`. No version 2 rendering or FP16 is
enabled by this work.

## Routes

| Value | Editor, local or server-backed | `--export` | `--stills` | Frame server |
| --- | --- | --- | --- | --- |
| Absent | Existing editor and render path | Pixels, exit `0` | Pixels, exit `0` | Pixels, exit `0` after EOF |
| Numeric `1` | Existing editor and render path | Pixels, exit `0` | Pixels, exit `0` | Pixels, exit `0` after EOF |
| `2`, `3` | Report window, no timeline model, rendering or saving | Existing error, exit `1`, no pixels | Existing error, exit `1`, no pixels | Existing JSON error, exit `1`, no pixels |
| Invalid explicit value | Same report window, showing the JSON value | Same rejection | Same rejection | Same rejection |

For version 2 the window says:

> This timeline uses color version 2. This version of NodeTool supports up to version 1. Update NodeTool to edit or export it.

The report uses `Ui.Text`, `Ui.Theme` and `Ui.Metrics` in a separate QML root.
Startup returns into this window before constructing `TimelineModel`, the
media renderer, local saver or server autosave controller. Closing the report
ends the app normally. It offers no document actions. This is document
inspection limited to the version report, rather than a read-only timeline
editor. Other load failures retain their existing error path.

Server loading now carries the parser's version status through
`ServerOpenResult` and `loadTimelineSource`. The server loader may retain its
existing local raw-document backup and loader report. It does not save the
remote document or download its media on this rejection path.

## Shared fixtures and regression coverage

CMake provides `tst_colorspaceversion` the shared file
[`working-color-space-versions.json`](../../../../packages/timeline/tests/fixtures/working-color-space-versions.json).
CMake paths use forward slashes, including on Windows. The test reads the file
with `QFile`, rejects unreadable, malformed or empty fixtures, and creates its
absent, 1, 2 and 3 rows from it. Invalid-value rows remain native test cases:
zero, negative, fraction, string, null, boolean, array and object.

Each row checks native parsing and an actual `AutosaveController` HTTP request.
Absent stays absent and each explicit value stays unchanged. Accepted documents
also retain their raw JSON through parse and reparsing the autosave payload.
Unsupported values intentionally produce no renderable model. Their preservation
uses the source JSON as the autosave document callback, independently of the
editor, which installs no saver for them.

The earlier TypeScript half is recorded in
[A107](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
and uses the same fixture file. Its tests were not rerun in this native task.

The native route matrix checks accepted-version export, still and frame-server
pixels. Unsupported local opens capture the report, check for visible text and
no red source-image pixels, then open without capture and require the process
to stay alive. Each route checks byte-identical source JSON and no document
pixel outputs. Unsupported server-backed editor opens require the report and
assert no POST saves or asset queries. Both persistent-stdin and immediate-EOF
frame-server rejections retain their nonzero exit and exact prior error.
Accepted-version interactive editor rendering remains outside this test.

## Verification

Read `ntbuild` and `citest` before use. The targeted build passed with exit `0`:

```sh
/home/mg/Projects/nodetool-film/bin/ntbuild color-n2 tst_colorspaceversion
```

The native matrix passed with exit `0`, including CTest's required preferences
setup, using:

```sh
/home/mg/Projects/nodetool-film/bin/citest color-n2 '^tst_colorspaceversion$'
```

An empty shared fixture array deliberately failed the native data test with
CTest exit `8`. The original fixture bytes were restored before the final run.
This verifies the native shared-file guard. It does not repeat A107's protocol
schema omission experiment, which belongs to the earlier TypeScript half.

Both required QML audits passed:

```sh
python3 native/ui_primitives/tools/check_design.py --strict
python3 native/ui_primitives/tools/check_dependencies.py
```

Report screenshots were captured and inspected at 1280 × 720 and 960 × 1000:

```text
/home/mg/Projects/nodetool-film/tmp/color-a107-report/report-1280x720.png
/home/mg/Projects/nodetool-film/tmp/color-a107-report/report-960x1000.png
```

The text is visible without clipping at both sizes. Direct captures used
`XDG_CONFIG_HOME` and `TMPDIR` under the project `tmp` directory, xcb/Xvfb and
both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` set to
`/usr/share/vulkan/icd.d/lvp_icd.json`. `QSG_INFO` identified the adapter as
`llvmpipe (LLVM 23.1.3, 256 bits)`, Mesa 26.2.5. The tests use the same
Vulkan/lavapipe setup through `citest`.

`git diff --check` and a control-byte scan passed. TypeScript tests, typecheck,
lint, `harness gate` and `/verify` were not run, as requested. macOS and Windows
were not run. No push, rebase, merge or PR was performed.
`build-scene-asan/` was left alone.

Commits: `ff6dcaf3e8` shares the fixtures. `d3260fbab6` fixes B222 and adds its
native route coverage.
