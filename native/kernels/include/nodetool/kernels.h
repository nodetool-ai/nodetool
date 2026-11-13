// The NodeTool kernel library: pure buffer kernels for batch and streaming
// nodes (decision D17 of docs/plans/graph-runner-realtime.md).
//
// The same source builds as native code (the graph runner, the timeline) and
// as one standalone WebAssembly module (the Node server and the browser, see
// packages/kernels). Every function is a pure computation over buffers that
// the caller owns. No function keeps a pointer after it returns, allocates
// memory that outlives the call, or touches global state, so every function
// is thread-safe for distinct buffers.
//
// Conventions:
//   - Images are straight-alpha RGBA8, `width * height * 4` bytes, row-major.
//     The kernels process the RGB channels and copy alpha unchanged.
//   - Audio is interleaved float32, `frames * channels` samples.
//   - A streaming kernel keeps its state in a caller-owned array of doubles
//     of the documented length (NT_*_STATE_LEN). Zero-filled is the initial
//     state unless the kernel says otherwise.
//   - Source and destination buffers must not overlap unless a kernel says so.
//   - A function that returns int returns NT_OK, or NT_ERR_ARGS for invalid
//     arguments, and then writes nothing.
//   - A sample rate is in (0, NT_MAX_SAMPLE_RATE]. A function that returns
//     int rejects any other rate.
//   - Any double argument, and any double in a state array, is safe: NaN,
//     infinities and out-of-range values give defined results, never UB.
#pragma once

#include <stddef.h>
#include <stdint.h>

#if defined(__EMSCRIPTEN__)
#define NT_KERNEL_API __attribute__((used, visibility("default")))
#else
#define NT_KERNEL_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define NT_OK 0
#define NT_ERR_ARGS (-1)

#define NT_MAX_SAMPLE_RATE 1536000

/* ── Image enhance (lib.image.enhance.*) ─────────────────────────────── */

/* Stretches each RGB channel so that the darkest and the lightest
 * `cutoff_percent` of its pixels map to 0 and 255. */
NT_KERNEL_API int nt_image_auto_contrast(const uint8_t* src, uint8_t* dst,
                                         uint32_t width, uint32_t height,
                                         double cutoff_percent);

/* Histogram equalization of each RGB channel. */
NT_KERNEL_API int nt_image_equalize(const uint8_t* src, uint8_t* dst,
                                    uint32_t width, uint32_t height);

/* The largest grid_size of nt_image_adaptive_contrast. */
#define NT_IMAGE_MAX_GRID 256

/* Contrast-limited adaptive histogram equalization on a `grid_size` x
 * `grid_size` tile grid, bilinear between tile mappings. `grid_size` is in
 * 1..NT_IMAGE_MAX_GRID. */
NT_KERNEL_API int nt_image_adaptive_contrast(const uint8_t* src, uint8_t* dst,
                                             uint32_t width, uint32_t height,
                                             double clip_limit,
                                             uint32_t grid_size);

/* Rank filter: each RGB value becomes the `rank`-th smallest value of its
 * (2 * floor(size / 2) + 1)^2 neighbourhood, edges clamped. `size` is
 * clamped to 1..25 and `rank` to the neighbourhood. */
NT_KERNEL_API int nt_image_rank_filter(const uint8_t* src, uint8_t* dst,
                                       uint32_t width, uint32_t height,
                                       uint32_t size, uint32_t rank);

/* ── Signal utilities ────────────────────────────────────────────────── */

/* out[i] = in[i] * scale + offset. `in` may equal `out`. */
NT_KERNEL_API void nt_signal_scale_offset(const float* in, float* out,
                                          size_t count, double scale,
                                          double offset);

/* acc[i] += level * in[i]. */
NT_KERNEL_API void nt_signal_mix_add(float* acc, const float* in, size_t count,
                                     double level);

/* out[i] = in[i * channels + index], for `frames` frames. */
NT_KERNEL_API int nt_signal_extract_channel(const float* in, float* out,
                                            size_t frames, uint32_t channels,
                                            uint32_t index);

/* ── PCM sample codecs (WAV data chunks) ───────────────────────────────── */

#define NT_PCM_U8 1  /* unsigned 8-bit, (v - 128) / 128 */
#define NT_PCM_S16 2 /* signed 16-bit, v / 32767 */
#define NT_PCM_S24 3 /* signed 24-bit, v / 8388607 */
#define NT_PCM_S32 4 /* signed 32-bit, v / 2147483647 */
#define NT_PCM_F32 5 /* IEEE float32, copied */

