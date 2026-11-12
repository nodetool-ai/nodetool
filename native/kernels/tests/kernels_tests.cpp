// Native tests of the kernel library. Parity with the TypeScript loops that
// the kernels replaced is tested in packages/kernels, against the
// WebAssembly build of the same sources.
#include "nodetool/kernels.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
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

}  // namespace

void testPcm() {
  // Every 16-bit value decodes to v / 32767 and encodes back to itself,
  // except -32768, which clips to -32767.
  std::vector<uint8_t> bytes(65536 * 2);
  for (int v = -32768; v <= 32767; v++) {
    const size_t i = static_cast<size_t>(v + 32768);
    bytes[2 * i] = static_cast<uint8_t>(v & 0xff);
    bytes[2 * i + 1] = static_cast<uint8_t>((v >> 8) & 0xff);
  }
  std::vector<float> samples(65536);
  check(nt_pcm_decode(bytes.data(), samples.data(), samples.size(), NT_PCM_S16) == NT_OK, "pcm16 decodes");
  check(samples[0] == static_cast<float>(-32768 / 32767.0) && samples[65535] == 1.0f, "pcm16 full scale");
  std::vector<uint8_t> back(bytes.size());
  nt_pcm16_encode(samples.data(), back.data(), samples.size());
  check(back[0] == 0x01 && back[1] == 0x80, "pcm16 encode clips -32768 to -32767");
  check(std::equal(back.begin() + 2, back.end(), bytes.begin() + 2), "pcm16 round-trips");

  // Clipping, NaN, -0 and halves toward +infinity.
  const float edge[] = {2.0f, -2.0f, std::numeric_limits<float>::quiet_NaN(),
                        std::numeric_limits<float>::infinity(), -0.0f, 0.5f, -0.5f};
  uint8_t out[14];
  nt_pcm16_encode(edge, out, 7);
  // 0.5 * 32767 = 16383.5 rounds up, and -16383.5 rounds up to -16383.
  const int16_t expected[] = {32767, -32767, 0, 32767, 0, 16384, -16383};
  bool edges = true;
  for (int i = 0; i < 7; i++) edges &= static_cast<int16_t>(out[2 * i] | (out[2 * i + 1] << 8)) == expected[i];
  check(edges, "pcm16 encode edge values");

  const uint8_t s24[] = {0xff, 0xff, 0x7f, 0x00, 0x00, 0x80};
  float s24out[2];
  check(nt_pcm_decode(s24, s24out, 2, NT_PCM_S24) == NT_OK && s24out[0] == 1.0f &&
            s24out[1] == static_cast<float>(-8388608 / 8388607.0),
        "pcm24 decodes with sign extension");
  const uint8_t u8[] = {0, 128, 255};
  float u8out[3];
  check(nt_pcm_decode(u8, u8out, 3, NT_PCM_U8) == NT_OK && u8out[0] == -1.0f && u8out[1] == 0.0f &&
            u8out[2] == 127 / 128.0f,
        "pcm8 decodes");
  const float f = 0.25f;
  uint8_t f32[4];
  std::memcpy(f32, &f, 4);
  float f32out = 0;
  check(nt_pcm_decode(f32, &f32out, 1, NT_PCM_F32) == NT_OK && f32out == f, "float32 copies");
  const uint8_t snan[] = {0x01, 0x00, 0x80, 0x7f};
  uint32_t quiet = 0;
  check(nt_pcm_decode(snan, &f32out, 1, NT_PCM_F32) == NT_OK && (std::memcpy(&quiet, &f32out, 4), quiet == 0x7fc00001u),
        "float32 quiets a signaling NaN as DataView does");
  check(nt_pcm_decode(u8, u8out, 1, 99) == NT_ERR_ARGS && nt_pcm_sample_bytes(99) == 0,
        "unknown pcm format is refused");
}

int main() {
  testRankFilter();
  testHistogramKernels();
  testBiquad();
  testSynth();
  testEffects();
  testHostileDoubles();
  testPcm();
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return EXIT_FAILURE;
  }
  std::printf("kernels_tests: all passed\n");
  return EXIT_SUCCESS;
}
