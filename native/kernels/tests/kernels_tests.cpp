// Native tests of the kernel library. Parity with the TypeScript loops that
// the kernels replaced is tested in packages/kernels, against the
// WebAssembly build of the same sources.
#include "nodetool/kernels.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <random>
#include <string>
#include <vector>

namespace {

int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
    failures++;
  }
}

std::vector<uint8_t> randomImage(uint32_t w, uint32_t h, unsigned seed) {
  std::mt19937 rng(seed);
  std::vector<uint8_t> image(static_cast<size_t>(w) * h * 4);
  for (auto& byte : image) byte = static_cast<uint8_t>(rng() & 0xff);
  return image;
}

std::vector<float> randomSignal(size_t count, unsigned seed) {
  std::mt19937 rng(seed);
  std::uniform_real_distribution<float> dist(-1, 1);
  std::vector<float> signal(count);
  for (auto& sample : signal) sample = dist(rng);
  return signal;
}

bool alphaKept(const std::vector<uint8_t>& src, const std::vector<uint8_t>& dst) {
  for (size_t i = 3; i < src.size(); i += 4) {
    if (src[i] != dst[i]) return false;
  }
  return true;
}

// The rank filter as the TypeScript loop wrote it: gather and sort.
std::vector<uint8_t> rankReference(const std::vector<uint8_t>& src, int w, int h,
                                   int size, int rank) {
  std::vector<uint8_t> out = src;
  const int half = std::clamp(size, 1, 25) / 2;
  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      for (int c = 0; c < 3; c++) {
        std::vector<uint8_t> window;
        for (int ky = -half; ky <= half; ky++) {
          for (int kx = -half; kx <= half; kx++) {
            const int ny = std::clamp(y + ky, 0, h - 1);
            const int nx = std::clamp(x + kx, 0, w - 1);
            window.push_back(src[(ny * w + nx) * 4 + c]);
          }
        }
        std::sort(window.begin(), window.end());
        out[(y * w + x) * 4 + c] = window[std::min<size_t>(rank, window.size() - 1)];
      }
    }
  }
  return out;
}

void testRankFilter() {
  const uint32_t w = 37, h = 23;
  const auto src = randomImage(w, h, 7);
  std::vector<uint8_t> dst(src.size());
  for (int size : {1, 3, 4, 7, 9, 25}) {
    for (int rank : {0, 3, 24, 600}) {
      check(nt_image_rank_filter(src.data(), dst.data(), w, h, size, rank) == NT_OK,
            "rank filter accepts its arguments");
      check(dst == rankReference(src, w, h, size, rank),
            "rank filter size " + std::to_string(size) + " rank " + std::to_string(rank));
    }
  }
}

void testHistogramKernels() {
  const uint32_t w = 16, h = 8;
  std::vector<uint8_t> src(w * h * 4);
  for (size_t p = 0; p < w * h; p++) {
    for (int c = 0; c < 3; c++) src[p * 4 + c] = static_cast<uint8_t>(50 + (p * 150) / (w * h - 1));
    src[p * 4 + 3] = static_cast<uint8_t>(p);
  }
  std::vector<uint8_t> dst(src.size());

  check(nt_image_auto_contrast(src.data(), dst.data(), w, h, 0) == NT_OK, "auto contrast runs");
  check(dst[0] == 0 && dst[(w * h - 1) * 4] == 255, "auto contrast stretches to 0..255");
  check(alphaKept(src, dst), "auto contrast keeps alpha");

  check(nt_image_equalize(src.data(), dst.data(), w, h) == NT_OK, "equalize runs");
  check(dst[0] == 0 && dst[(w * h - 1) * 4] == 255, "equalize maps the range to 0..255");
  check(alphaKept(src, dst), "equalize keeps alpha");

  // A grid finer than the image leaves tiles with no pixels.
  for (uint32_t grid : {1u, 8u, 64u}) {
    check(nt_image_adaptive_contrast(src.data(), dst.data(), w, h, 2, grid) == NT_OK,
          "adaptive contrast runs with grid " + std::to_string(grid));
    check(alphaKept(src, dst), "adaptive contrast keeps alpha");
  }
  check(nt_image_adaptive_contrast(src.data(), dst.data(), w, h, 2, 0) == NT_ERR_ARGS,
        "adaptive contrast rejects a zero grid");
}

