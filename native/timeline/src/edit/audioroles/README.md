# Audio roles, loudness and ducking

What a clip's sound is (Dialogue, Music, SFX, Ambience), leveling the roles to one target each, ducking Music and
Ambience under Dialogue, and a LUFS meter on the mix. Everything these write is ordinary document data, so
the mixer, the exporter and the web editor play it with no special case.

## Data

| What | Where in the document | Written by |
|---|---|---|
| Role | optional clip field `audioRole` (`dialogue`, `music`, `sfx`, `ambience`) | `setClipsAudioRole` |
| Loudness match | the clip's `volumeDb` | `setClipsVolumeDb` |
| Ducking | points of the track's mixer lane `{kind: "mixer", param: "volumeDb"}` | `applyDucking` |

An unset role reads as Dialogue on a clip whose `bindingKind` is `text-to-audio` and as Music on `text-to-music`
(`effectiveRole`). New generated voice and music clips also get the field.

The web editor has no clip-level volume keyframes, so ducking uses the track's volume lane, which both editors play.
It lowers the whole track. Keep Music and Ambience on tracks of their own. While a lane has points it replaces the
track fader, so the dips go down from the fader's level, and whatever the lane held inside the clip is replaced.
A clip owns the points in `[start, end)`. `RoleAnalysis` keeps its points inside `[start, end - 1 ms]` and adds a
flat point at the base level at the start and one at the end, so a dip never ramps into the clips next to it, and
two clips that meet on one track do not touch each other's points. A lane holds its first and last value beyond its
points, so a dip that reaches the start or the end of the clip gets one more flat point just outside it (`soft`
in `replaceRange`), added only where no point is already, because a neighbour's own point there says what the level
is. A clip with nothing to duck next to a dip gets flat points at its ends, so the dip does not run through it.
Running Duck again replaces the points of the clip's range and leaves the rest of the lane alone. Clips that
overlap on one track share the dialogue under the overlap, so each plan covers it and the later edit wins there. A lane that is switched off is refused, because its points
would not be heard, and so is a lane that would pass 10000 points, the web schema's limit. A sound file that cannot
be read leaves the existing ducking as it is.

An unset role reads as Dialogue or Music for a generated voice or music clip, so there is nothing to clear on such a
clip: the panel ignores a click on that role and the Clip menu's "No Role" is off until a clip has the field. Choose
another role to change it.

## Measuring

`RoleAnalysis` takes an immutable `Timeline` snapshot and runs on a worker thread (`AudioRoles` owns it). It
renders the clips through the same `buildMixPlan` and `mixBlock` as playback, in blocks, so clip effects and speed
count and a long recording is not held in memory. The mix does not apply time remaps, so neither does the measurement. For a measurement the clip stands alone on a neutral
track with no fades, no track fader, pan or track effects and no master gain, at a clip volume of its own. The volume
comes first, then the clip's effects, so a clip with effects (a compressor reacts to the level) is rendered again
at the volume found and searched for (secant and bisection steps, up to seven more renders), keeping the closest. A mono file is measured
as one channel, as ffmpeg's `ebur128` does. For ducking, the trigger clips (default Dialogue, optionally SFX) are
rendered with their own volume and fades and summed, and their 10 ms level envelope sets the regions to duck
(`audio/loudness/Ducking.h`, ported from FilmCraft's `ducking.rs` and `trigger_envelope`).

The result becomes one `applyEdit`, so one undo entry. It is applied only if the clips and tracks the analysis read
are unchanged (`analysisKey`: matching and normalizing ignore every volume, ducking keeps the volumes of the trigger
clips and the track faders). Cancel drops the result. Analysis plans attach no mixer meter taps
(`automation::ScopedNoMeters`), so they never replace the live meters' readings.

## The live meter

`LiveLoudness` (`audio/loudness/`) runs in the device callback after the mix, only while playing, not for scrub
bursts. It allocates nothing and takes no lock. It publishes through `LoudnessReadout` atomics once per 100 ms of
audio. `LoudnessMeters` (QML singleton) reads them. A seek or a pause restarts the 400 ms and 3 s windows and keeps the
integrated gate. Reset clears everything. Only the engine of the open timeline writes the app readout
(`AppAudio::setPublishLoudness`).

## Headless

```
nodetool-timeline fixture.json --audio-roles match|normalize|duck [--clips ID,ID] [--out edited.json]
nodetool-timeline edited.json --render-audio out.f32
```

`check-roles.mjs` runs both and checks the keyframes and the rendered levels (ctest `audio_roles_cli`).

## Tests

`tst_audioroles` (edits, measurement, controller, ducking render, the engine's live meter),
`tst_audiorolesui` (the Audio panel and the gain dialog with pointer and key events), and `tst_loudness`,
`tst_ducking`, `tst_liveloudness` in `src/audio/loudness`. The loudness tests hold ffmpeg `ebur128` reference values.