/* Bytes of one sample of `format`, or 0 for an unknown format. */
NT_KERNEL_API size_t nt_pcm_sample_bytes(int format);

/* Decodes `count` little-endian samples of `format` from `in` (count *
 * nt_pcm_sample_bytes(format) bytes) into float32. */
NT_KERNEL_API int nt_pcm_decode(const uint8_t* in, float* out, size_t count,
                                int format);

/* Encodes `count` samples as little-endian signed 16-bit PCM (count * 2
 * bytes): round(clamp(x, -1, 1) * 32767), halves toward +infinity, NaN as 0. */
NT_KERNEL_API void nt_pcm16_encode(const float* in, uint8_t* out, size_t count);

/* ── Audio effects (lib.audio.*) ─────────────────────────────────────── */

/* Quantizes to 2^bit_depth - 1 levels and holds every `reduction`-th frame. */
NT_KERNEL_API int nt_audio_bitcrush(const float* in, float* out, size_t frames,
                                    uint32_t channels, double bit_depth,
                                    uint32_t reduction);

/* Feed-forward compressor with a peak envelope follower. `auto_gain` adds
 * half of the reduction a 0 dBFS peak would receive as makeup gain. */
NT_KERNEL_API int nt_audio_compress(const float* in, float* out, size_t frames,
                                    uint32_t channels, double sample_rate,
                                    double threshold_db, double ratio,
                                    double attack_ms, double release_ms,
                                    int auto_gain);

/* (2 / pi) * atan(x * 10^(drive_db / 20)). `in` may equal `out`. */
NT_KERNEL_API void nt_audio_distortion(const float* in, float* out,
                                       size_t count, double drive_db);

/* Peak limiter with instant attack. `auto_gain` scales the ceiling to 0 dBFS. */
NT_KERNEL_API int nt_audio_limiter(const float* in, float* out, size_t frames,
                                   uint32_t channels, double sample_rate,
                                   double threshold_db, double release_ms,
                                   int auto_gain);

/* Schroeder reverb: four parallel combs into two series allpasses. */
NT_KERNEL_API int nt_audio_reverb(const float* in, float* out, size_t frames,
                                  uint32_t channels, double sample_rate,
                                  double room_scale, double damping,
                                  double wet_level, double dry_level);

/* Noise gate with an envelope follower and attack/release gain smoothing.
 * Attack is at least 0.1 ms and release at least 1 ms. */
NT_KERNEL_API int nt_audio_noise_gate(const float* in, float* out,
                                      size_t frames, uint32_t channels,
                                      double sample_rate, double threshold_db,
                                      double attack_ms, double release_ms);

/* Four-stage first-order allpass phaser with feedback and an LFO. */
NT_KERNEL_API int nt_audio_phaser(const float* in, float* out, size_t frames,
                                  uint32_t channels, double sample_rate,
                                  double rate_hz, double depth,
                                  double centre_frequency_hz, double feedback,
                                  double mix);

/* The longest delay that nt_audio_delay accepts. */
#define NT_AUDIO_MAX_DELAY_SECONDS 60

/* Frames that nt_audio_delay writes: the input plus four echoes. 0 when the
 * delay or the rate is invalid. */
NT_KERNEL_API size_t nt_audio_delay_output_frames(size_t frames,
                                                  double sample_rate,
                                                  double delay_seconds);

/* Feedback delay. `out` holds nt_audio_delay_output_frames(...) frames. */
NT_KERNEL_API int nt_audio_delay(const float* in, float* out, size_t frames,
                                 uint32_t channels, double sample_rate,
                                 double delay_seconds, double feedback,
                                 double mix);

/* ── Biquad filters ──────────────────────────────────────────────────── */

#define NT_BIQUAD_LOWPASS 0
#define NT_BIQUAD_HIGHPASS 1
#define NT_BIQUAD_BANDPASS 2
#define NT_BIQUAD_LOWSHELF 3
#define NT_BIQUAD_HIGHSHELF 4
#define NT_BIQUAD_PEAKING 5

/* Coefficients {b0, b1, b2, a1, a2}, normalized by a0. */
#define NT_BIQUAD_COEFFS_LEN 5
/* State for each channel: {x1, x2, y1, y2}. */
#define NT_BIQUAD_STATE_LEN 4

/* RBJ Audio-EQ-Cookbook design. The frequency is clamped to
 * [1, 0.9999 * Nyquist] and Q to at least 1e-4. Bandpass is not supported. */
