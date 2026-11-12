// Time of each kernel as native code, on the cases of
// packages/kernels/bench/kernels.bench.ts. Prints a Markdown table.
//
//   cmake --build native/kernels/build --target kernels_bench
//   native/kernels/build/kernels_bench
#include "nodetool/kernels.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <vector>

namespace {

constexpr uint32_t kWidth = 1000;
constexpr uint32_t kHeight = 1000;
constexpr double kRate = 44100;
constexpr size_t kFrames = 441000;
constexpr uint32_t kChannels = 2;

// The median time of `runs` calls, in milliseconds.
double timeMs(const std::function<void()>& fn, int runs = 5) {
  fn();
  std::vector<double> samples;
  for (int r = 0; r < runs; r++) {
    const auto start = std::chrono::steady_clock::now();
    fn();
    samples.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
  }
  std::sort(samples.begin(), samples.end());
  return samples[samples.size() / 2];
}

}  // namespace

int main() {
  std::vector<uint8_t> rgba(size_t{kWidth} * kHeight * 4);
  uint32_t seed = 1;
  for (size_t i = 0; i < rgba.size(); i++) {
    seed = seed * 1103515245u + 12345u;
    rgba[i] = static_cast<uint8_t>(((i >> 2) % 251) ^ (seed >> 24));
  }
  std::vector<uint8_t> dst(rgba.size());
  std::vector<float> pcm(kFrames * kChannels);
  for (size_t i = 0; i < pcm.size(); i++) pcm[i] = static_cast<float>(std::sin(static_cast<double>(i) * 0.013) * 0.8);
  std::vector<float> out(pcm.size());
  double coeffs[NT_BIQUAD_COEFFS_LEN];
  nt_biquad_design_rbj(NT_BIQUAD_LOWPASS, kRate, 1000, std::sqrt(0.5), 0, coeffs);

  struct Row {
    const char* name;
    const char* input;
    double ms;
  };
  const std::vector<float> block(1024 * kChannels, 0.2f);
  std::vector<float> blockOut(block.size());
  std::vector<double> reverbState(nt_audio_reverb_state_len(kChannels, kRate, 0));
  nt_audio_reverb_init(reverbState.data(), kChannels, kRate, 0);
  std::vector<double> delayState(nt_audio_delay_state_len(kChannels, kRate, 2));
  nt_audio_delay_init(delayState.data(), kChannels, kRate, 2);
  std::vector<float> resampled(nt_resample_output_frames(kFrames, 48000, 44100) * kChannels);
  const std::vector<Row> rows = {
      {"Resample 48 kHz to 44.1 kHz", "10 s stereo", timeMs([&] {
        nt_resample(pcm.data(), resampled.data(), kFrames, kChannels, 48000, 44100);
      }, 3)},
      {"Reverb block with state copies", "1024 stereo frames", timeMs([&] {
        auto state = reverbState;
        nt_audio_reverb_block(state.data(), block.data(), blockOut.data(), 1024, kChannels, kRate, 0.5, 0.5, 0.33, 0.4);
        reverbState = state;
      }, 101)},
      {"2 s delay block with state copies", "1024 stereo frames", timeMs([&] {
        auto state = delayState;
        nt_audio_delay_block(state.data(), block.data(), blockOut.data(), 1024, kChannels, kRate, 2, 0.5, 0.5);
        delayState = state;
      }, 101)},
      {"AutoContrast", "1 MP", timeMs([&] { nt_image_auto_contrast(rgba.data(), dst.data(), kWidth, kHeight, 2); })},
      {"Equalize", "1 MP", timeMs([&] { nt_image_equalize(rgba.data(), dst.data(), kWidth, kHeight); })},
      {"AdaptiveContrast", "1 MP", timeMs([&] { nt_image_adaptive_contrast(rgba.data(), dst.data(), kWidth, kHeight, 2, 8); })},
      {"RankFilter 3", "1 MP", timeMs([&] { nt_image_rank_filter(rgba.data(), dst.data(), kWidth, kHeight, 3, 4); }, 3)},
      {"RankFilter 15", "1 MP", timeMs([&] { nt_image_rank_filter(rgba.data(), dst.data(), kWidth, kHeight, 15, 112); }, 1)},
      {"Reverb", "10 s stereo", timeMs([&] { nt_audio_reverb(pcm.data(), out.data(), kFrames, kChannels, kRate, 0.5, 0.5, 0.33, 0.4); })},
      {"Compress", "10 s stereo", timeMs([&] { nt_audio_compress(pcm.data(), out.data(), kFrames, kChannels, kRate, -20, 4, 5, 50, 1); })},
      {"Phaser", "10 s stereo", timeMs([&] { nt_audio_phaser(pcm.data(), out.data(), kFrames, kChannels, kRate, 1, 0.5, 1300, -0.5, 0.5); })},
      {"Biquad", "10 s stereo", timeMs([&] {
         double state[NT_BIQUAD_STATE_LEN * kChannels] = {};
         nt_biquad_process(coeffs, state, pcm.data(), out.data(), kFrames, kChannels);
       })},
  };
  std::printf("| Kernel | Input | Native (ms) |\n|---|---|---:|\n");
  for (const auto& row : rows) std::printf("| %s | %s | %.3f |\n", row.name, row.input, row.ms);
  return 0;
}
