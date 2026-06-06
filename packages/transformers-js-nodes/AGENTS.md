# transformers-js-nodes — Local transformers.js Inference

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **transformers-js-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first. This overlay covers the nodes here **and** the paired `transformers-js-provider` package (no separate doc) — they share decode paths and must stay consistent.

## Audio decoding (node ↔ provider parity)

- **Route audio through the shared ffmpeg-capable decoder
  (`decodeAudioBytesToSamples`), never a WAV-only `decodeWav`.** ASR once called
  `decodeWav` directly and rejected mp3/m4a/flac with "not a WAV file". Share the
  *exact* decode path between node and provider so behavior can't diverge, and
  thread documented model params (e.g. `temperature`) through.

## WAV correctness

- **One shared 16-bit PCM normalization constant across encode/decode/parse**
  (`0x7fff`). `decodeWav` divided by `0x8000` while `encodeWav`/`parseWavBytes`
  used `0x7fff`, breaking unit-gain round-trips.
- **Never trust the declared data-chunk size** — clamp to bytes present
  (`usableData = min(dataSize, bytes.length - dataOffset)`, `Math.floor` frames) or
  a truncated/streaming WAV throws `RangeError`.
- **Honor the RIFF odd-chunk pad byte** when walking chunks
  (`offset += 8 + chunkSize + (chunkSize & 1)`).
- **Choosing inline `data` vs `uri`: check `.length > 0`** — `if (ref.data)` treats
  a zero-length `Uint8Array` as truthy and shadows a valid `uri`.

## Cancellation

- **Wire the `AbortSignal` into transformers.js's cooperative stopping hook**
  (`InterruptableStoppingCriteria`), not just a post-hoc `signal.aborted` check —
  otherwise generation runs to completion regardless of abort. Clean up the
  listener and surface `AbortError` (not the internal interrupt error).
