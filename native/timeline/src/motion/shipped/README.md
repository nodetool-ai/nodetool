# Complete shipped example pixels

Run from the repository root with the Node version in `.nvmrc`:

```sh
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a node native/timeline/src/motion/shipped/oracle.mjs /path/to/nodetool-timeline cadence prism
node --test native/timeline/src/motion/shipped/oracle.test.mjs
```

The oracle loads each complete shipped document and retains every authored field,
including effects, groups, crop, masks and animation links. Package media resolve
to the checked-in source files. Golden import replaces those local paths with
scratch asset locators for the production web renderer. Each import uses its own
store via a guarded temporary copy of the existing importer, avoiding interference
with other golden runs. Media-free documents use the production CLI directly
with isolated home, database and asset directories. An exact document audit
rejects every other import change. The native renderer receives the same complete
local-source document. Golden import rejects skipped clips and missing stills.

Eight evenly spaced frames cover the complete duration without filtering out
unsupported treatments. A report records each frame's PSNR against a 40 dB
threshold. Reports and rendered pictures remain under `build/motion-shipped-*`.
A passing sample comparison does not establish equality at every frame or prove
full export parity. The report identifies the supplied native executable so an
owned application and an application with integration patches remain distinct.

The contract inspects real shipped clips and media, and rejects deleted effects,
missing clips and empty input. It runs without a server or media generation.

References use the guarded CLI copy from
[`tracking/reference.mjs`](../tracking/reference.mjs) so document projection
retains authored tempo and media tracks for both imported and media-free
examples. The shared CLI source is hash-checked and remains unchanged.

The scratch importer also accepts the original WAV score files. Its guarded
content-type adjustment is idempotent and rejects declaration drift. The shared
importer change is integrated in
[golden-import.mjs](../../../scripts/golden-import.mjs).
Audio clips and their fields remain in every complete document.

The raw oracle always reports every sampled picture at the original 40 dB
threshold. A separate scope audit checks the complete catalog, exact frame
lists, original documents and retained images. It permits only Prism frame 450
and its named floor layer after checking authored geometry and timing. It
rejects every other failure, missing comparison and render error. It preserves
the full report and its failing verdict.

```sh
node native/timeline/src/motion/shipped/audit.mjs /path/to/report.json
```
