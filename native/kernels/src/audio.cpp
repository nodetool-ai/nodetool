// Audio effect kernels of the lib.audio nodes and the signal utilities of the
// streaming nodes. Each effect runs per channel over interleaved samples. The
// arithmetic is in double with float32 storage wherever the TypeScript loop
// that this code replaced stored into a Float32Array, so its output is equal
// up to the last bit of the math library.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>
#include <vector>

namespace {

using nt::kernels::f32;
using nt::kernels::jsRound;
using nt::kernels::kPi;
using nt::kernels::Strided;

bool validAudio(const float* in, const float* out, uint32_t channels,
                double sampleRate = 1) {
  return in && out && channels > 0 && nt::kernels::validSampleRate(sampleRate);
}

// The per-sample one-pole coefficient of a smoothing time in milliseconds.
double timeCoeff(double sampleRate, double ms) {
  return std::exp(-1 / ((sampleRate * ms) / 1000));
}

double dbToGain(double db) { return std::pow(10, db / 20); }

// The delay line of nt_audio_delay in frames, or nullopt when it is longer
// than NT_AUDIO_MAX_DELAY_SECONDS or the rate is invalid.
std::optional<size_t> delayFrames(double sample_rate, double delay_seconds) {
  if (!nt::kernels::validSampleRate(sample_rate)) return std::nullopt;
  // NaN fails the comparison, so it is rejected with the long delays.
  if (!(delay_seconds <= NT_AUDIO_MAX_DELAY_SECONDS)) return std::nullopt;
  return static_cast<size_t>(std::floor(std::max(0.0, delay_seconds) * sample_rate));
}

}  // namespace

