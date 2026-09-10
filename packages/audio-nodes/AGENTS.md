# audio-nodes — Audio Editing & DSP

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **audio-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (output-contract, media-ref, bounds, and divisor rules apply). This overlay covers audio-specific correctness.

## Decode before you edit — operate in sample space

- **Never slice, trim, fade, concat, overlay, or measure audio on encoded
  container bytes.** Doing so corrupts the 44-byte WAV header into the signal.
  Decode → operate on PCM sample frames → re-encode. Reject undecodable input.
- **Time-valued props are *seconds*, never byte offsets.** Convert with
  `frame = round(seconds * sampleRate)`. (Slice/Trim once treated seconds as byte
  counts and used the broken `if (end < 0) end = data.length` sentinel — see the
  bounds rules in [packages/AGENTS.md](../AGENTS.md#indices-bounds-and-numeric-guards).)
- **Align `sampleRate` and `numChannels` before joining or overlaying clips.**
  Reject mismatched inputs when conversion is unavailable.
- **`CreateSilence` must emit a real WAV** (`encodeWav(new Float32Array(frames), sampleRate, 1)`),
  not `new Uint8Array(length)` zero bytes with `duration` as a byte count.

## Parse WAV by structure, not fixed offsets

- **Walk RIFF chunks honoring word-alignment padding**
  (`offset = body + chunkSize + (chunkSize & 1)`) and read `fmt `/`data` fields
  relative to each chunk body — never fixed offsets like 22/24/34/36. Files with
  `LIST`/`JUNK` chunks or `WAVE_FORMAT_EXTENSIBLE` break fixed-offset readers.
  Clamp `dataSize` to the bytes actually present. `readWavHeader` is the reference.
- **Use one shared 16-bit PCM normalization constant across encode/decode/parse**
  (`0x7fff`) so round-trips are unit-gain.

## DSP controls

- **Wire every declared DSP control through to the effect.** `PeakFilter` once
  hardcoded `gain = 0` (no-op) with no `gain_db` prop; `NoiseGate` smoothed with
  the release coefficient in both directions, so `attack_ms` was dead. When a node
  computes two coefficients (attack vs release, in vs out), assert each is used in
  its intended branch. A "node does nothing" smoke test catches no-ops.
- **Floor parameter-derived divisors.** `Bitcrush` `levels = 2^(bitDepth-1)-1` is
  `0` at the minimum `bitDepth`, producing NaN samples — use
  `max(1, 2^bitDepth - 1)`.

## Output ports

- **Return the declared port keys** — `TextToSpeech` returns `{ audio }` (not
  `{ output }`); `LoadAudioFolder` yields `path` (not `name`) and must implement
  its own `extensions`/`include_subdirectories` props rather than delegating to a
  loader that ignores them.
