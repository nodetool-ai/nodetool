#include "miniaudio.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <locale>
#include <numbers>
#include <stdexcept>
#include <vector>

namespace {
constexpr std::size_t quantum = 128;
constexpr std::size_t quanta = 4096;
constexpr double frequency = 440;
using Clock = std::chrono::steady_clock;

// Main thread only. Owns miniaudio's converter allocation for one measurement.
class Converter {
public:
    Converter(unsigned inputRate, unsigned outputRate) {
        auto config = ma_data_converter_config_init(
            ma_format_f32, ma_format_f32, 2, 2, inputRate, outputRate);
        config.resampling.algorithm = ma_resample_algorithm_linear;
        if (ma_data_converter_init(&config, nullptr, &value) != MA_SUCCESS) {
            throw std::runtime_error("Cannot initialize sample-rate converter");
        }
    }
    ~Converter() { ma_data_converter_uninit(&value, nullptr); }
    Converter(const Converter&) = delete;
    Converter& operator=(const Converter&) = delete;
    ma_data_converter value{};
};

// RT-Q3: CPU-only preparation. Device scheduling and hardware remain unqualified.
void measure(unsigned inputRate, unsigned outputRate) {
    Converter converter(inputRate, outputRate);
    std::array<float, quantum * 2> input{};
    std::array<float, quantum * 4> output{};
    std::vector<double> timings(quanta);
    std::uint64_t outputFrames = 0, crossings = 0;
    double energy = 0, previous = 0, sum = 0;
    for (std::size_t block = 0; block < quanta; ++block) {
        for (std::size_t frame = 0; frame < quantum; ++frame) {
            const auto phase = 2 * std::numbers::pi * frequency *
                static_cast<double>(block * quantum + frame) / inputRate;
            input[frame * 2] = static_cast<float>(0.25 * std::sin(phase));
            input[frame * 2 + 1] = -input[frame * 2];
        }
        ma_uint64 consumed = quantum, produced = output.size() / 2;
        const auto start = Clock::now();
        const auto result = ma_data_converter_process_pcm_frames(
            &converter.value, input.data(), &consumed, output.data(), &produced);
        const auto elapsed = std::chrono::duration<double, std::micro>(Clock::now() - start).count();
        if (result != MA_SUCCESS || consumed != quantum || produced == 0 || produced > output.size() / 2) {
            throw std::runtime_error("Conversion failed to consume a complete quantum");
        }
        timings[block] = elapsed;
        sum += elapsed;
        for (ma_uint64 frame = 0; frame < produced; ++frame) {
            const double left = output[frame * 2], right = output[frame * 2 + 1];
            if (!std::isfinite(left) || !std::isfinite(right) || std::abs(left + right) > 1e-6 ||
                std::abs(left) > 0.26) {
                throw std::runtime_error("Invalid converted stereo signal");
            }
            if (previous <= 0 && left > 0) { ++crossings; }
            previous = left;
            energy += left * left;
        }
        outputFrames += produced;
    }
    const auto latency = ma_data_converter_get_output_latency(&converter.value);
    const double expectedFrames = static_cast<double>(quanta * quantum) * outputRate / inputRate;
    const double expectedCycles = static_cast<double>(quanta * quantum) * frequency / inputRate;
    if (std::abs(static_cast<double>(outputFrames) - expectedFrames) > static_cast<double>(latency) + 2 ||
        std::abs(static_cast<double>(crossings) - expectedCycles) > 2 || energy / outputFrames < 0.02) {
        throw std::runtime_error("Converted duration, frequency or signal energy is incorrect");
    }
    std::sort(timings.begin(), timings.end());
    std::cout << "{\"input_rate\":" << inputRate << ",\"output_rate\":" << outputRate
        << ",\"quanta\":" << quanta << ",\"input_frames\":" << quanta * quantum
        << ",\"output_frames\":" << outputFrames << ",\"output_latency_frames\":" << latency
        << ",\"positive_crossings\":" << crossings << ",\"mean_us\":" << sum / quanta
        << ",\"p999_us\":" << timings[static_cast<std::size_t>(std::ceil(quanta * 0.999)) - 1]
        << ",\"max_us\":" << timings.back() << '}';
}
}

int main() {
    try {
        std::cout.imbue(std::locale::classic());
        std::cout << "{\"schema\":1,\"hardware_qualified\":false,\"mode\":\"offline_conversion\","
            "\"algorithm\":\"miniaudio_linear\",\"quantum_frames\":128,\"runs\":[";
        measure(44100, 44100);
        std::cout << ',';
        measure(44100, 48000);
        std::cout << ',';
        measure(48000, 48000);
        std::cout << "]}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
