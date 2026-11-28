# Native audio I/O

Follow the [native ownership and sanitizer rules](../AGENTS.md) and the
[realtime design](../../docs/plans/graph-runner-realtime.md#144-project-layout).
The [README](README.md) lists the contents and the build commands.

- Depend on the C++ standard library and miniaudio only. No Qt, FFmpeg or
  timeline code.
- Keep the folder layout of `native/timeline-player/src`, so a moved file
  keeps its include path in the timeline player and the realtime engine.
- Code that runs on a device callback or another realtime thread does not
  lock, allocate, block or log. It reads seqlocks through
  `RealtimeSeqLockReader`, never through the blocking `SeqLock::load`.
- Run `ctest` for the release, sanitize and tsan presets after a change.
  The timeline and the realtime engine build this directory, so their CI
  covers their own use of it.
