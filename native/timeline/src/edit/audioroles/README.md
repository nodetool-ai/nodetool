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
It lowers the whole track. Keep Music and Ambience on tracks of their own. The lane replaces the track fader while
it has points, so a dip starts and ends at the fader's level (or at the lane's value outside the clip when the lane
already has points). Running Duck again replaces the points inside the clip's range and leaves the rest of the lane
alone. A flat point one millisecond outside a dip that touches the edge of the range keeps it from ramping in from
the neighbouring points.

## Measuring

`RoleAnalysis` takes an immutable `Timeline` snapshot and runs on a worker thread (`AudioRoles` owns it). It
renders the clips through the same `buildMixPlan` and `mixBlock` as playback, in blocks, so clip effects, speed and
time remaps count and a long recording is not held in memory. For a measurement the clip stands alone on a neutral
track with no clip volume, no fades, no track fader, pan or effects and no master gain. A mono file is measured
as one channel, as ffmpeg's `ebur128` does. For ducking, the trigger clips (default Dialogue, optionally SFX) are
rendered with their own volume and fades and summed, and their 10 ms level envelope sets the regions to duck
(`audio/loudness/Ducking.h`, ported from FilmCraft's `ducking.rs` and `trigger_envelope`).

The result becomes one `applyEdit`, so one undo entry. It is applied only if the clips and tracks the analysis read
are unchanged (`analysisKey`). Cancel drops the result. Analysis plans attach no mixer meter taps
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