void testBiquad() {
  double coeffs[NT_BIQUAD_COEFFS_LEN];
  check(nt_biquad_design_webaudio(NT_BIQUAD_LOWPASS, 48000, 1000, 1, 0, coeffs) == NT_OK,
        "web audio lowpass design");
  const double dcGain = (coeffs[0] + coeffs[1] + coeffs[2]) / (1 + coeffs[3] + coeffs[4]);
  check(std::abs(dcGain - 1) < 1e-12, "lowpass has unit gain at DC");
  check(nt_biquad_design_webaudio(NT_BIQUAD_LOWPASS, 48000, 0, 1, 0, coeffs) == NT_OK &&
            coeffs[0] == 0,
        "lowpass at 0 Hz is silent");
  check(nt_biquad_design_rbj(NT_BIQUAD_BANDPASS, 48000, 1000, 1, 0, coeffs) == NT_ERR_ARGS,
        "rbj rejects bandpass");

  // Chunked processing with carried state equals one pass.
  nt_biquad_design_rbj(NT_BIQUAD_HIGHPASS, 24000, 800, 0.7071, 0, coeffs);
  const uint32_t channels = 2;
  const size_t frames = 1000;
  const auto in = randomSignal(frames * channels, 3);
  std::vector<float> whole(in.size()), chunked(in.size());
  std::vector<double> state(NT_BIQUAD_STATE_LEN * channels, 0);
  nt_biquad_process(coeffs, state.data(), in.data(), whole.data(), frames, channels);
  std::fill(state.begin(), state.end(), 0);
  for (size_t start = 0; start < frames; start += 333) {
    const size_t n = std::min<size_t>(333, frames - start);
    nt_biquad_process(coeffs, state.data(), in.data() + start * channels,
                      chunked.data() + start * channels, n, channels);
  }
  check(whole == chunked, "chunked biquad equals one pass");
}

void testSynth() {
  const size_t count = 2048;
  std::vector<float> whole(count), chunked(count);
  double state[NT_OSC_STATE_LEN] = {0, 12345};
  nt_osc_process(state, NT_WAVE_NOISE, 440, 0.5, 0.5, 0, 24000, nullptr, nullptr,
                 whole.data(), count);
  double chunkState[NT_OSC_STATE_LEN] = {0, 12345};
  for (size_t start = 0; start < count; start += 512) {
    nt_osc_process(chunkState, NT_WAVE_NOISE, 440, 0.5, 0.5, 0, 24000, nullptr,
                   nullptr, chunked.data() + start, 512);
  }
  check(whole == chunked, "chunked noise oscillator equals one pass");
  check(std::all_of(whole.begin(), whole.end(), [](float s) { return std::abs(s) <= 0.5f; }),
        "noise stays within its amplitude");

  std::vector<float> gate(count, 1.0f);
  std::fill(gate.begin() + 1500, gate.end(), 0.0f);
  std::vector<float> env(count);
  double adsr[NT_ADSR_STATE_LEN] = {};
  nt_adsr_process(adsr, 0.005, 0.002, 0.6, 0.01, 24000, gate.data(), env.data(), count);
  check(std::abs(env[1400] - 0.6f) < 1e-6, "adsr holds the sustain level");
  check(env[count - 1] < env[1499], "adsr releases after the gate falls");

  std::vector<float> pattern(10);
  nt_gate_process(4, 2.0 / 10, 3.0 / 10, 0.8, 10, pattern.data(), pattern.size());
  // Frames 4..13 of a period of 5 frames with 2 frames on.
  const float expected[10] = {0, 0.8f, 0.8f, 0, 0, 0, 0.8f, 0.8f, 0, 0};
  check(std::equal(pattern.begin(), pattern.end(), expected), "gate pattern");
}

