# NodeToolVstHost

NodeToolVstHost hosts VST3 instruments and effects, plus AudioUnits on macOS, for the timeline. The
desktop app starts it as a child process (`electron/src/vstHost.ts`), so a
plug-in that crashes ends the helper and never the editor. The helper restarts
on the next request.

It renders audio offline, opens plugin editors, and exposes presets and parameters.

- **Offline render.** It plays note events through a plug-in and writes the
  result as planar stereo float32 to a file the caller names. Each render resets
  the plug-in and applies the track's saved state first, so the result depends
  only on that state and the notes.
- **Plug-in window.** It opens the plug-in's own editor in a native window and
  reports each change to the plug-in's state, so the timeline can save it.

The `listPresets`, `selectPreset`, `getParameters`, and `setParameters` commands
inspect or edit a loaded plugin. Mutations return base64 state for the timeline
to save. Parameter values are normalized to 0..1, or supplied as display text.

The JSON-line protocol is documented at the top of
[`source/VstHostMain.cpp`](source/VstHostMain.cpp). The render, state and scan
code is in [`source/VstHost.cpp`](source/VstHost.cpp).

## Build and test

The toolchain per platform is in
[Dev Environment § VST instrument host](../../docs/dev-environment.md#vst-instrument-host).
From `electron/`:

```bash
npm run build:vst-host            # build and stage electron/vst-host/NodeToolVstHost
npm run build:vst-host -- --test  # also build and run vst_host_test
```

The script fetches JUCE at a pinned tag on first configure. To build offline,
configure by hand with `-DJUCE_DIR=/path/to/JUCE`. `vst_host_test` loads a sine
instrument that the same build produces (`test/tone/`), renders it, and
round-trips its state, so it needs no third-party plug-in.

The desktop release builds the helper on each platform and electron-builder
packs it as `resources/vst-host/`. On macOS it is a universal binary, signed
and notarized with the app.

## Plug-in folders

The helper scans the standard VST3 folders below. On macOS it also enumerates
AudioUnits through the system component registry. Scan results include `format`
(`vst3` or `au`).

| Platform | Folders |
| --- | --- |
| macOS | `~/Library/Audio/Plug-Ins/VST3`, `/Library/Audio/Plug-Ins/VST3` |
| Windows | `C:\Program Files\Common Files\VST3` |
| Linux | `~/.vst3`, `/usr/lib/vst3`, `/usr/local/lib/vst3` |
