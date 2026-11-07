# Audio effects

`Effects.cpp` registers the P1 plan stage at priority 0. It reads clip
`audioEffects`, audio/MIDI track `effects`, and `master.effects` from the raw
JSON. Gain, three-band EQ, filter, compressor, echo, reverb and distortion run
in array order. Disabled, Fable and video effects pass through.

The topology follows `AudioGraph.addClips`, `updateTracks` and `setMaster`:
clip gain/fades → clip inserts → track inserts → track fader/pan → master
inserts → master fader. Video-owned audio receives clip and master inserts,
without the audio track's inserts/fader/pan.

`buildMixPlan` prepares at 48 kHz. `prepareMixPlan` can prepare a different
rate before publishing a plan. A mismatching `mixBlock` call prepares once
and increments `MixStats.preparations`. This is the sole callback allocation
exception. AudioEngine should eventually prepare at the selected device rate
before publishing. Plans and processors belong to one render thread.

P2 can register a later `registerMixPlanStage` and locate inserts by `id`.
Gain, EQ, filter and compressor expose their numeric Web Audio parameters
through allocation-free `setParameter`. Parameter sources also attach to
clip gain, track fader/pan and master fader. All storage belongs in `prepare`,
never in `process`, `reset` or `valueAt`.

Processing preserves 128-frame Web Audio quanta across callback fragments.
A stateful extension that can feed a downstream distortion must implement
`hasPendingOutput` using its owned state for the rest of the current quantum.
The base `processBlock` retains its activity tag across fragments. Delay
activity depends on its wet output and any enabled dry branch.

A seek resets clip processors. Track and master processors persist, matching
AudioGraph. Rebuilding a plan discards all processor state. Preserving state
across AudioEngine's edit-triggered plan replacement remains owner work.
Live ring sources retain clip chains for `clipAudioTailSec` plus the web's
25 ms release allowance. Offline linear sources retain residual audio for
the render duration, as AudioGraph explicitly does for OfflineAudioContext.

`oracle.mjs` bundles the actual `renderAudio.ts` and generates its WAV/JSON
fixtures and sample output under the build directory. It compares every
sample without alignment or scaling and records measured maxima. Its header
contains the per-effect limits. The reference engine downmixes certain
maximum-delay and short feedback tails. Those cases use identical channels,
while a native test independently checks maximum-delay stereo separation.
Compressor envelope/lookahead and oversampling filters follow the reference
engine's implementation-defined choices. Reverb uses the web's Mulberry32
IR, float normalization, a direct head and FFmpeg RDFT partitions.

`params-oracle.mjs` compares the actual QML JS library through QQmlEngine with
the bundled TypeScript parameter mappings and formatters. `tst_fxcontrols`
exercises pointer, angle/pixel wheel, keyboard, reset, focus, power and
stepper behavior offscreen and saves `p1-fx-controls.png` in the build folder.
QML reserves `set`, so the controls retain React's `onSet` callback property
and expose `setValue`/`onSetValue` for QML signal consumers.

Run the registered `tst_audioeffects`, `audio_effect_oracle`, `tst_fxcontrols`
and `fx_params_oracle` tests with `QT_QPA_PLATFORM=offscreen`. The required
regressions are `tst_mixer`, `mix_reference`, `tst_audioengine`, `av_sync` and
`av_sync_fractional`, plus `scripts/op-conformance.mjs`.