void testEffects() {
  const uint32_t channels = 2;
  const size_t frames = 4800;
  const auto in = randomSignal(frames * channels, 11);
  std::vector<float> out(in.size());
  const auto finite = [&] {
    return std::all_of(out.begin(), out.end(), [](float s) { return std::isfinite(s); });
  };
  check(nt_audio_compress(in.data(), out.data(), frames, channels, 48000, -20, 4, 5, 50, 1) == NT_OK && finite(),
        "compress");
  check(nt_audio_limiter(in.data(), out.data(), frames, channels, 48000, -2, 250, 1) == NT_OK && finite(),
        "limiter");
  check(nt_audio_reverb(in.data(), out.data(), frames, channels, 8000, 0.5, 0.5, 0.3, 0.7) == NT_OK && finite(),
        "reverb at a low sample rate");
  check(nt_audio_noise_gate(in.data(), out.data(), frames, channels, 48000, -50, 0, 0) == NT_OK && finite(),
        "noise gate clamps its times");
  check(nt_audio_phaser(in.data(), out.data(), frames, channels, 48000, 1, 0.5, 1300, 0.5, 0.5) == NT_OK && finite(),
        "phaser");
  check(nt_audio_bitcrush(in.data(), out.data(), frames, channels, 1, 0) == NT_OK && finite(),
        "bitcrush at the minimum bit depth and a zero reduction");

  // An impulse through the delay gives echoes at multiples of the delay.
  std::vector<float> impulse(10, 0.0f);
  impulse[0] = 1;
  const size_t outFrames = nt_audio_delay_output_frames(10, 10, 0.3);
  check(outFrames == 22, "delay output length");
  std::vector<float> echoes(outFrames);
  nt_audio_delay(impulse.data(), echoes.data(), 10, 1, 10, 0.3, 0.5, 1);
  check(echoes[0] == 0 && echoes[3] == 1 && echoes[6] == 0.5f && echoes[9] == 0.25f,
        "delay echoes");
}

// Doubles a caller controls (arguments and state arrays) never reach an
// undefined cast. The UBSan build turns any such cast into a failure.
void testHostileDoubles() {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double inf = std::numeric_limits<double>::infinity();
  std::vector<float> out(64);

  for (double seed : {nan, inf, -inf, -1.0, 1e300, -1e300, 4294967296.5}) {
    double state[NT_OSC_STATE_LEN] = {0, seed};
    nt_osc_process(state, NT_WAVE_NOISE, 440, 1, 0.5, 0, 48000, nullptr, nullptr, out.data(), out.size());
    check(std::all_of(out.begin(), out.end(), [](float s) { return std::isfinite(s); }),
          "noise from any seed is finite");
  }
  for (double stage : {nan, inf, -1.0, 1e300, 99.0}) {
    double state[NT_ADSR_STATE_LEN] = {stage, 0.5, 0};
    std::vector<float> gate(64, 0.0f);
    nt_adsr_process(state, 0.01, 0.01, 0.5, 0.01, 48000, gate.data(), out.data(), out.size());
    check(out[0] == 0.0f, "an unknown adsr stage is idle");
  }
  for (double value : {nan, inf, -inf, 1e300}) {
    nt_gate_process(value, value, value, 1, 48000, out.data(), out.size());
    nt_gate_process(0, value, 0.01, 1, value, out.data(), out.size());
  }

  check(nt_audio_delay_output_frames(10, 48000, inf) == 0, "an infinite delay has no output");
  check(nt_audio_delay_output_frames(10, 48000, NT_AUDIO_MAX_DELAY_SECONDS + 1) == 0,
        "a delay past the maximum has no output");
  check(nt_audio_delay_output_frames(10, nan, 1) == 0, "a NaN rate has no output");
  check(nt_audio_delay(out.data(), out.data() + 32, 4, 1, 48000, nan, 0.5, 0.5) == NT_ERR_ARGS,
        "a NaN delay is rejected");
  check(nt_audio_reverb(out.data(), out.data() + 32, 4, 1, 1e300, 0.5, 0.5, 0.3, 0.7) == NT_ERR_ARGS,
        "a rate past the maximum is rejected");
  double coeffs[NT_BIQUAD_COEFFS_LEN];
  check(nt_biquad_design_rbj(NT_BIQUAD_LOWPASS, inf, 1000, 1, 0, coeffs) == NT_ERR_ARGS,
        "an infinite rate is rejected");

  std::vector<uint8_t> src(4 * 4 * 4, 128), dst(src.size());
  check(nt_image_adaptive_contrast(src.data(), dst.data(), 4, 4, 2, NT_IMAGE_MAX_GRID + 1) == NT_ERR_ARGS,
        "a grid past the maximum is rejected");
  check(nt_image_adaptive_contrast(src.data(), dst.data(), 4, 4, nan, 8) == NT_OK &&
            nt_image_auto_contrast(src.data(), dst.data(), 4, 4, nan) == NT_OK,
        "NaN image parameters are defined");
}