extern "C" {
static int audioDelayBlock(double*, const float*, float*, size_t, uint32_t, double, double, double, double);


void nt_signal_scale_offset(const float* in, float* out, size_t count,
                            double scale, double offset) {
  for (size_t i = 0; i < count; i++) out[i] = f32(in[i] * scale + offset);
}

void nt_signal_mix_add(float* acc, const float* in, size_t count, double level) {
  for (size_t i = 0; i < count; i++) acc[i] = f32(acc[i] + level * in[i]);
}

int nt_signal_extract_channel(const float* in, float* out, size_t frames,
                              uint32_t channels, uint32_t index) {
  if (!in || !out || channels == 0 || index >= channels) return NT_ERR_ARGS;
  for (size_t i = 0; i < frames; i++) out[i] = in[i * channels + index];
  return NT_OK;
}

int nt_audio_bitcrush(const float* in, float* out, size_t frames,
                      uint32_t channels, double bit_depth, uint32_t reduction) {
  const size_t length = nt_audio_bitcrush_state_len(channels, 44100, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_bitcrush_init(state.data(), channels, 44100, 0);
  return nt_audio_bitcrush_block(state.data(), in, out, frames, channels, bit_depth, reduction);
}

int nt_audio_compress(const float* in, float* out, size_t frames,
                      uint32_t channels, double sample_rate,
                      double threshold_db, double ratio, double attack_ms,
                      double release_ms, int auto_gain) {
  const size_t length = nt_audio_compress_state_len(channels, sample_rate, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_compress_init(state.data(), channels, sample_rate, 0);
  return nt_audio_compress_block(state.data(), in, out, frames, channels, sample_rate, threshold_db, ratio, attack_ms, release_ms, auto_gain);
}

void nt_audio_distortion(const float* in, float* out, size_t count,
                         double drive_db) {
  const double drive = dbToGain(drive_db);
  for (size_t i = 0; i < count; i++) {
    out[i] = f32((2 / kPi) * std::atan(in[i] * drive));
  }
}

int nt_audio_limiter(const float* in, float* out, size_t frames,
                     uint32_t channels, double sample_rate, double threshold_db,
                     double release_ms, int auto_gain) {
  const size_t length = nt_audio_limiter_state_len(channels, sample_rate, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_limiter_init(state.data(), channels, sample_rate, 0);
  return nt_audio_limiter_block(state.data(), in, out, frames, channels, sample_rate, threshold_db, release_ms, auto_gain);
}

int nt_audio_reverb(const float* in, float* out, size_t frames,
                    uint32_t channels, double sample_rate, double room_scale,
                    double damping, double wet_level, double dry_level) {
  const size_t length = nt_audio_reverb_state_len(channels, sample_rate, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_reverb_init(state.data(), channels, sample_rate, 0);
  return nt_audio_reverb_block(state.data(), in, out, frames, channels, sample_rate, room_scale, damping, wet_level, dry_level);
}

int nt_audio_noise_gate(const float* in, float* out, size_t frames,
                        uint32_t channels, double sample_rate,
                        double threshold_db, double attack_ms,
                        double release_ms) {
  const size_t length = nt_audio_noise_gate_state_len(channels, sample_rate, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_noise_gate_init(state.data(), channels, sample_rate, 0);
  return nt_audio_noise_gate_block(state.data(), in, out, frames, channels, sample_rate, threshold_db, attack_ms, release_ms);
}

int nt_audio_phaser(const float* in, float* out, size_t frames,
                    uint32_t channels, double sample_rate, double rate_hz,
                    double depth, double centre_frequency_hz, double feedback,
                    double mix) {
  const size_t length = nt_audio_phaser_state_len(channels, sample_rate, 0);
  if (!length) return NT_ERR_ARGS;
  std::vector<double> state(length);
  nt_audio_phaser_init(state.data(), channels, sample_rate, 0);
  return nt_audio_phaser_block(state.data(), in, out, frames, channels, sample_rate, rate_hz, depth, centre_frequency_hz, feedback, mix);
}

size_t nt_audio_delay_output_frames(size_t frames, double sample_rate,
                                    double delay_seconds) {
  const auto delay = delayFrames(sample_rate, delay_seconds);
  return delay ? frames + *delay * 4 : 0;
}

int nt_audio_delay(const float* in, float* out, size_t frames,
                   uint32_t channels, double sample_rate, double delay_seconds,
                   double feedback, double mix) {
  const auto delay = delayFrames(sample_rate, delay_seconds);
  if (!validAudio(in, out, channels, sample_rate) || !delay) return NT_ERR_ARGS;
  std::vector<double> state(channels * (1 + *delay * 2));
  const size_t tailFrames = *delay * 4;
  const int status = audioDelayBlock(state.data(), in, out, frames, channels, sample_rate, delay_seconds, feedback, mix);
  if (status != NT_OK || !tailFrames) return status;
  const std::vector<float> silence(tailFrames * channels);
  return audioDelayBlock(state.data(), silence.data(), out + frames * channels, tailFrames, channels, sample_rate, delay_seconds, feedback, mix);
}


size_t nt_audio_bitcrush_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  return 2 > SIZE_MAX / channels ? 0 : size_t{channels} * 2;
}
int nt_audio_bitcrush_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_bitcrush_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
int nt_audio_bitcrush_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double bit_depth, uint32_t reduction) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels)) return NT_ERR_ARGS;
  // At bit depth 1 the level count would be 1, and below it 0 (NaN samples).
  const double levels = std::max(1.0, std::pow(2, bit_depth) - 1);
  const size_t hold = std::max<uint32_t>(1, reduction);
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    const size_t n = frames;
    const auto write = [&](size_t i, double value) { out[i * channels + ch] = f32(value); };
    double& phase = state[ch * 2];
    double& held = state[ch * 2 + 1];
    for (size_t i = 0; i < n; i++) {
      if (!(phase >= 0 && phase < hold)) phase = 0;
      if (phase == 0) held = jsRound(input[i] * levels) / levels;
      write(i, held);
      phase = std::fmod(phase + 1, static_cast<double>(hold));
    }
  }
  return NT_OK;
}
size_t nt_audio_compress_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  return channels;
}
int nt_audio_compress_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_compress_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
int nt_audio_compress_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double threshold_db, double ratio, double attack_ms, double release_ms, int auto_gain) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate) || ratio <= 0) return NT_ERR_ARGS;
  // Half of the reduction a 0 dBFS peak would receive: restores most of the
  // loudness without clipping under-compressed transients.
  const double makeupDb = auto_gain ? (-threshold_db * (1 - 1 / ratio)) / 2 : 0;
  const double makeup = dbToGain(makeupDb);
  const double attack = timeCoeff(sample_rate, attack_ms);
  const double release = timeCoeff(sample_rate, release_ms);
  const double threshold = dbToGain(threshold_db);
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    const size_t n = frames;
    const auto write = [&](size_t i, double value) { out[i * channels + ch] = f32(value); };
    double& envelope = state[ch];
    for (size_t i = 0; i < n; i++) {
      const double sample = input[i];
      const double level = std::abs(sample);
      const double coeff = level > envelope ? attack : release;
      envelope = coeff * envelope + (1 - coeff) * level;
      if (envelope > threshold) {
        const double dbOver = 20 * std::log10(envelope / threshold);
        const double dbReduction = dbOver * (1 - 1 / ratio);
        const double gain = std::pow(10, -dbReduction / 20);
        write(i, sample * gain * makeup);
      } else {
        write(i, sample * makeup);
      }
    }
  }
  return NT_OK;
}
size_t nt_audio_limiter_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  return channels;
}
int nt_audio_limiter_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_limiter_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 1.0);
  return NT_OK;
}
int nt_audio_limiter_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double threshold_db, double release_ms, int auto_gain) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  const double threshold = dbToGain(threshold_db);
  // Limited peaks sit at the threshold, so 1 / threshold brings them to 0 dBFS.
  const double makeup = auto_gain ? 1 / threshold : 1;
  const double release = timeCoeff(sample_rate, release_ms);
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    const size_t n = frames;
    const auto write = [&](size_t i, double value) { out[i * channels + ch] = f32(value); };
    double& gain = state[ch];
    for (size_t i = 0; i < n; i++) {
      const double sample = input[i];
      const double level = std::abs(sample);
      if (level > threshold) {
        gain = std::min(gain, threshold / level);
      } else {
        gain = release * gain + (1 - release) * 1.0;
      }
      write(i, sample * gain * makeup);
    }
  }
  return NT_OK;
}
size_t nt_audio_noise_gate_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  return 2 > SIZE_MAX / channels ? 0 : size_t{channels} * 2;
}
int nt_audio_noise_gate_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_noise_gate_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
int nt_audio_noise_gate_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double threshold_db, double attack_ms, double release_ms) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  const double threshold = dbToGain(threshold_db);
  const double attack = timeCoeff(sample_rate, std::max(0.1, attack_ms));
  const double release = timeCoeff(sample_rate, std::max(1.0, release_ms));
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    const size_t n = frames;
    const auto write = [&](size_t i, double value) { out[i * channels + ch] = f32(value); };
    double& envelope = state[ch * 2];
    double& gain = state[ch * 2 + 1];
    for (size_t i = 0; i < n; i++) {
      const double sample = input[i];
      const double level = std::abs(sample);
      const double follow = level > envelope ? attack : release;
      envelope = follow * envelope + (1 - follow) * level;
      // Opens with the attack time and closes with the release time.
      const double target = envelope >= threshold ? 1 : 0;
      const double smooth = target > gain ? attack : release;
      gain = smooth * gain + (1 - smooth) * target;
      write(i, sample * gain);
    }
  }
  return NT_OK;
}
size_t nt_audio_phaser_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  return 10 > SIZE_MAX / channels ? 0 : size_t{channels} * 10;
}
int nt_audio_phaser_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_phaser_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
int nt_audio_phaser_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double rate_hz, double depth, double centre_frequency_hz, double feedback, double mix) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  constexpr int kStages = 4;
  const double twoPi = 2 * kPi;
  const double lfoIncrement = (2 * kPi * rate_hz) / sample_rate;
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    const size_t n = frames;
    const auto write = [&](size_t i, double value) { out[i * channels + ch] = f32(value); };
    // x[n-1] and y[n-1] of each stage, float32 as in the TypeScript loop.
    double* xPrev = state + ch * 10;
    double* yPrev = xPrev + 4;
    double& feedbackSample = xPrev[8];
    double& lfoPhase = xPrev[9];
    for (size_t i = 0; i < n; i++) {
      const double lfo = std::sin(lfoPhase) * depth;
      lfoPhase += lfoIncrement;
      if (lfoPhase > twoPi) lfoPhase -= twoPi;
      const double modFreq = std::max(
          20.0, std::min(sample_rate / 2 - 1, centre_frequency_hz * (1 + lfo)));
      const double t = std::tan((kPi * modFreq) / sample_rate);
      const double a = (t - 1) / (t + 1);
      const double dry = input[i];
      double stage = dry + feedbackSample * feedback;
      for (int s = 0; s < kStages; s++) {
        const double next = a * stage + xPrev[s] - a * yPrev[s];
        xPrev[s] = f32(stage);
        yPrev[s] = f32(next);
        stage = next;
      }
      feedbackSample = stage;
      write(i, dry * (1 - mix) + stage * mix);
    }
  }
  return NT_OK;
}
size_t nt_audio_reverb_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  const double scale = sample_rate / 44100;
  size_t n = 12;
  for (double delay : {1557., 1617., 1491., 1422., 225., 556.}) n += std::max<size_t>(1, static_cast<size_t>(jsRound(delay * scale)));
  return n > SIZE_MAX / channels ? 0 : channels * n;
}
int nt_audio_reverb_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_reverb_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
int nt_audio_reverb_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double room_scale, double damping, double wet_level, double dry_level) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  const double scale = sample_rate / 44100;
  constexpr std::array<double, 6> delays{1557, 1617, 1491, 1422, 225, 556};
  const size_t stride = nt_audio_reverb_state_len(1, sample_rate, 0);
  for (uint32_t ch = 0; ch < channels; ch++) {
    for (size_t i = 0; i < frames; i++) {
      const float dry = in[i * channels + ch];
      float wet = 0;
      double* ring = state + ch * stride;
      for (size_t r = 0; r < delays.size(); r++) {
        const size_t length = std::max<size_t>(1, static_cast<size_t>(jsRound(delays[r] * scale)));
        const size_t index = nt::kernels::saturatingFrames(ring[0], length - 1);
        const float delayed = f32(ring[2 + index]);
        if (r < 4) {
          ring[1] = delayed * (1 - damping) + ring[1] * damping;
          ring[2 + index] = f32(dry + ring[1] * (room_scale * 0.28 + 0.7));
          wet = f32(static_cast<double>(wet) + delayed);
        } else {
          ring[2 + index] = f32(wet + delayed * 0.5);
          wet = f32(delayed - wet * 0.5);
        }
        ring[0] = (index + 1) % length;
        ring += length + 2;
      }
      out[i * channels + ch] = f32(dry * dry_level + wet * wet_level);
    }
  }
  return NT_OK;
}
size_t nt_audio_delay_state_len(uint32_t channels, double sample_rate, double delay_seconds) {
  if (!channels || !nt::kernels::validSampleRate(sample_rate)) return 0;
  if (!std::isfinite(delay_seconds) || delay_seconds > NT_AUDIO_MAX_STREAM_DELAY_SECONDS) return 0;
  const size_t stride = 1 + 2 * static_cast<size_t>(std::floor(std::max(0.0, delay_seconds) * sample_rate));
  return stride > SIZE_MAX / channels ? 0 : channels * stride;
}
int nt_audio_delay_init(double* state, uint32_t channels, double sample_rate, double delay_seconds) {
  const size_t n = nt_audio_delay_state_len(channels, sample_rate, delay_seconds);
  if (!state || !n) return NT_ERR_ARGS;
  std::fill_n(state, n, 0.0);
  return NT_OK;
}
static int audioDelayBlock(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double delay_seconds, double feedback, double mix) {
  if (!state) return NT_ERR_ARGS;

  if (!validAudio(in, out, channels, sample_rate) ||
      !std::isfinite(delay_seconds) || delay_seconds > NT_AUDIO_MAX_DELAY_SECONDS) return NT_ERR_ARGS;
  const size_t delay = static_cast<size_t>(std::floor(std::max(0.0, delay_seconds) * sample_rate));
  const size_t stride = 1 + delay * 2;
  for (uint32_t ch = 0; ch < channels; ch++) {
    double* ring = state + ch * stride;
    for (size_t i = 0; i < frames; i++) {
      const float dry = in[i * channels + ch];
      float wet;
      if (delay == 0) {
        // Matches the legacy zero-delay recurrence: wet initially equals zero.
        wet = f32(dry + 0.0 * feedback);
      } else {
        const size_t cursor = nt::kernels::saturatingFrames(ring[0], delay * 2 - 1);
        const size_t index = cursor % delay;
        wet = cursor < delay ? 0.0f : f32(ring[1 + index] + ring[1 + delay + index] * feedback);
        ring[1 + index] = dry;
        ring[1 + delay + index] = wet;
        ring[0] = cursor + 1 < delay ? cursor + 1 : delay + (index + 1) % delay;
      }
      out[i * channels + ch] = f32(dry * (1 - mix) + wet * mix);
    }
  }
  return NT_OK;
}

