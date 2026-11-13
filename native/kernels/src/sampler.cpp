// The kernel of the Sampler node (nodetool.audio.synth.Sampler): a polyphonic
// sample player. The voices and the declick levels live in the caller's
// state array, and every frame depends only on that state and on the inputs
// of that frame, so a chunked stream equals a single pass.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace {

using nt::kernels::f32;

// The state starts with {gate was high, next serial} and one declick level
// for each channel. The voices follow.
constexpr size_t kHeader = 2;

// The fields of one voice.
enum Field : size_t { kStage, kPosition, kRate, kAge, kRelease, kSerial };

// A held voice plays at full level. A released voice fades out.
enum Stage : uint32_t { kIdle, kHeld, kReleased };

// A voice steps through the sample by 1/64 to 64 frames for each output
// frame: six octaves down to six octaves up.
constexpr double kMinRate = 1.0 / 64;
constexpr double kMaxRate = 64;
constexpr double kMaxOctaves = 6;

// A voice that stops at a level above zero leaves that level in the declick
// level of its channel. The level decays by this factor for each frame
// (about 3 ms at 44.1 kHz), so the stop is a short fade and not a click.
constexpr double kDeclickDecay = 1 - 1.0 / 128;
constexpr double kSilence = 1e-5;

bool high(float value) { return value >= NT_GATE_THRESHOLD; }

// The declick level of the next frame. A level below kSilence, or one that
// is not a number, gives 0.
double decayed(double level) {
  const double next = level * kDeclickDecay;
  return std::isfinite(next) && std::abs(next) >= kSilence ? next : 0;
}

// A rate inside [kMinRate, kMaxRate]. NaN gives 1.
double boundedRate(double rate) {
  if (!(rate >= kMinRate)) return rate < kMinRate ? kMinRate : 1;
  return std::min(rate, kMaxRate);
}

// The rate of a new voice: base * 2^pitch.
double voiceRate(double base, float pitch) {
  const double octaves =
      std::isfinite(pitch) ? std::clamp(static_cast<double>(pitch), -kMaxOctaves, kMaxOctaves) : 0;
  return boundedRate(boundedRate(base) * std::pow(2, octaves));
}

Stage stageOf(const double* voice) {
  const uint32_t stage = nt::kernels::toUint32(voice[kStage]);
  return stage <= kReleased ? static_cast<Stage>(stage) : kIdle;
}

// The sample that the voices read.
struct Clip {
  const float* data;
  size_t frames;
  uint32_t channels;
  bool loop;

  float at(size_t frame, uint32_t channel) const { return data[frame * channels + channel]; }

  // The value at frame `index` + `t`, with t in [0, 1): a Catmull-Rom curve
  // through the four nearest frames. A neighbour past an end is the frame
  // at the other end in a loop, and the end frame otherwise.
  double read(size_t index, double t, uint32_t channel) const {
    const double y1 = at(index, channel);
    if (t == 0) return y1;
    const size_t last = frames - 1;
    const double y0 = at(index > 0 ? index - 1 : (loop ? last : 0), channel);
    const double y2 = at(index < last ? index + 1 : (loop ? 0 : last), channel);
    const double y3 = at(index + 2 <= last ? index + 2 : (loop ? (index + 2) % frames : last), channel);
    const double a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
    const double b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const double c = -0.5 * y0 + 0.5 * y2;
    return ((a * t + b) * t + c) * t + y1;
  }
};

// The fades of every voice.
struct Envelope {
  double attackFrames;
  double releaseStep;

  double level(double age, double release) const {
    return (attackFrames > 0 ? std::min(1.0, age / attackFrames) : 1.0) * release;
  }
};

// The playback values of a voice, read from the state array with every
// value brought into its range.
struct Playhead {
  double position;
  double rate;
  double age;
  double release;

  explicit Playhead(const double* voice)
      : position(voice[kPosition]),
        rate(boundedRate(voice[kRate])),
        age(voice[kAge] >= 0 ? voice[kAge] : 0),
        release(voice[kRelease] >= 0 ? std::min(voice[kRelease], 1.0) : 0) {}

  // Brings the position into the clip. False when the voice is past the end.
  bool seek(const Clip& clip) {
    const double length = static_cast<double>(clip.frames);
    if (clip.loop && position >= length) position = std::fmod(position, length);
    return position >= 0 && position < length;
  }
};

// Adds one frame of a voice to `mix` and moves the voice by one frame. A
// voice past the end of the sample stops: the last frame's level goes to
// `mix`, and its decay goes to `residual`.
void stepVoice(double* voice, const Clip& clip, const Envelope& envelope, double* mix, double* residual) {
  Stage stage = stageOf(voice);
  if (stage == kIdle) return;
  Playhead head(voice);
  const double level = envelope.level(head.age, head.release);
  if (!head.seek(clip)) {
    for (uint32_t ch = 0; ch < clip.channels; ch++) {
      const double tail = clip.frames ? clip.at(clip.frames - 1, ch) * level : 0;
      mix[ch] += tail;
      residual[ch] += tail * kDeclickDecay;
    }
    voice[kStage] = kIdle;
    return;
  }
  const size_t index = static_cast<size_t>(head.position);
  const double t = head.position - static_cast<double>(index);
  for (uint32_t ch = 0; ch < clip.channels; ch++) mix[ch] += clip.read(index, t, ch) * level;
  head.age += 1;
  head.position += head.rate;
  if (stage == kReleased) {
    head.release -= envelope.releaseStep;
    if (!(head.release > 0)) stage = kIdle;
  }
  voice[kStage] = stage;
  voice[kPosition] = head.position;
  voice[kRate] = head.rate;
  voice[kAge] = head.age;
  voice[kRelease] = head.release;
}

