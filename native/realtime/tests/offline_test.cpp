#include "nodetool/realtime/offline.h"
#include <bit>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>
#include <limits>
#include <stdexcept>

namespace {
using namespace nt::realtime;
void require(bool condition, const char* message) { if (!condition) { throw std::runtime_error(message); } }
// Test thread only. Owns an exclusively created temporary directory and its files.
struct Directory {
    std::filesystem::path path;
    Directory() {
        const auto prefix = std::filesystem::temp_directory_path() /
            ("nt-offline-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
        for (unsigned attempt = 0; attempt < 100; ++attempt) {
            path = prefix.string() + "-" + std::to_string(attempt);
            if (std::filesystem::create_directory(path)) { return; }
        }
        throw std::runtime_error("Cannot create test directory");
    }
    ~Directory() { std::error_code ignored; std::filesystem::remove_all(path, ignored); }
};
std::string read(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    require(static_cast<bool>(stream), "Missing output file");
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}
std::uint32_t word(const std::string& bytes, std::size_t offset, unsigned size = 4) {
    std::uint32_t value = 0;
    for (unsigned i = 0; i < size; ++i) { value |= static_cast<std::uint32_t>(static_cast<unsigned char>(bytes.at(offset + i))) << (8 * i); }
    return value;
}
Plan base() {
    return {{"schemaVersion", 1}, {"revision", 1},
        {"session", {{"sampleRate", 44100}, {"quantum", 128}, {"channels", "stereo"}, {"width", 16}, {"height", 16}, {"seed", 1}}},
        {"params", Plan::array()}, {"slots", Plan::array()},
        {"control", {{"registers", 0}, {"ops", Plan::array()}, {"stateful", Plan::array()}}},
        {"render", {{"passes", Plan::array()}}},
        {"audio", {{"buffers", Plan::array()}, {"nodes", Plan::array()}, {"sinks", Plan::array()}}}};
}
}
int main() {
    try {
        Directory temporary;
        auto plan = base();
        OfflineOptions options{"0.01", "30000/1001", temporary.path / "silent"};
        auto result = runOffline(plan.dump(), options);
        require(!result.error && result.samples == 441 && result.frames == 1, "Control-only export");
        const auto silent = read(options.output / "audio.wav");
        require(silent.size() == 58 + 441 * 8 && word(silent, 4) == silent.size() - 8, "WAV length and RIFF size");
        require(silent.substr(0, 4) == "RIFF" && silent.substr(8, 8) == "WAVEfmt " &&
            word(silent, 16) == 18 && word(silent, 20, 2) == 3 && word(silent, 22, 2) == 2 &&
            word(silent, 24) == 44100 && word(silent, 28) == 352800 && word(silent, 32, 2) == 8 &&
            word(silent, 34, 2) == 32 && word(silent, 36, 2) == 0, "Float WAV format");
        require(silent.substr(38, 4) == "fact" && word(silent, 42) == 4 && word(silent, 46) == 441 &&
            silent.substr(50, 4) == "data" && word(silent, 54) == 441 * 8, "WAV fact and data chunks");
        require(silent.find_first_not_of('\0', 58) == std::string::npos, "Silent PCM");
        const auto manifest = Plan::parse(read(options.output / "manifest.json"));
        require(manifest["samples"] == 441 && manifest["quanta"] == 4 && manifest["imageFrames"] == 0, "Manifest counts");
        require(runOffline(plan.dump(), options).error.has_value(), "Existing directory rejected");
        require(read(options.output / "audio.wav") == silent, "Existing output preserved");
        options.output = temporary.path / "invalid"; options.duration = "nan";
        require(runOffline(plan.dump(), options).error.has_value() && !std::filesystem::exists(options.output), "Invalid clock leaves no files");
        options.duration = "0.01";
        plan["control"]["registers"] = 2;
        for (const auto domain : {"audio", "render"}) {
            plan["control"]["ops"].push_back({{"node", std::string(domain) + "-constant"}, {"op", "constant"},
                {"domain", domain}, {"out", 0}, {"in", Plan::array()}, {"values", {1}}});
            plan["control"]["stateful"].push_back({{"node", std::string(domain) + "-integrate"}, {"op", "integrator"},
                {"domain", domain}, {"out", 1}, {"in", {0}}, {"values", Plan::array()}, {"stateVersion", 1}});
        }
        options.output = temporary.path / "slow-control"; options.duration = "1"; options.fps = "1";
        require(!runOffline(plan.dump(), options).error, "Low frame rate advances each control quantum without skipping");
        options.duration = "0.01"; options.fps = "30000/1001";
        plan["params"].push_back({{"slot", 7}, {"node", "tone"}, {"field", "frequency"}, {"smooth", "none"}, {"sync", "audio"}, {"value", 11025}});
        plan["params"].push_back({{"slot", 4000000000u}, {"node", "tone"}, {"field", "amplitude"}, {"smooth", "none"}, {"sync", "audio"}, {"value", 0.25}});
        plan["audio"]["buffers"] = {{{"id", 0}, {"channels", "stereo"}}};
        plan["audio"]["nodes"] = {{{"node", "tone"}, {"kernel", "oscillator"}, {"stateVersion", 1},
            {"in", Plan::array()}, {"out", {0}}, {"params", {7, 4000000000u}}}};
        plan["audio"]["sinks"] = {{{"node", "out"}, {"buffer", 0}, {"kind", "device"}, {"subgraphHash", "1234abcd"}},
            {{"node", "second"}, {"buffer", 0}, {"kind", "device"}, {"subgraphHash", "1234abcd"}}};
        options.output = temporary.path / "signal";
        result = runOffline(plan.dump(), options);
        require(!result.error, "Oscillator signal export");
        const auto signal = read(options.output / "audio.wav");
        require(signal.size() == silent.size() && read(options.output / "audio-1.wav") == signal, "Multiple sinks");
        for (std::size_t offset = 58; offset < signal.size(); offset += 4) {
            const auto sample = (offset - 58) / 8;
            const auto expected = 0.25 * std::sin(static_cast<double>(sample) * 3.141592653589793 / 2);
            require(std::abs(std::bit_cast<float>(word(signal, offset)) - expected) < 2e-6, "Interleaved signal samples");
        }
        options.output = temporary.path / "repeat";
        require(!runOffline(plan.dump(), options).error && read(options.output / "audio.wav") == signal,
            "Repeat byte identity");
        require(read(options.output / "manifest.json") == read(temporary.path / "signal" / "manifest.json"), "Repeat manifest identity");
        plan["params"][1]["audioControl"] = 1;
        options.output = temporary.path / "bound";
        require(!runOffline(plan.dump(), options).error, "Stateful control binding export");
        const auto bound = read(options.output / "audio.wav");
        for (std::size_t sample = 0; sample < 441; ++sample) {
            const auto endpoint = static_cast<double>((sample / 128 + 1) * 128) / 44100;
            const auto expected = endpoint * std::sin(static_cast<double>(sample) * 3.141592653589793 / 2);
            require(std::abs(std::bit_cast<float>(word(bound, 58 + sample * 8)) - expected) < 2e-6,
                "Audio-domain integrator sampled at quantum endpoint");
        }
        options.output = temporary.path / "bound-repeat"; options.fps = "240";
        require(!runOffline(plan.dump(), options).error && read(options.output / "audio.wav") == bound,
            "Bound audio independent of video cadence");
        auto frameBinding = plan;
        frameBinding["params"][1]["audioControl"] = 0;
        frameBinding["control"]["ops"][0]["op"] = "time.frame";
        frameBinding["control"]["ops"][0]["values"] = Plan::array();
        options.output = temporary.path / "quantum-frame"; options.fps = "1";
        require(!runOffline(frameBinding.dump(), options).error, "Audio frame binding export");
        const auto quantumFrames = read(options.output / "audio.wav");
        for (std::size_t sample = 0; sample < 441; ++sample) {
            const auto expected = static_cast<double>(sample / 128 + 1) *
                std::sin(static_cast<double>(sample) * 3.141592653589793 / 2);
            require(std::abs(std::bit_cast<float>(word(quantumFrames, 58 + sample * 8)) - expected) < 2e-6,
                "Audio frame counts quantum endpoints including drain");
        }
        options.output = temporary.path / "quantum-frame-fast"; options.fps = "240";
        require(!runOffline(frameBinding.dump(), options).error && read(options.output / "audio.wav") == quantumFrames,
            "Audio frame binding independent of video cadence");
        auto rampBinding = plan;
        rampBinding["params"][1]["smooth"] = "ramp";
        options.output = temporary.path / "ramp-binding";
        require(!runOffline(rampBinding.dump(), options).error, "Bound ramp export");
        const auto ramp = read(options.output / "audio.wav");
        for (std::size_t sample = 0; sample < 441; ++sample) {
            const auto quantum = sample / 128;
            const auto previous = quantum == 0 ? 0.25 : static_cast<double>(quantum * 128) / 44100;
            const auto endpoint = static_cast<double>((quantum + 1) * 128) / 44100;
            const auto amplitude = previous + (endpoint - previous) * static_cast<double>(sample % 128) / 127;
            const auto expected = amplitude * std::sin(static_cast<double>(sample) * 3.141592653589793 / 2);
            require(std::abs(std::bit_cast<float>(word(ramp, 58 + sample * 8)) - expected) < 2e-6,
                "Binding preserves initial value and quantum ramp");
        }
        auto invalidBinding = plan;
        invalidBinding["params"][1]["audioControl"] = 0;
        invalidBinding["control"]["ops"][0]["values"] = {1, 2};
        options.output = temporary.path / "vector-binding";
        auto rejected = runOffline(invalidBinding.dump(), options);
        require(rejected.error && rejected.error->reason == "control_width" &&
            !std::filesystem::exists(options.output), "Vector binding rejected before output");
        invalidBinding["control"]["ops"][0]["values"] = {1e300};
        options.output = temporary.path / "overflow-binding";
        require(runOffline(invalidBinding.dump(), options).error.has_value() &&
            !std::filesystem::exists(options.output / "manifest.json"), "Overflow binding aborts without success manifest");
        plan["slots"] = {{{"id", "external"}, {"kind", "buffer"}, {"source", "asset"}, {"channels", "stereo"}}};
        options.output = temporary.path / "slots";
        require(!runOffline(plan.dump(), options).error, "Unused slot needs no file");
        plan = base();
        plan["slots"] = {{{"id", "pcm"}, {"kind", "buffer"}, {"source", "batch.output"}, {"channels", "stereo"}}};
        plan["params"] = {{{"slot", 0}, {"node", "player"}, {"field", "gain"}, {"smooth", "none"}, {"sync", "audio"}, {"value", 1}}};
        plan["audio"]["buffers"] = {{{"id", 0}, {"channels", "stereo"}}};
        plan["audio"]["nodes"] = {{{"node", "player"}, {"kernel", "sample-player"}, {"stateVersion", 1},
            {"in", Plan::array()}, {"out", {0}}, {"params", {0}}, {"bufferSlot", "pcm"}}};
        plan["audio"]["sinks"] = {{{"node", "out"}, {"buffer", 0}, {"kind", "device"}, {"subgraphHash", "1234abcd"}}};
        options.output = temporary.path / "missing-slot";
        require(runOffline(plan.dump(), options).error.has_value() && !std::filesystem::exists(options.output), "Missing used slot rejected before output");
        const auto raw = temporary.path / "pcm.f32";
        const auto writeSample = [](std::ostream& stream, float sample) {
            const auto bits = std::bit_cast<std::uint32_t>(sample);
            for (unsigned byte = 0; byte < 4; ++byte) { stream.put(static_cast<char>((bits >> (byte * 8)) & 255)); }
        };
        {
            std::ofstream stream(raw, std::ios::binary);
            for (unsigned channel = 0; channel < 2; ++channel) {
                for (unsigned sample = 0; sample < 200; ++sample) { writeSample(stream, channel == 0 ? 0.25f : -0.5f); }
            }
        }
        options.slots = {{"pcm", raw}}; options.output = temporary.path / "pcm-output";
        require(!runOffline(plan.dump(), options).error, "PCM slot export failed");
        const auto pcmOutput = read(options.output / "audio.wav");
        for (std::size_t sample = 0; sample < 441; ++sample) {
            require(std::bit_cast<float>(word(pcmOutput, 58 + sample * 8)) == (sample < 200 ? 0.25f : 0) &&
                std::bit_cast<float>(word(pcmOutput, 62 + sample * 8)) == (sample < 200 ? -0.5f : 0), "Planar slot playback and EOF silence");
        }
        options.output = temporary.path / "bad-pcm";
        {
            std::ofstream stream(raw, std::ios::binary | std::ios::trunc);
            writeSample(stream, std::numeric_limits<float>::quiet_NaN()); writeSample(stream, 0);
        }
        require(runOffline(plan.dump(), options).error.has_value() && !std::filesystem::exists(options.output), "Non-finite PCM rejected before output");
        { std::ofstream stream(raw, std::ios::binary | std::ios::trunc); stream.put('x'); }
        require(runOffline(plan.dump(), options).error.has_value() && !std::filesystem::exists(options.output), "Partial PCM rejected before output");
        std::cout << "offline driver checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