int nt_audio_delay_block(double* state, const float* in, float* out, size_t frames, uint32_t channels, double sample_rate, double delay_seconds, double feedback, double mix) {
  if (!(delay_seconds <= NT_AUDIO_MAX_STREAM_DELAY_SECONDS)) return NT_ERR_ARGS;
  return audioDelayBlock(state, in, out, frames, channels, sample_rate, delay_seconds, feedback, mix);
}


size_t nt_resample_output_frames(size_t frames, double in_rate, double out_rate) {
  if (!nt::kernels::validSampleRate(in_rate) || !nt::kernels::validSampleRate(out_rate)) return 0;
  return static_cast<size_t>(nt::kernels::saturatingFrames(jsRound(frames * out_rate / in_rate)));
}

int nt_resample(const float* in, float* out, size_t frames, uint32_t channels, double in_rate, double out_rate) {
  if (!channels || !nt::kernels::validSampleRate(in_rate) || !nt::kernels::validSampleRate(out_rate)) return NT_ERR_ARGS;
  if (!frames) return NT_OK;
  if (!in || !out) return NT_ERR_ARGS;
  if (in_rate == out_rate) { std::copy_n(in, frames * channels, out); return NT_OK; }
  const size_t count = nt_resample_output_frames(frames, in_rate, out_rate);
  const double cutoff = std::min(1.0, out_rate / in_rate);
  // 32 zero crossings per side, with a Hann window. Widen on downsampling
  // to retain the same stopband rejection below the new Nyquist frequency.
  const double radius = 32 / cutoff;
  std::vector<double> weights;
  for (size_t i = 0; i < count; i++) {
    const double position = i * in_rate / out_rate;
    const size_t begin = static_cast<size_t>(std::max(0.0, std::ceil(position - radius)));
    const size_t end = static_cast<size_t>(std::min(static_cast<double>(frames), std::floor(position + radius) + 1));
    weights.resize(end - begin);
    double weight = 0;
    for (size_t j = begin; j < end; j++) {
      const double distance = position - j;
      const double x = kPi * distance * cutoff;
      const double sinc = x == 0 ? 1 : std::sin(x) / x;
      const double w = sinc * (0.5 + 0.5 * std::cos(kPi * distance / radius));
      weights[j - begin] = w;
      weight += w;
    }
    for (uint32_t ch = 0; ch < channels; ch++) {
      double sum = 0;
      for (size_t j = begin; j < end; j++) {
        sum += in[j * channels + ch] * weights[j - begin];
      }
      out[i * channels + ch] = f32(weight == 0 ? 0 : sum / weight);
    }
  }
  return NT_OK;
}

}  // extern "C"
