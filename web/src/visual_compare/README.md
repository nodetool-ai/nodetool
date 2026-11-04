# Web production component capture

Run from the repository root:

```sh
node web/scripts/capture-visual-compare.mjs --out /tmp/node-editor-visual-web
```

The exporter starts the existing Vite configuration and closes it after capture.
No backend is required. `--url http://localhost:3000/visual-compare.html` uses an
existing fixture server. `--case button-default` restricts capture to one case.
An unknown case fails. Install the Playwright Chromium browser if it is absent.

`cases.json` publishes the captured case IDs, states, and real component source
paths. The isolated HTML entry uses the production ThemeRoot, ThemeNodetool,
font imports, editor controls, and inspector primitives. No app route changes.
Fixtures use English labels and default theme text size and contrast. Browser
DPR, UI scale, and text scale are one. Focus is applied through the real input.

The exporter writes the agreed version-one manifest and relative PNGs. Metrics
come from computed styles and DOM rectangles. Input typography and padding come
from the input, background and bounds from its outlined control, and border
from the actual fieldset. Other cases measure the production root element.
`gap` is null when CSS reports `normal`. Colors are resolved to RGBA hex through
a browser canvas. Transparent backgrounds remain transparent rather than
claiming an ancestor's color. `font.family` is the first declared face, verified loaded with FontFaceSet status
and a weight/size/text check. `font.stack` preserves the computed CSS family list.
Environment font observations distinguish declared faces from loaded faces.
The Inter family must load, and font request errors fail capture.

The exporter awaits fonts and five stable animation frames of layout, disables
screenshot animations, rejects browser errors and failed requests, and writes
no success manifest on failure. Existing manifests are removed before capture.

The graph uses BaseNode, its real input/output handles, CustomEdge, the read-only
NodeStore, static MetadataStore entries, and the production GenerateCSS and canvas
styles. Context-menu, workflow-manager, and query providers satisfy component
reads. Queries are disabled and fresh browser contexts have no workflows to restore.
The catalog case renders NodeMenu's NodeItem. No production components are changed.

Graph entries use optional `fixture` and `selector` fields to capture production
subcomponents within the shared graph. The source input is unconnected, the source
output is connected to the selected target node, and the edge is unselected.
`environment.missingCoverage` is empty when all cases succeed.
