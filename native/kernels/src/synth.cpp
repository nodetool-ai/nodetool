// Kernels of the modular synthesis nodes (nodetool.audio.synth.*). Each one
// processes one chunk and carries its state across chunks in a caller-owned
// array of doubles, so a chunked stream equals a single pass.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace {

using nt::kernels::f32;
using nt::kernels::jsRound;
using nt::kernels::kPi;

// Mulberry32: a 32-bit PRNG with its whole state in one uint32, so the state
// fits a double of the caller's state array.
double nextNoise(double* seed) {
  uint32_t a = nt::kernels::toUint32(*seed) + 0x6D2B79F5u;
  *seed = a;
  uint32_t t = a;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  t ^= t >> 14;
  return (t / 4294967296.0) * 2 - 1;
}

// One naive (not band-limited) waveform sample for phase in [0, 1). Noise
// reads `seed`, or gives 0 when it is null.
double waveSample(int wave, double phase, double pulseWidth, double* seed) {
  switch (wave) {
    case NT_WAVE_SAW: return 2 * phase - 1;
    case NT_WAVE_SQUARE: return phase < pulseWidth ? 1 : -1;
    case NT_WAVE_TRIANGLE: return 1 - 4 * std::abs(phase - 0.5);
    case NT_WAVE_NOISE: return seed ? nextNoise(seed) : 0;
    default: return std::sin(2 * kPi * phase);
  }
}

// The attack pole drives toward this overshoot and switches to decay at 1.0,
// so the named attack time is met instead of approached asymptotically.
constexpr double kAttackTarget = 1.3;

double adsrCoeff(double seconds, double sampleRate) {
  return 1 - std::exp(-1 / std::max(1.0, seconds * sampleRate));
}

bool high(float value) { return value >= NT_GATE_THRESHOLD; }

}  // namespace

extern "C" {

void nt_osc_process(double* state, int waveform, double base_frequency,
                    double amplitude, double pulse_width, double fm_amount,
                    double sample_rate, const float* pitch, const float* fm,
                    float* out, size_t count) {
  double phase = state[0];
  const double nyquist = sample_rate / 2 - 1e-6;
  for (size_t i = 0; i < count; i++) {
    const double p = pitch ? pitch[i] : 0;
    const double m = fm ? fm[i] : 0;
    const double freq = base_frequency * std::pow(2, p) * (1 + fm_amount * m);
    const double f = std::min(std::max(freq, 0.0), nyquist);
    out[i] = f32(amplitude * waveSample(waveform, phase, pulse_width, &state[1]));
    phase = std::fmod(phase + f / sample_rate, 1.0);
  }
  state[0] = phase;
}

void nt_lfo_process(double* state, int waveform, double rate_hz, double depth,
                    double offset, double sample_rate, const float* clock,
                    float* out, size_t count) {
  double phase = state[0];
  bool clockWasHigh = state[1] != 0;
  for (size_t i = 0; i < count; i++) {
    if (clock) {
      const bool isHigh = high(clock[i]);
      if (isHigh && !clockWasHigh) phase = 0;
      clockWasHigh = isHigh;
    }
    out[i] = f32(offset + depth * waveSample(waveform, phase, 0.5, nullptr));
    phase = std::fmod(phase + rate_hz / sample_rate, 1.0);
  }
  state[0] = phase;
  state[1] = clockWasHigh ? 1 : 0;
}

void nt_adsr_process(double* state, double attack_seconds, double decay_seconds,
                     double sustain, double release_seconds,
                     double sample_rate, const float* gate, float* out,
                     size_t count) {
  const double attack = adsrCoeff(attack_seconds, sample_rate);
  const double decay = adsrCoeff(decay_seconds, sample_rate);
  const double release = adsrCoeff(release_seconds, sample_rate);
  // A stage outside the enum, from a state the caller wrote, is idle.
  const uint32_t savedStage = nt::kernels::toUint32(state[0]);
  int stage = savedStage <= NT_ADSR_RELEASE ? static_cast<int>(savedStage) : NT_ADSR_IDLE;
  double env = state[1];
  bool gateWasHigh = state[2] != 0;
  for (size_t i = 0; i < count; i++) {
    const bool gateHigh = high(gate[i]);
    if (gateHigh && !gateWasHigh) {
      stage = NT_ADSR_ATTACK;
    } else if (!gateHigh && gateWasHigh) {
      stage = NT_ADSR_RELEASE;
    }
    gateWasHigh = gateHigh;
    switch (stage) {
      case NT_ADSR_ATTACK:
        env += attack * (kAttackTarget - env);
        if (env >= 1) {
          env = 1;
          stage = NT_ADSR_DECAY;
        }
        break;
      case NT_ADSR_DECAY:
        env += decay * (sustain - env);
        if (std::abs(env - sustain) < 1e-4) {
          env = sustain;
          stage = NT_ADSR_SUSTAIN;
        }
        break;
      case NT_ADSR_SUSTAIN:
        env = sustain;
        break;
      case NT_ADSR_RELEASE:
        env += release * (0 - env);
        if (env < 1e-5) {
          env = 0;
          stage = NT_ADSR_IDLE;
        }
        break;
      default:
        env = 0;
        break;
    }
    out[i] = f32(env);
  }
  state[0] = stage;
  state[1] = env;
  state[2] = gateWasHigh ? 1 : 0;
}

void nt_gate_process(double start_frame, double on_seconds, double off_seconds,
                     double amplitude, double sample_rate, float* out,
                     size_t count) {
  using nt::kernels::saturatingFrames;
  // Each segment is at least one frame and at most 2^52, so the period
  // cannot overflow.
  constexpr uint64_t kMaxSegment = uint64_t{1} << 52;
  const uint64_t onFrames =
      std::max<uint64_t>(1, saturatingFrames(jsRound(on_seconds * sample_rate), kMaxSegment));
  const uint64_t periodFrames =
      onFrames + std::max<uint64_t>(1, saturatingFrames(jsRound(off_seconds * sample_rate), kMaxSegment));
  const uint64_t start = saturatingFrames(start_frame);
  for (size_t i = 0; i < count; i++) {
    out[i] = (start + i) % periodFrames < onFrames ? f32(amplitude) : 0.0f;
  }
}

void nt_vca_process(const float* in, const float* cv, float* out, size_t frames,
                    uint32_t channels, double gain) {
  const size_t count = frames * channels;
  for (size_t i = 0; i < count; i++) {
    const double level = cv ? std::max(0.0, static_cast<double>(cv[i / channels])) : 1;
    out[i] = f32(in[i] * gain * level);
  }
}

void nt_sample_hold_process(double* state, const float* signal,
                            const float* trigger, float* out, size_t count) {
  double held = state[0];
  bool triggerWasHigh = state[1] != 0;
  for (size_t i = 0; i < count; i++) {
    const bool isHigh = trigger && high(trigger[i]);
    if (isHigh && !triggerWasHigh) held = signal[i];
    triggerWasHigh = isHigh;
    out[i] = f32(held);
  }
  state[0] = held;
  state[1] = triggerWasHigh ? 1 : 0;
}

}  // extern "C"
