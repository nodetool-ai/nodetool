---
layout: page
title: "Script Editor"
permalink: /script-editor
description: "Write dialogue and narration, cast voices, record takes per line, and send the voiced script to a storyboard, a timeline, or an SRT file."
---

Write the words of a video, give each speaker a voice, and voice every line. A script is a document with sections, lines, a cast, and a set of recorded takes per line. It opens as a workspace tab and feeds the [Storyboard Editor](storyboard-editor.md), the [Video Editor](video-editor.md), and subtitle files.

> **Quick Access:** Click **+** in the workspace tab bar and choose **New script**, or open a script from the **Scripts** panel.

---

## Where this fits

The script owns words and voice. A linked storyboard owns pictures and motion. A timeline owns placement. Each one reads the others and does not rewrite them. Edit a line's text or a speaker's voice in the script, and the storyboard and timeline pick up the change. See [AI Video Production](ai-video-production.md) for the full production path.

---

## Create a script

| Route | How |
|---|---|
| New menu | **+** in the tab bar, then **New script**. Opens an empty script titled "Untitled script". |
| Scripts panel | The **New script** button in the panel header creates and opens one. |
| Guided flow | Start **Script** from the guided starters. The flow runs Idea, Format, and Voices steps before the editor appears. See [Guided Flows](guided-flows.md). |
| From a storyboard | In the storyboard's script control, choose **Extract script**. It builds a script from the shots' dialogue and narration, and the button becomes **Open script**. |
| From a timeline | In the timeline's transcript panel, choose **Extract as script**. Each transcript paragraph becomes a line and each speaker label becomes a cast member without a voice. A recorded paragraph keeps its audio as the line's first take. |
| Agent | Ask the assistant, or an agent calls `create_script` (see [Agent tools](#agent-tools)). |

The guided flow's Idea step accepts a typed brief, a pasted script, an uploaded file, or an imported subtitle file. An imported subtitle file keeps its cue timings. Pasting text over it drops them.

A script still in its guided flow shows the flow in place of the editor. Finish or skip the last step to reach the editor.

---

## Write lines

A script is a list of sections, and each section holds lines. The empty state offers **Add first line**. Use **Add section** below the last section for another.

- **Write a line.** Type in the line field (placeholder "Write a line…"). Press Enter to split a line at the cursor.
- **Insert a line.** Hover the gap between two lines and click the **+** rule.
- **Reorder.** Drag the handle ("Drag to reorder line"). Drop between lines, or into another section.
- **Name a section.** Edit its "Section title" field.
- **Line menu.** The **More line actions** menu sets a pause after the line (No pause after, 0.5s, 1s, 2s), **Duplicate line**, or **Delete line**.

There are no line types. Dialogue and narration are the same kind of line, and the difference is the speaker. Add a speaker called Narrator for voiceover.

### Speakers and directions

The speaker button in the gutter shows the line's speaker. Click it to pick a cast member, choose **No speaker**, or choose **Add speaker**.

The theater-mask button (**Add direction** / **Remove direction**) adds a second field, "Direction (e.g. whispering, tired)…". A direction describes delivery. It is stored with the line and sent along when you voice it.

The toolbar counts lines and words, and shows the total duration of the current takes.

---

## Cast voices

The **Cast** tab in the right dock lists the speakers. Each one has:

| Field | Purpose |
|---|---|
| Speaker name | The label shown in the gutter and in subtitles. |
| Voice | A text-to-speech model and voice. Pick from the providers you have configured in [Models and Providers](models-and-providers.md). |
| Linked entity | A character or other [entity](entities.md) from the library. The entity's name, kind, and first reference image show under the field. |

If a linked entity was deleted, the panel shows "Linked entity not found" so you can pick another or clear it. **Add** creates a speaker named "Speaker 1", "Speaker 2", and so on.

A line can override its speaker's voice. A line cannot be voiced until it has an effective voice (its own or its speaker's).

---

## Voice lines and choose takes

Every voiced line stores its audio as a take. A take records the text and voice it was made from.

| Line status | Meaning |
|---|---|
| Not voiced yet | No current take. |
| Voiced | The current take matches the line's text and voice. |
| Stale | The text or voice changed after the current take was made. The voice button reads **Re-voice line**. |

- **Voice line.** The waveform button on a line voices it. It is disabled with the tooltip "Assign a voice to this speaker first" until a voice exists.
- **Voice all.** The toolbar button voices every unvoiced or stale line that has text and a voice, up to three at a time. It shows an estimate such as "Voice all · ~$0.12" when the provider catalog has a rate. Voicing is billed by the provider at its own rates.
- **Retry.** After a run, a banner reports "Voiced N lines." or lists the lines that failed, with a retry action.
- **Play.** **Play current take** plays one line. **Play through** plays all current takes in order, and becomes **Stop** while playing.
- **Takes.** The **Takes (N)** button opens the take gallery. Each take shows its text, duration, and voice. Use **Use this take** to make it current, **Play take**, **Favorite**, **Send take to a workflow**, or **Delete take**.

Re-voicing adds a take and keeps the old ones, so you can switch back.

---

## Link to a storyboard

The header control links the script to a storyboard.

- **Create storyboard** derives one shot per line, linked to its line, with the words projected into each shot. The button then reads **Open storyboard**.
- A line covered by a shot shows the shot's keyframe thumbnail in the gutter. Click it to open the storyboard on that shot. Until a still renders, the chip shows the shot number.
- A line with no shot on a linked board shows **No shot** in the gutter.
- Warnings about a broken link, such as a shot pointing at a deleted line, appear under the button.

The link is stored on both documents, so it survives a reload. Re-voicing a line changes shot durations on the board. See [Storyboard Editor](storyboard-editor.md) for the board side, including extracting a script from a board.

---

## Send to a timeline

Once at least one line is voiced, the toolbar offers a timeline action. Its label depends on the link:

| State | Label |
|---|---|
| No storyboard, no timeline yet | **Send to timeline** |
| Already sent | **Update timeline** |
| Linked to a storyboard | **Assemble video** |

An unlinked script becomes a voiceover track with captions from the current takes. A linked script is cut with its storyboard: the board's rendered shots carry the picture and each line's take sits inside the shot that covers it. Shots without a render are left out and reported. The same actions appear in the command menu as **Send to Timeline**, **Update Timeline**, and **Assemble Video**.

Open the result in the [Video Editor](video-editor.md). The script keeps a pointer to the timeline.

---

## Export subtitles

Choose **Export SRT** from the toolbar's **More actions** menu, or **Export Subtitles (SRT)** in the command menu. NodeTool downloads an `.srt` file named after the script title. Cues come from the current takes, so voice at least one line first.

---

## Assistant

The **Assistant** tab in the right dock opens the Script Assistant, a chat that knows which script is open. Try "draft a 30-second intro for two hosts", "add a line for Narrator", or "voice every line and send it to a timeline". It edits the open script live through the `ui_script_*` tools.

---

## Saving and conflicts

Edits autosave. The toolbar shows **Unsaved changes**, **Saving…**, **Saved**, **Save failed** (changes are kept locally), or **Reloaded newer version** when the script was changed elsewhere. Undo and redo work for the open script. If an outside edit conflicts with a line you are still editing, a banner lets you accept or discard each change.

---

## Agent tools

Agents can work on scripts without the editor. See [Chat & Agents](global-chat-agents.md) for how the agent uses them.

| Tool | Purpose |
|---|---|
| `list_scripts`, `get_script` | Find and read scripts. |
| `create_script`, `edit_script` | Create a script and change its cast, sections, and lines. |
| `voice_script_lines` | Voice lines with the cast's voices. |
| `assemble_script_timeline` | Build the timeline the toolbar button builds. |
| `derive_storyboard_from_script` | Create a linked storyboard, as **Create storyboard** does. |
| `delete_script` | Delete a script. |
