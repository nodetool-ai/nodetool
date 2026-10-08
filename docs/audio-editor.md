---
layout: page
title: "Audio Editor"
permalink: /audio-editor
description: "Trim, fade, normalize, reverse, and otherwise edit an audio asset as a waveform, then save it back as WAV."
---

The audio editor edits an audio asset in place. It decodes the file into samples in your browser, shows the waveform, and lets you cut, fade, normalize, reverse, and re-level a region. Every edit can be undone. **Save to audio** writes the result back to the asset as a WAV file.

> **Quick Access:** Open an audio asset in a workspace tab and click **Edit** in the View / Edit toggle at the top right of the tab bar.

Audio tabs have two modes. **View** shows the waveform viewer. **Edit** shows the editor described here. Switching back to **View** with the toggle, or clicking **Done**, keeps your unsaved edits in the editor until you close the tab.

---

## The layout

| Area | What it holds |
|---|---|
| Toolbar | Transport, zoom, region edits, undo and redo, **Save to audio**, **Done** |
| Waveform | The audio as a waveform, with the playhead and your selection |
| Footer | The selection start, end, and length on the left. The playhead time and total length on the right |

Times show as `minutes:seconds.milliseconds`. With no selection the footer reads "Drag to select · Click to seek".

If the asset cannot be fetched or decoded, the editor shows "Could not open audio editor" with the reason and a **Done** button.

---

## Select and play

- **Drag** across the waveform to select a region.
- **Click** to clear the selection and move the playhead to that point.

The transport buttons are **Play** (which becomes **Pause**), **Stop**, and **Loop**.

| Situation | Play does |
|---|---|
| A region is selected | Plays only the selection. **Stop** returns the playhead to the selection start |
| No selection | Plays from the playhead to the end of the audio. **Stop** returns the playhead to the start |
| **Loop** is on and a region is selected | Repeats the selection until you pause or stop |

Playback stops whenever the audio changes, including undo and redo.

---

## Zoom

**Zoom out**, **Zoom in**, and **Fit to window** sit beside a logarithmic zoom slider with a percentage readout. The zoom runs from 100 percent (the whole clip fits the window) to 6400 percent. Each button click changes the zoom by a factor of 1.5. When zoomed in, scroll the waveform sideways.

---

## Edit operations

Edits are destructive to the in-editor copy only. Nothing reaches the asset until you save.

Some buttons need a selection and stay disabled without one. Others work on the selection when there is one and on the whole clip when there is not.

| Button | Needs selection | What it does |
|---|---|---|
| **Trim** | Yes | Keeps the selection and discards everything outside it |
| **Delete** | Yes | Removes the selection and joins the audio on either side. The playhead moves to where the cut was |
| **Silence** | Yes | Replaces the selection with silence and keeps the length |
| **Fade in** | Yes | Ramps the selection linearly from silence to its original level |
| **Fade out** | Yes | Ramps the selection linearly from its original level to silence |
| **Normalize** | No | Scales the selection, or the whole clip, so its loudest sample reaches full scale. A silent region is left unchanged |
| **Amplify** | No | Multiplies the level by 1.4. Peaks above full scale are clipped |
| **Quieten** | No | Multiplies the level by 0.7 |
| **Reverse** | No | Reverses the selection, or the whole clip, end to end |

**Trim** and **Delete** clear the selection after they run. The other edits keep it, so you can chain them, for example **Fade out** followed by **Normalize** on the same region.

All edits apply to every channel of a stereo or multichannel file.

---

## Undo and redo

**Undo** and **Redo** step through your edits. The editor keeps the last 50 states. A new edit after an undo discards the redo branch.

---

## Save

Click **Save to audio**. The editor encodes the clip as a 16-bit PCM WAV file and overwrites the asset's data. The asset's content type becomes `audio/wav`, whatever format it had before. The sample rate and channel count are kept. On success a "Saved edits to audio." notification appears and the editor counts the clip as saved. On failure an error notification shows the reason and your edits stay in the editor.

The save replaces the original file, so any workflow that references the asset uses the edited audio from the next run.

Click **Done** to return to **View** mode. Done does not save.

---

## Related

- [Asset Management](asset-management.md) for uploading, organizing, and viewing audio assets
- [Workspaces](workspaces.md) for tabs and the View / Edit toggle
