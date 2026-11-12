# Preview node parity

This page lists the gaps between the native Preview card and the web
[`PreviewNode`](../../../web/src/components/node/PreviewNode/PreviewNode.tsx).
The web card hands any value to
[`OutputRenderer`](../../../web/src/components/node/OutputRenderer.tsx), which
picks a renderer from the value type. The native card draws a placeholder in
[`layoutPreview`](../src/graph/CardBodies.cpp) and overlays
[`CanvasMedia.qml`](../qml/CanvasMedia.qml) on `resultRect`. That overlay holds
either a [`MediaGallery`](../qml/MediaGallery.qml) or a
[`RichOutput`](../qml/RichOutput.qml), chosen in
[`CanvasMediaPresenter`](../src/graph/CanvasMediaPresenter.cpp).

## What matches

- The card defaults to 400×300, resizes down to the web minimum, and keeps the
  value handle and the output on the header row.
- The empty state shows "Run to preview connected data" with the visibility
  icon, and it follows the card size.
- Image, video and audio values show in a compact gallery. Text, tool calls,
  dataframes, image comparisons, objects, sequences and streamed PCM audio show
  in `RichOutput`.

## Gaps

### G1. Renderer coverage

[`RunOutputModel`](../src/run/RunOutputModel.cpp) emits these renderers:
`text`, `tool_call`, `dataframe`, `image_comparison`, `plotly`, `object`,
`sequence`, `pcm`, `json` and `generic`. Booleans, datetimes and emails
show as formatted text. The web `OutputRenderer` also has a case for
each type below. The native card shows these as generic or object output:

| Web type | Web result | Native result |
|---|---|---|
| `plotly_config` | Interactive chart | Notice and raw configuration |
| `html` | Rendered HTML | Not rendered |
| `document` | Document viewer | Not rendered |
| `model_3d` | 3D viewer | Not rendered |
| `sketch` | Sketch thumbnail and open action | Not rendered |
| `timeline` | Timeline summary and open action | Not rendered |
| `np_array` | Tensor table | Object fields |
| `task`, `task_plan`, `calendar_event` | Structured cards | Object fields |
| `segmentation_result`, `classification_result` | Masks and labelled scores | Object fields |
| `svg_element` | Rendered SVG | Not rendered |

### G2. Mixed arrays

The web `array` case renders each item inline with its own renderer. The native
card puts the items of an array with media in a `MediaGallery` grid. Image tiles
show a thumbnail. Text tiles show at most four lines. Video and audio tiles show
only a label until you open them. An array without media shows as a `RichOutput`
sequence. The gap is presentation only: the native grid hides text and audio
content until you open a tile.

### G3. Value sources

The web card picks the first available value in this order:

1. The Preview node's own stream buffer for the focused job.
2. The `value` property of a `nodetool.input.*` or `nodetool.constant.*` source,
   which shows a value without a run.
3. The saved assets of the source's last job for the wired handle, which keeps
   the preview after a reload.
4. The Preview node's settled generation.

The native card covers sources 1 to 3. `EditorWindow::syncSourcePreviews` reads
the `value` of an input or constant node wired to the Preview `value` handle.
For other sources of a saved workflow,
[`PreviewSourceAssets`](../src/run/PreviewSourceAssets.cpp) lists the source's
saved assets and keeps the most recent job for the wired handle. Runtime output
of the Preview node takes precedence over both. Verify source 1 for streamed
text: the native card must accumulate chunks and not show one final object.

### G4. Card actions

The web card shows Download, Add to assets and Copy buttons on hover. They are
always visible on touch devices. The native Preview card shows the same three
buttons on hover for rich output. They act on the displayed text: Download
writes a `.txt` or `.json` file, Add to assets uploads that file, and Copy puts
the text on the clipboard. A Preview gallery offers Save to assets for every
media kind, next to the existing Download and Copy. The web downloads a
multi-item value as one archive. The native card saves one item at a time.

### G5. Scroll and focus

The web content scrolls only after a click focuses it, and never for a single
image or video. This keeps the canvas wheel for zoom. The native rich output
scrolls only while it holds the focus. A click into it gives it the focus, and
a click on the canvas takes the focus away. A wheel that no output takes goes
on to the canvas. A dataframe table still scrolls without a click.

### G6. Text density

The web card renders output text and table cells at `fontSizeSmaller`, and its
table rows fit their content. `RichOutput` uses the output-panel sizes.

## Suggested order

1. G3, because a Preview that is empty after a reload or before a run looks broken.
2. G2 and G1 `html` and `svg_element`, because they need no new viewer.
3. G4 and G5.
4. The remaining G1 viewers: plots, documents, 3D, sketch and timeline.
