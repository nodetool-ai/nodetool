# Native node editor visual comparison

The comparison reads observations exported from real web and Qt components, and
measures rendered pixels from both captures. Production tokens remain independent. No production token imports or automatic
production token rewrites occur.

## Artifact interface

Each exporter accepts `--out <directory>` and writes `manifest.json`:

```json
{"version":1,"surface":"web","environment":{"dpr":1,"uiScale":1,"textScale":1,"locale":"en"},"cases":[{"id":"button-default","scheme":"dark","state":"default","image":"button-default-dark.png","source":"web/src/components/ui_primitives/Button.tsx","evidence":"live-property","metrics":{"width":100,"height":32,"font.family":"Arial","font.size":14,"font.weight":400,"color":"#ffffffff","border.width":1,"border.radius":4,"padding.top":4,"padding.right":8,"padding.bottom":4,"padding.left":8,"gap":null}}]}
```

Qt uses `surface: "qt"`. Images are relative PNG paths. Sizes are logical
pixels, colors are `#rrggbbaa`, and unavailable metrics are `null`. Exporters
must report observations, never substitute desired token values. Environment
fields `dpr`, `uiScale`, `textScale`, and `locale` are required. Additional
platform, renderer, and font information is retained in the report. Each case may export `captureBounds` with positive logical `width` and
`height`. PNG dimensions are validated against these bounds at DPR 1, falling
back to component metrics for older manifests. Web crops round bounds outward
to integer pixels and include a two-pixel margin to preserve outlines. Component metrics remain the
actual control measurements, even when the capture includes surrounding line
boxes or an outline. The web inspector case captures the outlined field only,
matching the Qt inspector field. The row label is outside both captures.

