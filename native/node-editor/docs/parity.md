# Web parity checklist

The native editor uses the web editor as its presentation reference. This list
records implemented surfaces and remaining work without claiming full parity.

## Implemented

- Catalog search, metadata inspector, typed ports, node and wire geometry,
  selection, undo, file persistence, server open/save, and workflow Run/Stop.
- Live node status, progress, streamed text, results, errors, and image previews.
  Runtime projections do not edit workflow data. Running indicators stop when
  inactive, disconnected, or reduced motion is enabled.
- Run history with bounded text and typed image, video, and audio output.
  Media locators resolve through an authenticated session into private cache files.
- Aspect-preserving image and video surfaces. Qt Multimedia provides explicit
  play/pause, seek, time, volume, and mute for video and audio. Source, history,
  and server changes stop playback. Loading, failure, and retry are visible.

## Remaining

- Dynamic-port editing, groups, comments, subgraphs, reroutes, lineage,
  auto layout, partial runs, and compatible-node picking from loose wires.
- Validated structured, media, and model property editors and rich model selection.
- In-card video/audio controls, fullscreen media, playback speed, waveform
  visualization, galleries, and output download actions.
- Real-platform accessibility, IME, high-DPI, installation, and measured
  large-graph interaction latency acceptance.

Automated checks and their limits are described in the [README](../README.md).
