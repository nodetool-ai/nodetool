# Audio I/O

The audio device layer that the [timeline player](../timeline-player/README.md)
and the [realtime engine](../realtime/README.md) share, as section 14.4 of the
[realtime design](../../docs/plans/graph-runner-realtime.md#144-project-layout)
specifies. It depends on the C++ standard library and miniaudio only.

| File | Contents |
|---|---|
| `src/audio/PlaybackDevice.h` | A float32 playback device on miniaudio, with the null backend for automated checks. It owns the miniaudio context and device and releases them in `close()` or its destructor |
| `src/playback/AudioClockFeed.h` | The seqlocks of the audio-master clock, `CallbackClockDriver`, and `RealtimeSeqLockReader`, the bounded reader for realtime threads |
| `src/audio/OutputLatency.h` | The CoreAudio output latency facts |
| `src/audio/PcmRing.h` | The single-producer, single-consumer PCM ring |
| `src/audio/miniaudio.cpp` | The miniaudio implementation, compiled once. `third_party/miniaudio.h` is public, so `LoopbackCapture` and the realtime spikes use the same build |
| `tests/support/audio/TestAllocationCounter.h` | The per-thread allocation counter of the realtime tests, in the `nodetool_audio_io_test_support` target |

## Threads

`PlaybackDevice` is opened, started and closed on one control thread. Its
render callback runs on the device's realtime thread. Its notification callback
runs on a miniaudio or backend thread. Both receive the caller's `user`
pointer, which must outlive the device. `close()` returns after the callbacks
have stopped.

`RealtimeSeqLockReader` belongs to one realtime thread. A read that overlaps a
write 64 times keeps the destination unchanged and adds to `failedReads()`
(design section 11.4). It has no blocking `load()`.

## Build and test

From `native/audio-io` on Linux, the `release`, `sanitize` and `tsan` presets
configure Ninja builds:

```sh
cmake --preset sanitize
cmake --build --preset sanitize
ctest --preset sanitize
```

`audio-io-test` checks that a seqlock held by `holdWriteForTest` does not block
a realtime read while the unbounded `load` waits for it, that the callback
clock driver keeps the last command under a held lock, and that the null
device renders, reports its facts, stops calling back after `close()` and
allocates nothing on its thread between callbacks. Allocation counting runs in
unsanitized builds only.

Miniaudio's license is at the end of [`third_party/miniaudio.h`](third_party/miniaudio.h).
