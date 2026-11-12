# Offline execution preparation

WP09 is in progress. The exact clock is implemented. The driver, PNG/WAV
export, CLI integration, fixture goldens and registry gate are still pending.
The clock and its fixture executable compile with MSVC Release. Test execution
is deferred, so this is not a timing verification result.

## Clock contract

`OfflineClock::prepare(duration, fps, sampleRate)` accepts positive integers,
decimals with at most six fractional digits, and integer fractions such as
`30000/1001`. It rejects signs, whitespace, exponent notation, non-finite values
and zero denominators. Fraction denominators cannot exceed 1,000,000 before
reduction. Duration is limited to 600 seconds and frame rate to 240 frames per
second. Sample rate is 44,100 or 48,000 Hz, matching plan v1.

The export interval is `[0, duration)`. Frame zero is at zero. Frame count is
`ceil(duration * fps)`. Each indexed frame supplies its timestamp and the number
of complete 128-sample quanta ending at or before that timestamp. All scheduling
decisions use bounded integer fractions. Only the timestamp passed to an
executor becomes a `double`.

Audio output contains `floor(duration * sampleRate)` samples per channel. The
driver must drain the remaining quanta after the final video frame and trim
the final quantum to `exportedSamples(quantum)`. A duration shorter than one
sample produces one video frame and zero audio samples. Out-of-range frame
indices return no frame, and out-of-range quantum indices export zero samples.

The clock is an immutable value owned by the offline host thread. It owns no
buffers, callbacks or operating-system resources. Preparation and indexed
queries allocate no storage.

## Driver obligations

The driver must advance audio control and audio execution once per quantum.
It must also advance render control at intervening quantum boundaries before
evaluating each video frame. This avoids the interactive render executor's
bounded catch-up policy skipping state during low-frame-rate offline exports.
Image encoding and WAV writes belong outside executor calls.

Prepared clock fixtures cover fractional rates, exact quantum boundaries,
partial final quanta, a maximum-duration schedule, equivalent decimal/fraction
inputs, large integer products and rejected inputs. They are registered as
`realtime-offline-clock` in CTest and have not been executed locally.

The [private-device GPU exception](render.md#native-pipeline-api-limitation)
and [milestone verification gaps](M1_STATUS.md) still apply. This clock does not
establish repeatable GPU output, live timing, native/Wasm parity or M0 hardware
qualification.
