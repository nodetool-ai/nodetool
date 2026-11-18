#include "audio/effects/Oversampler.h"
#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>
#include <stdexcept>
extern "C" {
#include <libavutil/tx.h>
}
namespace nt::audio::effects {
namespace {
struct Deleter { void operator()(AVTXContext* p) const { av_tx_uninit(&p); } };
std::array<float, 512> kernel(bool up) {
    const int length = up ? 128 : 256, transformLength = 2 * length;
    const float n = 128;
    const float cutoff = (1.f / (13.745202940783823f / n + 121.73532586374934f / (n*n) + 5964.163279612051f / (n*n*n) + 1)) * (up ? 1.f : .5f);
    std::array<float, 512> time{}, result{};
    float sum = 0;
    for (int i = 0; i < length; ++i) {
        const float phase = 2 * std::numbers::pi_v<float> * i / length;
        const float window = .35875f - .48829f * std::cos(phase) + .14128f * std::cos(2 * phase) - .01168f * std::cos(3 * phase);
        const float x = (i - length / 2) * cutoff;
        const float sinc = x == 0 ? 1 : std::sin(std::numbers::pi_v<float> * x) / (std::numbers::pi_v<float> * x);
        time[i] = window * window * sinc; sum += time[i];
    }
    for (auto& x : time) { x /= sum * transformLength; }
    std::array<AVComplexFloat, 257> spectrum{};
    AVTXContext* context = nullptr; av_tx_fn fn = nullptr;
    const float scale = 1;
    if (av_tx_init(&context, &fn, AV_TX_FLOAT_RDFT, 0, transformLength, &scale, AV_TX_UNALIGNED) < 0) { throw std::runtime_error("Cannot prepare oversampler"); }
    std::unique_ptr<AVTXContext, Deleter> forward(context);
    fn(forward.get(), spectrum.data(), time.data(), sizeof(float));
    if (!up) { std::fill(spectrum.begin() + 128, spectrum.end(), AVComplexFloat{}); }
    context = nullptr;
    if (av_tx_init(&context, &fn, AV_TX_FLOAT_RDFT, 1, 512, &scale, AV_TX_UNALIGNED) < 0) { throw std::runtime_error("Cannot prepare oversampler inverse"); }
    std::unique_ptr<AVTXContext, Deleter> inverse(context);
    fn(inverse.get(), result.data(), spectrum.data(), sizeof(AVComplexFloat));
    return result;
}
float shape(float x, std::span<const float, 4096> curve) {
    const float position = (std::clamp(x, -1.f, 1.f) + 1) * .5f * 4095;
    const auto a = static_cast<std::size_t>(position);
    return curve[a] + (position - a) * (curve[std::min<std::size_t>(a + 1, 4095)] - curve[a]);
}
}
void Oversampler::prepare() { up_ = kernel(true); down_ = kernel(false); reset(); }
void Oversampler::reset() noexcept {
    for (auto& c : input_) { c.fill(0); }
    for (auto& c : shaped_) { c.fill(0); }
    cursor_ = 0;
}
void Oversampler::tick(std::span<float, 2> stereo, std::span<const float, 4096> curve, float gain) noexcept {
    for (int c = 0; c < 2; ++c) {
        input_[c][cursor_] = stereo[c];
        // Two oversampled phases, followed by decimation at the even phase.
        float output = 0;
        for (std::size_t phase = 0; phase < 2; ++phase) {
            float interpolated = 0;
            for (std::size_t j = 0; j < 256; ++j) { interpolated += input_[c][(cursor_ - j) & 255] * up_[2*j + phase]; }
            const auto at = (cursor_ * 2 + phase) & 511;
            shaped_[c][at] = shape(interpolated, curve);
            if (phase == 0) {
                for (std::size_t j = 0; j < 512; ++j) { output += shaped_[c][(at - j) & 511] * down_[j]; }
            }
        }
        stereo[c] = output * gain;
    }
    cursor_ = (cursor_ + 1) & 255;
}
}
