---
name: api-scripts
description: "Call nodetool.scripts from a code action: create a voice script, add speakers with voices and spoken lines, voice the lines as audio takes, and assemble the takes into a voiceover timeline with word timings. Load before the first call into nodetool.scripts."
---

# nodetool.scripts

A script (a voice script) is a cast of speakers, each with a voice, and the
lines they speak in reading order. Voicing a line makes an audio take.
Assembling lays the takes into a timeline. A JavaScript script is a different
document (`nodetool-js-scripting`). A video timed to a written voiceover is
`script-video`.

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({limit})` | Lists scripts, newest first, with cast size, line count, voiced count and the timeline it was assembled into. | Script rows |
| `create(name, {project_id, id})` | Creates an empty script. An existing `id` is returned as it is, so a retry makes no copy. | `{script_id, …}` |
| `get(id)` | Reads the cast and every line with its id, index, speaker, text, direction, pause, effective voice and voicing status. | The script |
| `edit(id, ops)` | Applies ops in order and saves. An open editor picks the change up live. | The result of each op |
| `voice(id, opts)` | Calls the TTS provider for the lines. | The takes it made |
| `assembleTimeline(id, {name, fps})` | Lays the voiced takes end to end into a timeline. | The timeline id, and the lines it skipped |

Line status is `draft` (never voiced), `stale` (the text or voice changed
since the take), `voiced` or `no_voice` (the speaker has no voice).

## Ops

A line `target` is its id, its 0-based index in the whole script, or its exact
text. A speaker `target` is its id or name. An argument an op does not take is
refused.

| Op | Arguments |
| :--- | :--- |
| `set_setup` | `stage?`, `brief?`, `format?`, `length_seconds?`, `pace?`, `language?` |
| `add_speaker` | `name`, `color?`, `provider?`, `model?`, `voice?`, `entityId?` |
| `set_speaker` | `target`, `name?`, `color?`, `entityId?` — renames or recolours a speaker |
| `set_speaker_voice` | `target`, `provider`, `model`, `voice`, `settings?` |
| `remove_speaker` | `target` |
| `add_section` | `title?` |
| `add_line` | `text`, `speaker?`, `section?`, `direction?`, `pause_after_ms?`, `index?` |
| `set_line_text` | `target`, `text` |
| `set_line_speaker` | `target`, `speaker` — the op that gives a line its speaker |
| `remove_line` | `target` |

- `format` is `voiceover`, `dialogue`, `interview`, `ad-read` or `tutorial`.
- `entityId` makes the speaker a cast character from the entity library, so
  storyboard renders can use it.
- A rewritten line keeps its takes as `stale`, so the next `voice()` records
  exactly those again.

## voice

- Omit `targets` to voice every line that is unvoiced or stale. A whole script
  is one call.
- `targets` takes line ids, indexes or exact texts.
- Each line uses its own voice, else its speaker's. `provider`, `model` and
  `voice` together override every line. Pick the model with
  `nodetool.models.pick("text_to_speech")`.
- `speed`, `concurrency` (default 3, max 8).
- Word timings are transcribed for captions (`transcribe`, default true;
  `asr_provider` and `asr_model` default to `openai` and `whisper-1`).
- Earlier takes are kept, and the new take becomes current.

```js
const { script_id: id } = await nodetool.scripts.create("Launch VO");
await nodetool.scripts.edit(id, [
  { op: "add_speaker", name: "Narrator" },
  { op: "set_speaker_voice", target: "Narrator", provider, model, voice },
  { op: "add_line", text: "Meet the lamp that listens.", speaker: "Narrator" }
]);
await nodetool.scripts.voice(id);
const cut = await nodetool.scripts.assembleTimeline(id);
```

Each assembled clip carries its word timings, the speaker label and a link to
its line, so a re-voiced line can round-trip into the cut. Running the
assembly again rebuilds the same timeline in place. Validate it with
`nodetool.timelines.validate` before a render.