// Starts a voice at the first frame of the sample. It takes an idle voice,
// or the oldest voice when all sound. The level of a replaced voice goes to
// `residual`.
void trigger(double* voices, uint32_t count, const Clip& clip, const Envelope& envelope, double rate,
             double* serial, double* residual) {
  if (!clip.frames) return;
  double* chosen = nullptr;
  double oldest = 0;
  for (uint32_t v = 0; v < count; v++) {
    double* voice = voices + v * NT_SAMPLER_VOICE_LEN;
    if (stageOf(voice) == kIdle) {
      chosen = voice;
      break;
    }
    // A serial that is not a number counts as the oldest.
    const double order = std::isfinite(voice[kSerial]) ? voice[kSerial] : -1;
    if (!chosen || order < oldest) {
      chosen = voice;
      oldest = order;
    }
  }
  if (stageOf(chosen) != kIdle) {
    Playhead head(chosen);
    if (head.seek(clip)) {
      const double level = envelope.level(head.age, head.release);
      const size_t index = static_cast<size_t>(head.position);
      const double t = head.position - static_cast<double>(index);
      for (uint32_t ch = 0; ch < clip.channels; ch++) residual[ch] += clip.read(index, t, ch) * level;
    }
  }
  chosen[kStage] = kHeld;
  chosen[kPosition] = 0;
  chosen[kRate] = rate;
  chosen[kAge] = 0;
  chosen[kRelease] = 1;
  chosen[kSerial] = *serial;
  *serial += 1;
}

}  // namespace

extern "C" {

size_t nt_sampler_state_len(uint32_t voices, uint32_t channels) {
  if (voices < 1 || voices > NT_SAMPLER_MAX_VOICES) return 0;
  if (channels < 1 || channels > NT_SAMPLER_MAX_CHANNELS) return 0;
  return kHeader + channels + static_cast<size_t>(voices) * NT_SAMPLER_VOICE_LEN;
}

int nt_sampler_process(double* state, uint32_t voices, const float* sample, size_t sample_frames,
                       uint32_t channels, const float* gate, const float* pitch, float* out,
                       size_t frames, int mode, double rate, double attack_frames,
                       double release_frames, double gain) {
  if (!state || !nt_sampler_state_len(voices, channels)) return NT_ERR_ARGS;
  if (mode < NT_SAMPLER_ONE_SHOT || mode > NT_SAMPLER_LOOP) return NT_ERR_ARGS;
  if ((frames && !out) || (sample_frames && !sample)) return NT_ERR_ARGS;

  double* residual = state + kHeader;
  double* voiceState = residual + channels;
  const Clip clip{sample, sample_frames, channels, mode == NT_SAMPLER_LOOP};
  const Envelope envelope{attack_frames, release_frames >= 1 ? 1 / release_frames : 1};
  bool gateWasHigh = state[0] != 0;
  double serial = std::isfinite(state[1]) ? state[1] : 0;

  for (size_t i = 0; i < frames; i++) {
    const bool gateHigh = gate ? high(gate[i]) : true;
    if (gateHigh && !gateWasHigh) {
      trigger(voiceState, voices, clip, envelope, voiceRate(rate, pitch ? pitch[i] : 0.0f), &serial,
              residual);
    } else if (!gateHigh && gateWasHigh && mode != NT_SAMPLER_ONE_SHOT) {
      for (uint32_t v = 0; v < voices; v++) {
        double* voice = voiceState + v * NT_SAMPLER_VOICE_LEN;
        if (stageOf(voice) == kHeld) voice[kStage] = kReleased;
      }
    }
    gateWasHigh = gateHigh;

    double mix[NT_SAMPLER_MAX_CHANNELS];
    for (uint32_t ch = 0; ch < channels; ch++) {
      mix[ch] = std::isfinite(residual[ch]) ? residual[ch] : 0;
      residual[ch] = decayed(residual[ch]);
    }
    for (uint32_t v = 0; v < voices; v++) {
      stepVoice(voiceState + v * NT_SAMPLER_VOICE_LEN, clip, envelope, mix, residual);
    }
    for (uint32_t ch = 0; ch < channels; ch++) out[i * channels + ch] = f32(mix[ch] * gain);
  }

  state[0] = gateWasHigh ? 1 : 0;
  state[1] = serial;
  int sounding = 0;
  for (uint32_t v = 0; v < voices; v++) {
    if (stageOf(voiceState + v * NT_SAMPLER_VOICE_LEN) != kIdle) sounding++;
  }
  for (uint32_t ch = 0; ch < channels; ch++) {
    if (std::isfinite(residual[ch]) && std::abs(residual[ch]) >= kSilence) return sounding + 1;
  }
  return sounding;
}

}  // extern "C"