NT_KERNEL_API int nt_biquad_design_rbj(int type, double sample_rate,
                                       double frequency, double q,
                                       double gain_db, double* coeffs);

/* Web Audio BiquadFilterNode design: lowpass and highpass Q is in dB, the
 * shelves ignore Q, and a frequency of 0 or Nyquist gives a constant gain.
 * https://webaudio.github.io/web-audio-api/#filters-characteristics */
NT_KERNEL_API int nt_biquad_design_webaudio(int type, double sample_rate,
                                            double frequency, double q,
                                            double gain_db, double* coeffs);

/* Direct Form I over interleaved audio. `state` holds
 * NT_BIQUAD_STATE_LEN * channels doubles and carries the filter memory
 * across calls. `in` may equal `out`. */
NT_KERNEL_API void nt_biquad_process(const double* coeffs, double* state,
                                     const float* in, float* out,
                                     size_t frames, uint32_t channels);

/* ── Modular synthesis (nodetool.audio.synth.*) ──────────────────────── */

#define NT_WAVE_SINE 0
#define NT_WAVE_SAW 1
#define NT_WAVE_SQUARE 2
#define NT_WAVE_TRIANGLE 3
#define NT_WAVE_NOISE 4

/* A CV or gate sample at or above this level counts as high. */
#define NT_GATE_THRESHOLD 0.5

/* {phase, noise seed}. The seed is a uint32 stored as a double. */
#define NT_OSC_STATE_LEN 2

/* Oscillator: freq = base * 2^pitch[i] * (1 + fm_amount * fm[i]), clamped
 * to [0, Nyquist). `pitch` and `fm` hold `count` samples or are NULL for 0. */
NT_KERNEL_API void nt_osc_process(double* state, int waveform,
                                  double base_frequency, double amplitude,
                                  double pulse_width, double fm_amount,
                                  double sample_rate, const float* pitch,
                                  const float* fm, float* out, size_t count);

/* {phase, clock was high}. */
#define NT_LFO_STATE_LEN 2

/* LFO: offset + depth * wave(phase). A rising edge of `clock` (NULL for
 * none) resets the phase at that sample. Noise is not an LFO waveform. */
NT_KERNEL_API void nt_lfo_process(double* state, int waveform, double rate_hz,
                                  double depth, double offset,
                                  double sample_rate, const float* clock,
                                  float* out, size_t count);

#define NT_ADSR_IDLE 0
#define NT_ADSR_ATTACK 1
#define NT_ADSR_DECAY 2
#define NT_ADSR_SUSTAIN 3
#define NT_ADSR_RELEASE 4

/* {stage, envelope, gate was high}. */
#define NT_ADSR_STATE_LEN 3

/* ADSR envelope with exponential one-pole segments, driven by `gate`. */
NT_KERNEL_API void nt_adsr_process(double* state, double attack_seconds,
                                   double decay_seconds, double sustain,
                                   double release_seconds, double sample_rate,
                                   const float* gate, float* out, size_t count);

/* Gate pattern: `amplitude` for on_seconds, 0 for off_seconds, from the
 * absolute frame `start_frame`. Each segment is at least one frame. */
NT_KERNEL_API void nt_gate_process(double start_frame, double on_seconds,
                                   double off_seconds, double amplitude,
                                   double sample_rate, float* out,
                                   size_t count);

/* VCA: out = in * gain * max(0, cv[frame]). `cv` holds `frames` samples or
 * is NULL for a level of 1. */
NT_KERNEL_API void nt_vca_process(const float* in, const float* cv, float* out,
                                  size_t frames, uint32_t channels,
                                  double gain);

/* {held value, trigger was high}. */
#define NT_SAMPLE_HOLD_STATE_LEN 2

/* Sample & hold on each rising edge of `trigger` (NULL for none). */
NT_KERNEL_API void nt_sample_hold_process(double* state, const float* signal,
                                          const float* trigger, float* out,
                                          size_t count);

/* Cutoff is recomputed every NT_VCF_CONTROL_BLOCK frames of a call. */
#define NT_VCF_CONTROL_BLOCK 64

/* VCF: an RBJ lowpass or highpass whose cutoff is
 * cutoff_hz * 2^(cv[block start] * cv_amount). `cv` holds `frames` samples or
 * is NULL. `state` is as for nt_biquad_process. */
NT_KERNEL_API int nt_vcf_process(double* state, int type, double sample_rate,
                                 double cutoff_hz, double q, double cv_amount,
                                 const float* cv, const float* in, float* out,
                                 size_t frames, uint32_t channels);

#ifdef __cplusplus
}
#endif