void testStreamingHostileDoubles() {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double inf = std::numeric_limits<double>::infinity();
  const std::array<double, 7> hostile{nan, inf, -inf, -1e300, 1e300, 0, -1};
  std::vector<float> input(8, 0.5f), out(8);
  for (double bad : hostile) {
    const size_t length = nt_audio_bitcrush_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_bitcrush_block(state.data(), input.data(), out.data(), 4, 2, bad, 1) == NT_OK, "bitcrush hostile state and controls are defined");
    check(nt_audio_bitcrush_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "bitcrush hostile state rate");
    check(nt_audio_bitcrush_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "bitcrush rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_compress_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    const int status = nt_audio_compress_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, bad, bad, bad, 1);
    check(status == NT_OK || status == NT_ERR_ARGS, "compress hostile controls safely accept or reject");
    check(nt_audio_compress_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "compress hostile state rate");
    check(nt_audio_compress_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "compress rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_limiter_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_limiter_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, bad, 1) == NT_OK, "limiter hostile state and controls are defined");
    check(nt_audio_limiter_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "limiter hostile state rate");
    check(nt_audio_limiter_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "limiter rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_noise_gate_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_noise_gate_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, bad, bad) == NT_OK, "noise_gate hostile state and controls are defined");
    check(nt_audio_noise_gate_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "noise_gate hostile state rate");
    check(nt_audio_noise_gate_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "noise_gate rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_phaser_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_phaser_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, bad, bad, bad, bad) == NT_OK, "phaser hostile state and controls are defined");
    check(nt_audio_phaser_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "phaser hostile state rate");
    check(nt_audio_phaser_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "phaser rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_reverb_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_reverb_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, bad, bad, bad) == NT_OK, "reverb hostile state and controls are defined");
    check(nt_audio_reverb_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "reverb hostile state rate");
    check(nt_audio_reverb_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "reverb rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const size_t length = nt_audio_delay_state_len(2, 44100, 0.01);
    std::vector<double> state(length, bad);
    check(nt_audio_delay_block(state.data(), input.data(), out.data(), 4, 2, 44100, 0.01, bad, bad) == NT_OK, "delay hostile state and controls are defined");
    check(nt_audio_delay_state_len(2, bad, 0.01) == 0 || (bad > 0 && bad <= NT_MAX_SAMPLE_RATE), "delay hostile state rate");
    check(nt_audio_delay_init(state.data(), 0, bad, bad) == NT_ERR_ARGS, "delay rejects invalid dimensions");
  }
  for (double bad : hostile) {
    const auto length = nt_audio_delay_state_len(2, 44100, bad);
    std::vector<double> state(std::max<size_t>(length, 2));
    const int init = nt_audio_delay_init(state.data(), 2, 44100, bad);
    check(init == NT_OK || init == NT_ERR_ARGS, "hostile structural delay initialization");
    const int block = nt_audio_delay_block(state.data(), input.data(), out.data(), 4, 2, 44100, bad, 0.5, 0.5);
    check(block == NT_OK || block == NT_ERR_ARGS, "hostile structural delay block");
  }
}
void testResample() {
  check(nt_resample(nullptr, nullptr, 0, 1, 48000, 44100) == NT_OK, "empty resample");
  std::vector<float> input(48000), output(44100);
  for (size_t i = 0; i < input.size(); i++) input[i] = static_cast<float>(std::sin(2 * 3.141592653589793 * 1000 * i / 48000));
  check(nt_resample_output_frames(input.size(), 48000, 44100) == output.size(), "resample frame count");
  check(nt_resample(input.data(), output.data(), input.size(), 1, 48000, 44100) == NT_OK, "resample sine");
  double power = 0, error = 0;
  for (size_t i = 128; i < output.size() - 128; i++) {
    const double expected = std::sin(2 * 3.141592653589793 * 1000 * i / 44100);
    power += expected * expected;
    error += (output[i] - expected) * (output[i] - expected);
  }
  check(10 * std::log10(power / error) > 60, "resample SNR exceeds 60 dB");
}

// One block of a mono or stereo sampler with a level of 1.
int sample(std::vector<double>& state, uint32_t voices, const std::vector<float>& clip, uint32_t channels,
           const float* gate, const float* pitch, float* out, size_t frames, int mode, double rate = 1,
           double attack = 0, double release = 0) {
  return nt_sampler_process(state.data(), voices, clip.data(), clip.size() / channels, channels, gate, pitch,
                            out, frames, mode, rate, attack, release, 1);
}

void testSampler() {
  constexpr size_t length = 300;
  constexpr size_t count = 1024;
  std::vector<float> clip = randomSignal(length, 7);
  // The clip ends at zero, so a voice that reaches the end leaves no decay.
  clip.back() = 0;
  std::vector<float> out(count);

  // A NULL gate is high from the first frame: one voice, at the clip's rate.
  std::vector<double> state(nt_sampler_state_len(4, 1));
  int sounding = sample(state, 4, clip, 1, nullptr, nullptr, out.data(), count, NT_SAMPLER_ONE_SHOT);
  check(std::equal(clip.begin(), clip.end(), out.begin()), "a sampler voice at rate 1 copies the clip");
  check(std::all_of(out.begin() + length, out.end(), [](float s) { return s == 0; }),
        "a sampler is silent after a one-shot clip");
  check(sounding == 0, "no voice sounds after a one-shot clip");

  // Two triggers 100 frames apart sound together.
  std::vector<float> gate(count, 0.0f);
  std::fill_n(gate.begin(), 10, 1.0f);
  std::fill_n(gate.begin() + 100, 10, 1.0f);
  std::fill(state.begin(), state.end(), 0.0);
  sample(state, 4, clip, 1, gate.data(), nullptr, out.data(), count, NT_SAMPLER_ONE_SHOT);
  bool overlap = true;
  for (size_t i = 0; i < length + 100; i++) {
    const float first = i < length ? clip[i] : 0;
    const float second = i >= 100 ? clip[i - 100] : 0;
    overlap = overlap && std::abs(out[i] - (first + second)) < 1e-6f;
  }
  check(overlap, "two sampler voices sound together");

  // With one voice, the second trigger replaces the first. The replaced
  // level decays instead of a jump to zero.
  std::vector<double> mono(nt_sampler_state_len(1, 1));
  sample(mono, 1, clip, 1, gate.data(), nullptr, out.data(), count, NT_SAMPLER_ONE_SHOT);
  check(std::abs(out[100] - (clip[0] + clip[100])) < 1e-6f, "a replaced voice keeps its level for one frame");
  check(std::abs(out[101] - (clip[1] + clip[100] * (1 - 1.0f / 128))) < 1e-6f, "a replaced voice decays");
  // After frame 400 only the decay is left. It falls by 1/128 for each frame
  // and ends below -100 dB.
  check(out[450] != 0 && std::abs(out[900]) < std::abs(out[450]) * 0.05f, "the decay of a replaced voice falls");
  std::vector<float> low(2048, 0.0f), rest(2048);
  check(sample(mono, 1, clip, 1, low.data(), nullptr, rest.data(), rest.size(), NT_SAMPLER_ONE_SHOT) == 0 &&
            rest.back() == 0,
        "the decay of a replaced voice ends");

  // The pitch at the trigger sets the rate of that voice: one octave up
  // reads every second frame.
  std::vector<float> pitch(count, 1.0f);
  std::fill(state.begin(), state.end(), 0.0);
  sample(state, 4, clip, 1, gate.data(), pitch.data(), out.data(), 50, NT_SAMPLER_ONE_SHOT);
  bool octave = true;
  for (size_t i = 0; i < 50; i++) octave = octave && out[i] == clip[i * 2];
  check(octave, "a pitch of 1 plays a sampler voice one octave up");

  // A rate between frames interpolates: a ramp stays a ramp.
  std::vector<float> ramp(64);
  for (size_t i = 0; i < ramp.size(); i++) ramp[i] = static_cast<float>(i) / 64;
  std::vector<double> rampState(nt_sampler_state_len(1, 1));
  sample(rampState, 1, ramp, 1, nullptr, nullptr, out.data(), 100, NT_SAMPLER_ONE_SHOT, 0.5);
  bool linear = true;
  for (size_t i = 2; i < 100; i++) linear = linear && std::abs(out[i] - static_cast<float>(i) / 128) < 1e-6f;
  check(linear, "a sampler voice interpolates between frames");

  // A gated voice fades out after the gate falls and then stops.
  std::vector<float> ones(length, 1.0f);
  std::vector<float> held(count, 0.0f);
  std::fill_n(held.begin(), 50, 1.0f);
  std::fill(state.begin(), state.end(), 0.0);
  sounding = sample(state, 4, ones, 1, held.data(), nullptr, out.data(), 200, NT_SAMPLER_GATED, 1, 0, 20);
  check(out[49] == 1.0f && out[50] == 1.0f, "a gated voice holds its level to the falling edge");
  check(std::abs(out[60] - 0.5f) < 1e-6f, "a gated voice fades out over the release");
  check(out[75] == 0.0f && sounding == 0, "a gated voice stops after the release");
  std::fill(state.begin(), state.end(), 0.0);
  sample(state, 4, ones, 1, held.data(), nullptr, out.data(), 200, NT_SAMPLER_ONE_SHOT, 1, 0, 20);
  check(out[100] == 1.0f, "a one-shot voice ignores the falling edge");
  std::fill(state.begin(), state.end(), 0.0);
  sample(state, 4, ones, 1, held.data(), nullptr, out.data(), 200, NT_SAMPLER_GATED, 1, 10, 20);
  check(out[0] == 0.0f && std::abs(out[5] - 0.5f) < 1e-6f && out[10] == 1.0f, "a voice fades in over the attack");

  // A loop repeats the clip while the gate is high.
  const std::vector<float> four{0.1f, 0.2f, 0.3f, 0.4f};
  std::vector<double> loopState(nt_sampler_state_len(2, 1));
  sounding = sample(loopState, 2, four, 1, nullptr, nullptr, out.data(), 12, NT_SAMPLER_LOOP);
  bool repeats = true;
  for (size_t i = 0; i < 12; i++) repeats = repeats && out[i] == four[i % 4];
  check(repeats && sounding == 1, "a looped voice repeats the clip");

  // A stereo clip keeps its channels apart.
  const std::vector<float> stereo{0.1f, -0.1f, 0.2f, -0.2f, 0.0f, 0.0f};
  std::vector<double> stereoState(nt_sampler_state_len(2, 2));
  sample(stereoState, 2, stereo, 2, nullptr, nullptr, out.data(), 4, NT_SAMPLER_ONE_SHOT);
  check(std::equal(stereo.begin(), stereo.end(), out.begin()) && out[6] == 0 && out[7] == 0,
        "a stereo sampler voice keeps its channels");

  // Triggers, pitches, releases and a replaced voice: the chunked stream
  // equals one pass.
  std::vector<float> busyGate(count), busyPitch(count);
  for (size_t i = 0; i < count; i++) {
    busyGate[i] = i % 97 < 31 ? 1.0f : 0.0f;
    busyPitch[i] = static_cast<float>(static_cast<int>(i / 97) % 5 - 2) * 0.37f;
  }
  for (int mode : {NT_SAMPLER_ONE_SHOT, NT_SAMPLER_GATED, NT_SAMPLER_LOOP}) {
    std::vector<float> whole(count * 2), chunked(count * 2);
    std::vector<float> stereoClip = randomSignal(2 * 211, 11);
    std::vector<double> wholeState(nt_sampler_state_len(3, 2)), chunkState(wholeState.size());
    const int wholeSounding = sample(wholeState, 3, stereoClip, 2, busyGate.data(), busyPitch.data(),
                                     whole.data(), count, mode, 0.75, 12, 40);
    int chunkSounding = 0;
    for (size_t start = 0; start < count;) {
      const size_t frames = std::min<size_t>(1 + start % 61, count - start);
      chunkSounding = sample(chunkState, 3, stereoClip, 2, busyGate.data() + start, busyPitch.data() + start,
                             chunked.data() + start * 2, frames, mode, 0.75, 12, 40);
      start += frames;
    }
    check(whole == chunked && wholeState == chunkState && wholeSounding == chunkSounding,
          "a chunked sampler stream equals one pass");
    check(std::any_of(whole.begin(), whole.end(), [](float s) { return s != 0; }), "the sampler stream has sound");
  }

  check(nt_sampler_state_len(0, 1) == 0 && nt_sampler_state_len(NT_SAMPLER_MAX_VOICES + 1, 1) == 0 &&
            nt_sampler_state_len(1, 0) == 0 && nt_sampler_state_len(1, NT_SAMPLER_MAX_CHANNELS + 1) == 0,
        "sampler state rejects invalid dimensions");
  check(nt_sampler_process(state.data(), 0, clip.data(), length, 1, nullptr, nullptr, out.data(), 4,
                           NT_SAMPLER_ONE_SHOT, 1, 0, 0, 1) == NT_ERR_ARGS &&
            nt_sampler_process(state.data(), 4, clip.data(), length, 1, nullptr, nullptr, out.data(), 4, 3, 1, 0,
                               0, 1) == NT_ERR_ARGS &&
            nt_sampler_process(state.data(), 4, nullptr, length, 1, nullptr, nullptr, out.data(), 4,
                               NT_SAMPLER_ONE_SHOT, 1, 0, 0, 1) == NT_ERR_ARGS,
        "the sampler rejects invalid arguments");
  std::fill(state.begin(), state.end(), 0.0);
  check(nt_sampler_process(state.data(), 4, nullptr, 0, 1, nullptr, nullptr, out.data(), 4, NT_SAMPLER_LOOP, 1,
                           0, 0, 1) == 0 &&
            std::all_of(out.begin(), out.begin() + 4, [](float s) { return s == 0; }),
        "a sampler without a clip is silent");
}

void testSamplerHostileDoubles() {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double inf = std::numeric_limits<double>::infinity();
  const float fnan = std::numeric_limits<float>::quiet_NaN();
  const float finf = std::numeric_limits<float>::infinity();
  const std::vector<float> clip = randomSignal(2 * 16, 3);
  const std::vector<float> gate{0, 1, 0, 1, fnan, 1, finf, 0};
  const std::vector<float> pitch{fnan, finf, -finf, 1e30f, -1e30f, 0, 1, -1};
  std::vector<float> out(2 * gate.size());
  for (double bad : {nan, inf, -inf, -1e300, 1e300, 0.0, -1.0, 1.0, 2.0, 7.5}) {
    for (int mode : {NT_SAMPLER_ONE_SHOT, NT_SAMPLER_GATED, NT_SAMPLER_LOOP}) {
      std::vector<double> state(nt_sampler_state_len(3, 2), bad);
      const int status = nt_sampler_process(state.data(), 3, clip.data(), 16, 2, gate.data(), pitch.data(),
                                            out.data(), gate.size(), mode, bad, bad, bad, 1);
      check(status >= 0 && status <= 4, "a sampler with hostile state and controls counts its voices");
      // A huge declick level in the state gives infinite samples, never NaN.
      check(std::none_of(out.begin(), out.end(), [](float s) { return std::isnan(s); }),
            "a sampler with hostile state and controls gives numbers");
    }
  }
}

void testStatefulEffects() {
  constexpr size_t frames = 4097;
  constexpr uint32_t channels = 2;
  constexpr double rate = 44100;
  std::vector<float> input(frames * channels), expected(input.size()), actual(input.size());
  for (size_t i = 0; i < input.size(); i++) input[i] = static_cast<float>(std::sin(i * 0.19) * 0.8);
  {
    std::vector<double> state(nt_audio_bitcrush_state_len(channels, rate, 0));
    nt_audio_bitcrush_init(state.data(), channels, rate, 0);
    check(nt_audio_bitcrush_block(state.data(), input.data(), expected.data(), frames, channels, 8, 7) == NT_OK, "bitcrush full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_bitcrush_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_bitcrush_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, 8, 7) == NT_OK, "bitcrush split block");
        offset += count;
      }
      check(expected == actual, "bitcrush chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_bitcrush(input.data(), clip.data(), frames, channels, 8, 7);
    check(expected == clip, "bitcrush clip parity");
  }
  {
    std::vector<double> state(nt_audio_compress_state_len(channels, rate, 0));
    nt_audio_compress_init(state.data(), channels, rate, 0);
    check(nt_audio_compress_block(state.data(), input.data(), expected.data(), frames, channels, rate, -18, 4, 10, 100, 1) == NT_OK, "compress full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_compress_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_compress_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, -18, 4, 10, 100, 1) == NT_OK, "compress split block");
        offset += count;
      }
      check(expected == actual, "compress chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_compress(input.data(), clip.data(), frames, channels, rate, -18, 4, 10, 100, 1);
    check(expected == clip, "compress clip parity");
  }
  {
    std::vector<double> state(nt_audio_limiter_state_len(channels, rate, 0));
    nt_audio_limiter_init(state.data(), channels, rate, 0);
    check(nt_audio_limiter_block(state.data(), input.data(), expected.data(), frames, channels, rate, -3, 50, 0) == NT_OK, "limiter full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_limiter_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_limiter_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, -3, 50, 0) == NT_OK, "limiter split block");
        offset += count;
      }
      check(expected == actual, "limiter chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_limiter(input.data(), clip.data(), frames, channels, rate, -3, 50, 0);
    check(expected == clip, "limiter clip parity");
  }
  {
    std::vector<double> state(nt_audio_noise_gate_state_len(channels, rate, 0));
    nt_audio_noise_gate_init(state.data(), channels, rate, 0);
    check(nt_audio_noise_gate_block(state.data(), input.data(), expected.data(), frames, channels, rate, -20, 1, 50) == NT_OK, "noise_gate full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_noise_gate_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_noise_gate_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, -20, 1, 50) == NT_OK, "noise_gate split block");
        offset += count;
      }
      check(expected == actual, "noise_gate chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_noise_gate(input.data(), clip.data(), frames, channels, rate, -20, 1, 50);
    check(expected == clip, "noise_gate clip parity");
  }
  {
    std::vector<double> state(nt_audio_phaser_state_len(channels, rate, 0));
    nt_audio_phaser_init(state.data(), channels, rate, 0);
    check(nt_audio_phaser_block(state.data(), input.data(), expected.data(), frames, channels, rate, 0.5, 0.7, 1000, 0.3, 0.5) == NT_OK, "phaser full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_phaser_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_phaser_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, 0.5, 0.7, 1000, 0.3, 0.5) == NT_OK, "phaser split block");
        offset += count;
      }
      check(expected == actual, "phaser chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_phaser(input.data(), clip.data(), frames, channels, rate, 0.5, 0.7, 1000, 0.3, 0.5);
    check(expected == clip, "phaser clip parity");
  }
  {
    std::vector<double> state(nt_audio_reverb_state_len(channels, rate, 0));
    nt_audio_reverb_init(state.data(), channels, rate, 0);
    check(nt_audio_reverb_block(state.data(), input.data(), expected.data(), frames, channels, rate, 0.5, 0.5, 0.3, 0.7) == NT_OK, "reverb full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_reverb_init(state.data(), channels, rate, 0);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_reverb_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, 0.5, 0.5, 0.3, 0.7) == NT_OK, "reverb split block");
        offset += count;
      }
      check(expected == actual, "reverb chunk invariance");
    }
    std::vector<float> clip(input.size());
    nt_audio_reverb(input.data(), clip.data(), frames, channels, rate, 0.5, 0.5, 0.3, 0.7);
    check(expected == clip, "reverb clip parity");
  }
  {
    std::vector<double> state(nt_audio_delay_state_len(channels, rate, 0.013));
    nt_audio_delay_init(state.data(), channels, rate, 0.013);
    check(nt_audio_delay_block(state.data(), input.data(), expected.data(), frames, channels, rate, 0.013, 0.5, 0.5) == NT_OK, "delay full block");
    for (size_t split : {1, 127, 128, 1024, 193, 0}) {
      nt_audio_delay_init(state.data(), channels, rate, 0.013);
      uint32_t seed = 17;
      for (size_t offset = 0; offset < frames;) {
        seed = seed * 1664525u + 1013904223u;
        const size_t count = std::min(split ? split : size_t{1 + seed % 2048}, frames - offset);
        check(nt_audio_delay_block(state.data(), input.data() + offset * channels,
          actual.data() + offset * channels, count, channels, rate, 0.013, 0.5, 0.5) == NT_OK, "delay split block");
        offset += count;
      }
      check(expected == actual, "delay chunk invariance");
    }
    const size_t outputFrames = nt_audio_delay_output_frames(frames, rate, 0.013);
    std::vector<float> clip(outputFrames * channels), streamed(outputFrames * channels);
    nt_audio_delay(input.data(), clip.data(), frames, channels, rate, 0.013, 0.5, 0.5);
    nt_audio_delay_init(state.data(), channels, rate, 0.013);
    nt_audio_delay_block(state.data(), input.data(), streamed.data(), frames, channels, rate, 0.013, 0.5, 0.5);
    std::vector<float> silence((outputFrames - frames) * channels);
    nt_audio_delay_block(state.data(), silence.data(), streamed.data() + frames * channels, outputFrames - frames, channels, rate, 0.013, 0.5, 0.5);
    check(streamed == clip, "delay block plus tail matches clip");
    check(nt_audio_delay_state_len(channels, rate, 2.01) == 0, "delay state rejects 2.01 seconds");
    check(nt_audio_delay_init(state.data(), channels, rate, 2.01) == NT_ERR_ARGS, "delay init rejects 2.01 seconds");
    check(nt_audio_delay_block(state.data(), input.data(), actual.data(), frames, channels, rate, 2.01, 0.5, 0.5) == NT_ERR_ARGS, "delay block rejects 2.01 seconds");
  }
}

}  // namespace

int main() {
  testRankFilter();
  testHistogramKernels();
  testBiquad();
  testSynth();
  testEffects();
  testStatefulEffects();
  testStreamingHostileDoubles();
  testResample();
  testSampler();
  testSamplerHostileDoubles();
  testHostileDoubles();
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return EXIT_FAILURE;
  }
  std::printf("kernels_tests: all passed\n");
  return EXIT_SUCCESS;
}
