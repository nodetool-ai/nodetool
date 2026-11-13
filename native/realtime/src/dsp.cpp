#include "nodetool/realtime/dsp.h"
#include "nodetool/realtime/math.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <limits>
#include <memory>

namespace {
enum class Kind { oscillator, noise, gain, mix, lowpass, highpass, bandpass, notch, allpass, peaking, lowshelf, highshelf, delay, player, meter };
// Exclusively owned by the audio executor thread, flat and pointer-free.
struct alignas(NT_DSP_STATE_ALIGNMENT) State {
    nt_dsp_config config{};
    double phase = 0;
    std::uint64_t index = 0;
    std::uint32_t cursor = 0;
    bool playing = true;
    std::array<double, 2> z1{};
    std::array<double, 2> z2{};
};
static_assert(alignof(State) == NT_DSP_STATE_ALIGNMENT);
constexpr double pi = 3.14159265358979323846;
double param(const nt_dsp_args& args, unsigned slot, unsigned frame) noexcept {
    if (args.param_samples) { return args.param_samples[slot][frame]; }
    const double begin = args.param_begin[slot];
    return args.frames <= 1 ? args.param_end[slot] : begin +
        (static_cast<double>(args.param_end[slot]) - begin) * frame / (args.frames - 1);
}
float sample(double value) noexcept {
    if (std::isnan(value)) { return std::numeric_limits<float>::quiet_NaN(); }
    if (value > std::numeric_limits<float>::max()) { return std::numeric_limits<float>::infinity(); }
    if (value < -std::numeric_limits<float>::max()) { return -std::numeric_limits<float>::infinity(); }
    return static_cast<float>(value);
}
double clearSmall(double value) noexcept { return !std::isfinite(value) || std::abs(value) < 1e-30 ? 0 : value; }
float* delayData(void* storage) noexcept { return reinterpret_cast<float*>(static_cast<std::byte*>(storage) + sizeof(State)); }
template<Kind kind> uint32_t stateSize(const nt_dsp_config* config) {
    return static_cast<uint32_t>(sizeof(State) + (kind == Kind::delay ? config->delay_frames * config->channels * sizeof(float) : 0u));
}
template<Kind kind> void init(void* storage, const nt_dsp_config* config) {
    auto& state = *std::construct_at(static_cast<State*>(storage));
    state.config = *config;
    if constexpr (kind == Kind::delay) {
        for (uint32_t i = 0; i < config->delay_frames * config->channels; ++i) { std::construct_at(delayData(storage) + i, 0.0f); }
    }
}
// Biquad coefficients use the project sine/power source (RT-N6). Square root
// is IEEE arithmetic. Parameters are limited before evaluating coefficients.
template<Kind kind> std::array<double, 5> coefficients(const nt_dsp_args& args, unsigned frame, unsigned rate) noexcept {
    const double frequency = std::clamp(param(args, 0, frame), 1.0, rate * 0.49);
    const double q = std::clamp(param(args, 1, frame), 0.01, 100.0);
    const double angle = 2 * pi * frequency / rate;
    const double cosine = nt::realtime::math::sine(angle + pi / 2);
    const double alpha = nt::realtime::math::sine(angle) / (2 * q);
    const double a = nt::realtime::math::power(10, std::clamp(param(args, 2, frame), -60.0, 60.0) / 40);
    double b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = -2 * cosine, a2 = 1 - alpha;
    if constexpr (kind == Kind::lowpass) { b0 = (1 - cosine) / 2; b1 = 1 - cosine; b2 = b0; a0 = 1 + alpha; }
    if constexpr (kind == Kind::highpass) { b0 = (1 + cosine) / 2; b1 = -(1 + cosine); b2 = b0; a0 = 1 + alpha; }
    if constexpr (kind == Kind::bandpass) { b0 = alpha; b2 = -alpha; a0 = 1 + alpha; }
    if constexpr (kind == Kind::notch) { b0 = 1; b1 = -2 * cosine; b2 = 1; a0 = 1 + alpha; }
    if constexpr (kind == Kind::allpass) { b0 = 1 - alpha; b1 = -2 * cosine; b2 = 1 + alpha; a0 = 1 + alpha; }
    if constexpr (kind == Kind::peaking) {
        b0 = 1 + alpha * a; b1 = -2 * cosine; b2 = 1 - alpha * a;
        a0 = 1 + alpha / a; a2 = 1 - alpha / a;
    }
    if constexpr (kind == Kind::lowshelf || kind == Kind::highshelf) {
        const double root = 2 * std::sqrt(a) * alpha;
        if constexpr (kind == Kind::lowshelf) {
            b0 = a * ((a + 1) - (a - 1) * cosine + root);
            b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
            b2 = a * ((a + 1) - (a - 1) * cosine - root);
            a0 = (a + 1) + (a - 1) * cosine + root;
            a1 = -2 * ((a - 1) + (a + 1) * cosine);
            a2 = (a + 1) + (a - 1) * cosine - root;
        } else {
            b0 = a * ((a + 1) + (a - 1) * cosine + root);
            b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
            b2 = a * ((a + 1) + (a - 1) * cosine - root);
            a0 = (a + 1) - (a - 1) * cosine + root;
            a1 = 2 * ((a - 1) - (a + 1) * cosine);
            a2 = (a + 1) - (a - 1) * cosine - root;
        }
    }
    return {b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0};
}
template<Kind kind> void process(void* storage, const nt_dsp_args* arguments) {
    auto& state = *static_cast<State*>(storage);
    const auto& args = *arguments;
    const auto channels = state.config.channels;
    uint32_t event = 0;
    std::array<double, 2> squares{};
    std::array<double, 5> fixed{};
    bool ramped = false;
    if constexpr (kind >= Kind::lowpass && kind <= Kind::highshelf) {
        fixed = coefficients<kind>(args, 0, state.config.sample_rate);
        for (unsigned p = 0; p < 3; ++p) {
            if (args.param_samples) {
                for (unsigned frame = 1; frame < args.frames && !ramped; ++frame) {
                    ramped = args.param_samples[p][frame] != args.param_samples[p][0];
                }
            } else { ramped = ramped || args.param_begin[p] != args.param_end[p]; }
        }
    }
    if (args.meter) { *args.meter = {}; }
    for (uint32_t frame = 0; frame < args.frames; ++frame) {
        while (event < args.event_count && args.events[event].offset == frame) {
            const auto& message = args.events[event++];
            if (message.type == NT_DSP_RESET) { state.phase = 0; state.index = 0; state.playing = true; }
            if (message.type == NT_DSP_START) { state.playing = true; }
            if (message.type == NT_DSP_STOP) { state.playing = false; }
            if (message.type == NT_DSP_SEEK) { state.index = static_cast<uint64_t>(message.value); }
        }
        double source = 0;
        if constexpr (kind == Kind::oscillator) {
            source = nt::realtime::math::sine(2 * pi * state.phase) * param(args, 1, frame);
            const double step = std::clamp(param(args, 0, frame), -static_cast<double>(state.config.sample_rate) * 0.5, state.config.sample_rate * 0.5) / state.config.sample_rate;
            state.phase += step;
            if (state.phase >= 1) { state.phase -= 1; }
            if (state.phase < 0) { state.phase += 1; }
        }
        if constexpr (kind == Kind::noise) { source = nt::realtime::math::noise(state.index++, state.config.seed) * param(args, 0, frame); }
        std::array<double, 5> c{};
        if constexpr (kind >= Kind::lowpass && kind <= Kind::highshelf) { c = ramped ? coefficients<kind>(args, frame, state.config.sample_rate) : fixed; }
        for (uint32_t channel = 0; channel < channels; ++channel) {
            double value = 0;
            if constexpr (kind == Kind::oscillator || kind == Kind::noise) { value = source; }
            if constexpr (kind == Kind::gain) { value = args.in[channel][frame] * param(args, 0, frame); }
            if constexpr (kind == Kind::mix) { value = args.in[channel][frame] * param(args, 0, frame) + args.in[channels + channel][frame] * param(args, 1, frame); }
            if constexpr (kind >= Kind::lowpass && kind <= Kind::highshelf) {
                const double input = args.in[channel][frame];
                value = input * c[0] + state.z1[channel];
                state.z1[channel] = clearSmall(input * c[1] - value * c[3] + state.z2[channel]);
                state.z2[channel] = clearSmall(input * c[2] - value * c[4]);
            }
            if constexpr (kind == Kind::delay) {
                auto& stored = delayData(storage)[channel * state.config.delay_frames + state.cursor];
                const double input = args.in[channel][frame];
                const double wet = std::clamp(param(args, 1, frame), 0.0, 1.0);
                value = input * (1 - wet) + stored * wet;
                const double next = clearSmall(input + stored * std::clamp(param(args, 0, frame), -0.999, 0.999));
                stored = std::abs(next) > std::numeric_limits<float>::max() ? 0.0f : static_cast<float>(next);
            }
            if constexpr (kind == Kind::player) {
                if (state.playing && state.index < args.sample_frames) { value = args.sample[channel][state.index] * param(args, 0, frame); }
            }
            if constexpr (kind == Kind::meter) {
                value = args.in[channel][frame];
                if (std::isfinite(value)) {
                    args.meter->peak[channel] = std::max(args.meter->peak[channel], static_cast<float>(std::abs(value)));
                    squares[channel] += value * value;
                }
            }
            args.out[channel][frame] = sample(value);
        }
        if constexpr (kind == Kind::delay) { if (++state.cursor == state.config.delay_frames) { state.cursor = 0; } }
        if constexpr (kind == Kind::player) { if (state.playing && state.index < args.sample_frames) { ++state.index; } }
    }
    if constexpr (kind == Kind::meter) {
        for (uint32_t channel = 0; channel < channels; ++channel) { args.meter->rms[channel] = args.frames ? sample(std::sqrt(squares[channel] / args.frames)) : 0; }
    }
}
template<Kind kind> constexpr nt_dsp_kernel kernel(unsigned inputs, unsigned params, unsigned events = 0) {
    return {NT_DSP_ABI, 1, inputs, 1, params, events, stateSize<kind>, init<kind>, process<kind>};
}
struct Entry { const char* name; nt_dsp_kernel descriptor; };
constexpr unsigned reset = 1u << NT_DSP_RESET;
constexpr Entry builtins[] = {
    {"oscillator", kernel<Kind::oscillator>(0, 2, reset)}, {"noise", kernel<Kind::noise>(0, 1, reset)},
    {"gain", kernel<Kind::gain>(1, 1)}, {"mix", kernel<Kind::mix>(2, 2)},
    {"biquad.lowpass", kernel<Kind::lowpass>(1, 3)}, {"biquad.highpass", kernel<Kind::highpass>(1, 3)},
    {"biquad.bandpass", kernel<Kind::bandpass>(1, 3)}, {"biquad.notch", kernel<Kind::notch>(1, 3)},
    {"biquad.allpass", kernel<Kind::allpass>(1, 3)}, {"biquad.peaking", kernel<Kind::peaking>(1, 3)},
    {"biquad.lowshelf", kernel<Kind::lowshelf>(1, 3)}, {"biquad.highshelf", kernel<Kind::highshelf>(1, 3)},
    {"delay", kernel<Kind::delay>(1, 2)}, {"sample-player", kernel<Kind::player>(0, 1, reset | (1u << NT_DSP_START) | (1u << NT_DSP_STOP) | (1u << NT_DSP_SEEK))},
    {"level-meter", kernel<Kind::meter>(1, 0)}
};
}
extern "C" const nt_dsp_kernel* nt_dsp_builtin(const char* name) {
    if (!name) { return nullptr; }
    for (const auto& entry : builtins) { if (std::strcmp(entry.name, name) == 0) { return &entry.descriptor; } }
    return nullptr;
}
extern "C" const char* nt_dsp_builtin_name(uint32_t index) {
    return index < std::size(builtins) ? builtins[index].name : nullptr;
}