Text padding can be signed. In particular, Qt text uses negative bottom
padding to center glyphs within proportional line height, as specified in the
[native text rules](../native/ui_primitives/DESIGN.md#type-and-spacing).

Connections compare `stroke.width` and `stroke.color`. Their layout-dependent
extents are diagnostic observations, not style differences. `font.stack` and
`qt.*` fields remain in the raw observations as diagnostics and do not create
shared-metric failures. Unavailable measurements remain null.

## Evidence kinds

The report separates three kinds of evidence and counts them in `evidence`:

| Kind | Source | What it shows |
| --- | --- | --- |
| `observed` | Web computed styles and properties read from live Qt controls | The value a live control reports |
| `declared` | Canvas painter constants, marked `"evidence": "painter-constant"` | The value the code intends, not what was drawn |
| `pixels` | `measurePixels` applied to both PNG files by the report | What was actually rendered |

Node, port, and wire metrics are `declared` because the canvas has no live
properties. Treat a passing `declared` metric as intent, and rely on the matching
`pixels` probes for rendered evidence. A case's probes are:

- `pixel.width`, `pixel.height`, `pixel.fill`, `pixel.ink`, and `pixel.edge` for
  controls and cards.
- `pixel.fill` and `pixel.coreWidth` for ports.
- `pixel.stroke` and `pixel.strokeWidth` for wires.

Every Qt case captures production components with fixture data. The canvas field
has no live focus or disabled state, so the three `text-field` cases capture the
inspector's text field. Those cases are expected to differ, because the web
fixture measures its node-scope field.

Required IDs in both dark and light: `button-default`, `button-primary`,
`button-disabled`, `text-field`, `text-field-focus`, `text-field-disabled`,
`text-label`, `text-caption`, `surface-panel`, `node-card`, `node-selected`,
`port-input`, `port-output`, `connection`, `catalog-row`, `inspector-field`.
State must be nonempty and match between paired observations. Fixture labels
are English: Run / Prompt / Sample text / Text / output.

## Compare existing captures

```bash
node native/node-editor/scripts/compare-visuals.mjs --web /tmp/visual/web --qt /tmp/visual/qt --out /tmp/visual/report
node native/node-editor/scripts/compare-visuals.mjs --web /tmp/visual/web --qt /tmp/visual/qt --out /tmp/visual/report --check
node --test native/node-editor/scripts/compare-visuals.test.mjs
```

The report contains embedded images, side-by-side views, an opacity overlay,
repository source paths, and metric deltas grouped by colors, borders, fonts, and spacing.
`report.json` is machine-readable. A difference caused by the web fixture carries
`webFixtureGap` and stays different. Missing cases and measurements have separate
counts from passing measurements. `--check` fails on missing coverage,
incompatible inputs, unmeasured metrics, or differing measurements. It still
writes the report so initial mismatches remain inspectable.

Numeric tolerance defaults to 0.5 logical pixels. Font weight and strings must
match exactly. Colors tolerate one unit per RGBA channel. Pixel probes tolerate
one pixel of size or stroke width, four units per channel of color, and 24 units
per channel of text ink, because font antialiasing differs across renderers.
These tolerances are reported, not used to modify captures. `--check` also fails
on differing or unmeasured pixel probes.

## Capture and tune

```bash
node native/node-editor/scripts/visual-compare.mjs --qt-binary /absolute/path/to/capture-binary --web-url http://localhost:5173 --out /tmp/visual
```

The orchestrator invokes the web capture script and Qt executable with argument
arrays. The Qt executable receives `--out /tmp/visual/qt`. It then compares
captures into `/tmp/visual/report`. The web entry point is
[`web/scripts/capture-visual-compare.mjs`](../web/scripts/capture-visual-compare.mjs).
Without `--web-url`, it starts a temporary Vite server. With a URL, the
orchestrator opens `visual-compare.html` relative to that URL. Build the Qt
`node_editor_visual_capture` target in the node editor CMake build before
running the orchestrator. Capture failures stop orchestration with their exit status.

Environment metadata is collapsed above the screenshots. Source paths identify
local files and do not imply that uncommitted files exist on upstream main.

Inspect environment and missing coverage first. Compare measured colors,
borders, fonts, and spacing, then change the owning production component or
its platform's tokens. Recapture both surfaces after changes. Never fill an
unavailable measurement with a guessed value or normalize away a mismatch.

## Whole-window captures

Component cases do not show window layout. Whole-window captures compare the
web editor and the native window on one fixture, at the same logical sizes and
states. The [whole-window comparison](../native/node-editor/docs/parity.md#whole-window-comparison)
lists the states, the differences and their status.

Start the documentation backend and Vite on free ports. The backend seeds an
in-memory database, so the capture leaves no workflows behind.

```bash
PORT=7791 METADATA_ROOTS="" node_modules/.bin/tsx --conditions nodetool-dev packages/websocket/src/screenshot-server.ts
(cd web && PROXY_API_TARGET=http://127.0.0.1:7791 ../node_modules/.bin/vite --host 127.0.0.1 --port 3091 --strictPort)
node native/node-editor/scripts/capture-web-window-parity.mjs --web http://127.0.0.1:3091 --api http://127.0.0.1:7791 --out /tmp/window/web
NODETOOL_WINDOW_PARITY_CAPTURE_DIR=/tmp/window/native NODETOOL_WINDOW_PARITY_SERVER=http://127.0.0.1:7791 \
  <build>/node_editor_window_parity_tests captures
```

The web script and `WindowParityTest` read
`native/node-editor/tests/ui/WindowParityFixture.json` and apply the same run
messages. Without `NODETOOL_WINDOW_PARITY_SERVER` the native test runs offline,
so the connection state and catalog differ from the web capture.

## Known deviations

The web fixture does not load `handle_edge_tooltip.css` or `useProcessedEdges`,
so some of its measurements differ from production. Qt follows the production
source, and the report labels these with `webFixtureGap`:

| Case | Fixture | Qt and production source |
| --- | --- | --- |
| `port-*` | 6 wide with a 1 border | 12 wide with a 2 ring in the node background (`--handle_width`) |
| `connection` | React Flow default gray, width 1 | Output type color at 50%, width 1.5 |
| `catalog-row` | The older `NodeItem`, 34 tall | `NodeLibraryRow`, 40 tall with a namespace line |

Other reported differences are native rendering or capture context:

- `text-field*` and `inspector-field` fill a different surface. The web fixture
  sits on the page, and Qt sits on the inspector panel, so the translucent fill
  composites differently. The field is also wider there.
- `text-label` and `text-caption` keep the native `Ui.Text` line height.
- `surface-panel` captures the zoom readout, the bordered surface in production.
  Its size and content differ from the fixture's `Surface`.

The web bundles Inter at 200, 300, 400, and 600, so a CSS weight of 500 renders
with the 400 face. Editor panels and canvas text use the 400 face where the web
displays it. `NodeButton` keeps the declared 500.

These web features have no native counterpart yet: the chat composer, project
tabs, node drag from the catalog, node width resizing and its corner mark, the
Agent control handles, canvas editing, the run selected and cost footer in the
inspector, connectable-handle dimming during a drag, handle hover scale, and the
selected-node action toolbar. Floating surfaces draw no elevation shadow, and the
selected card approximates the web's blur with stacked outlines. The comparison
checks components. Whole-window captures are visual evidence, and
`WindowParityTest` asserts the differences fixed from them.
