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

// Runs `effect(input, output)` once for each channel. `effect` receives the
// channel's samples as Strided views and writes output frame i through
// `write(i, value)`.
template <typename Effect>
void perChannel(const float* in, float* out, size_t frames, uint32_t channels,
                Effect&& effect) {
  for (uint32_t ch = 0; ch < channels; ch++) {
    const Strided input{in + ch, channels};
    float* channelOut = out + ch;
    effect(input, [&](size_t i, double value) {
      channelOut[i * channels] = f32(value);
    }, frames);
  }
}

// A Schroeder comb filter with a one-pole lowpass in its feedback path.
// Thread affinity: one caller at a time; it holds only its own delay line.
class CombFilter {
 public:
  CombFilter(size_t delay, double feedback, double damp)
      : buffer_(std::max<size_t>(1, delay)), feedback_(feedback), damp_(damp) {}
  float tick(float input) {
    const float delayed = buffer_[index_];
    filterStore_ = delayed * (1 - damp_) + filterStore_ * damp_;
    buffer_[index_] = f32(input + filterStore_ * feedback_);
    index_ = (index_ + 1) % buffer_.size();
    return delayed;
  }

 private:
  std::vector<float> buffer_;
  size_t index_ = 0;
  double filterStore_ = 0;
  double feedback_;
  double damp_;
};

// A Schroeder allpass. Thread affinity: as CombFilter.
class AllpassFilter {
 public:
  AllpassFilter(size_t delay, double feedback)
      : buffer_(std::max<size_t>(1, delay)), feedback_(feedback) {}
  float tick(float input) {
    const float delayed = buffer_[index_];
    buffer_[index_] = f32(input + delayed * feedback_);
    index_ = (index_ + 1) % buffer_.size();
    return f32(delayed - input * feedback_);
  }

 private:
  std::vector<float> buffer_;
  size_t index_ = 0;
  double feedback_;
};

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
  if (!validAudio(in, out, channels)) return NT_ERR_ARGS;
  // At bit depth 1 the level count would be 1, and below it 0 (NaN samples).
  const double levels = std::max(1.0, std::pow(2, bit_depth) - 1);
  const size_t hold = std::max<uint32_t>(1, reduction);
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    for (size_t i = 0; i < n; i++) {
      const size_t source = std::min((i / hold) * hold, n - 1);
      write(i, jsRound(input[source] * levels) / levels);
    }
  });
  return NT_OK;
}

int nt_audio_compress(const float* in, float* out, size_t frames,
                      uint32_t channels, double sample_rate,
                      double threshold_db, double ratio, double attack_ms,
                      double release_ms, int auto_gain) {
  if (!validAudio(in, out, channels, sample_rate) || ratio <= 0) return NT_ERR_ARGS;
  // Half of the reduction a 0 dBFS peak would receive: restores most of the
  // loudness without clipping under-compressed transients.
  const double makeupDb = auto_gain ? (-threshold_db * (1 - 1 / ratio)) / 2 : 0;
  const double makeup = dbToGain(makeupDb);
  const double attack = timeCoeff(sample_rate, attack_ms);
  const double release = timeCoeff(sample_rate, release_ms);
  const double threshold = dbToGain(threshold_db);
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    double envelope = 0;
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
  });
  return NT_OK;
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
  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  const double threshold = dbToGain(threshold_db);
  // Limited peaks sit at the threshold, so 1 / threshold brings them to 0 dBFS.
  const double makeup = auto_gain ? 1 / threshold : 1;
  const double release = timeCoeff(sample_rate, release_ms);
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    double gain = 1;
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
  });
  return NT_OK;
}

int nt_audio_reverb(const float* in, float* out, size_t frames,
                    uint32_t channels, double sample_rate, double room_scale,
                    double damping, double wet_level, double dry_level) {
  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  constexpr std::array<double, 4> kCombDelays{1557, 1617, 1491, 1422};
  constexpr std::array<double, 2> kAllpassDelays{225, 556};
  const double scale = sample_rate / 44100;
  const double feedback = room_scale * 0.28 + 0.7;
  const auto delayOf = [&](double base) {
    return static_cast<size_t>(jsRound(base * scale));
  };
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    std::vector<CombFilter> combs;
    for (double base : kCombDelays) combs.emplace_back(delayOf(base), feedback, damping);
    std::vector<AllpassFilter> allpasses;
    for (double base : kAllpassDelays) allpasses.emplace_back(delayOf(base), 0.5);
    for (size_t i = 0; i < n; i++) {
      const float dry = input[i];
      float wet = 0;
      for (auto& comb : combs) wet = f32(static_cast<double>(wet) + comb.tick(dry));
      for (auto& allpass : allpasses) wet = allpass.tick(wet);
      write(i, dry * dry_level + wet * wet_level);
    }
  });
  return NT_OK;
}

int nt_audio_noise_gate(const float* in, float* out, size_t frames,
                        uint32_t channels, double sample_rate,
                        double threshold_db, double attack_ms,
                        double release_ms) {
  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  const double threshold = dbToGain(threshold_db);
  const double attack = timeCoeff(sample_rate, std::max(0.1, attack_ms));
  const double release = timeCoeff(sample_rate, std::max(1.0, release_ms));
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    double envelope = 0;
    double gain = 0;
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
  });
  return NT_OK;
}

int nt_audio_phaser(const float* in, float* out, size_t frames,
                    uint32_t channels, double sample_rate, double rate_hz,
                    double depth, double centre_frequency_hz, double feedback,
                    double mix) {
  if (!validAudio(in, out, channels, sample_rate)) return NT_ERR_ARGS;
  constexpr int kStages = 4;
  const double twoPi = 2 * kPi;
  const double lfoIncrement = (2 * kPi * rate_hz) / sample_rate;
  perChannel(in, out, frames, channels, [&](Strided input, auto write, size_t n) {
    // x[n-1] and y[n-1] of each stage, float32 as in the TypeScript loop.
    std::array<float, kStages> xPrev{};
    std::array<float, kStages> yPrev{};
    double feedbackSample = 0;
    double lfoPhase = 0;
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
  });
  return NT_OK;
}

size_t nt_audio_delay_output_frames(size_t frames, double sample_rate,
                                    double delay_seconds) {
  const auto delay = delayFrames(sample_rate, delay_seconds);
  return delay ? frames + *delay * 4 : 0;
}

int nt_audio_delay(const float* in, float* out, size_t frames,
                   uint32_t channels, double sample_rate, double delay_seconds,
                   double feedback, double mix) {
  const auto delayLine = delayFrames(sample_rate, delay_seconds);
  if (!validAudio(in, out, channels, sample_rate) || !delayLine) return NT_ERR_ARGS;
  const size_t delay = *delayLine;
  const size_t outFrames = nt_audio_delay_output_frames(frames, sample_rate, delay_seconds);
  std::vector<float> wet(outFrames);
  for (uint32_t ch = 0; ch < channels; ch++) {
    const auto dryAt = [&](size_t i) -> float {
      return i < frames ? in[i * channels + ch] : 0.0f;
    };
    std::fill(wet.begin(), wet.end(), 0.0f);
    // Wet holds only the echoes: the delayed dry signal plus the feedback of
    // the delay line, so `mix` blends dry against wet.
    for (size_t i = delay; i < outFrames; i++) {
      wet[i] = f32(dryAt(i - delay) + wet[i - delay] * feedback);
    }
    for (size_t i = 0; i < outFrames; i++) {
      out[i * channels + ch] = f32(dryAt(i) * (1 - mix) + wet[i] * mix);
    }
  }
  return NT_OK;
}

}  // extern "C"
