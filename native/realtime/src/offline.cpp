#include "nodetool/realtime/offline.h"
#include "nodetool/realtime/audio.h"
#include "nodetool/realtime/control.h"
#include "nodetool/realtime/offline_clock.h"
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <fstream>
#include <limits>
#include <stdexcept>

namespace nt::realtime {
namespace {
void little(std::ostream& stream, std::uint32_t value, unsigned bytes = 4) {
    for (unsigned i = 0; i < bytes; ++i) { stream.put(static_cast<char>((value >> (8 * i)) & 255)); }
}
// Offline host thread only. Owns one file stream, closed on scope exit.
class Wave {
public:
    Wave(const std::filesystem::path& path, unsigned channels, unsigned rate, std::uint64_t samples)
        : channels_(channels) {
        static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559);
        const auto bytes = samples * channels * 4;
        if (bytes > std::numeric_limits<std::uint32_t>::max() - 50) { throw std::length_error("WAV exceeds RIFF size limit"); }
        stream_.exceptions(std::ios::failbit | std::ios::badbit);
        stream_.open(path, std::ios::binary | std::ios::out);
        stream_.write("RIFF", 4); little(stream_, static_cast<std::uint32_t>(bytes + 50));
        stream_.write("WAVEfmt ", 8); little(stream_, 18);
        little(stream_, 3, 2); little(stream_, channels, 2); little(stream_, rate);
        little(stream_, rate * channels * 4); little(stream_, channels * 4, 2);
        little(stream_, 32, 2); little(stream_, 0, 2);
        stream_.write("fact", 4); little(stream_, 4); little(stream_, static_cast<std::uint32_t>(samples));
        stream_.write("data", 4); little(stream_, static_cast<std::uint32_t>(bytes));
    }
    void append(std::span<const float> planar, unsigned samples) {
        if (samples > 128 || planar.size() != channels_ * 128) { throw std::logic_error("Unexpected audio sink layout"); }
        for (unsigned sample = 0; sample < samples; ++sample) {
            for (unsigned channel = 0; channel < channels_; ++channel) {
                little(stream_, std::bit_cast<std::uint32_t>(planar[channel * 128 + sample]));
            }
        }
    }
    void close() { stream_.close(); }
private:
    unsigned channels_;
    std::ofstream stream_;
};
void tick(ControlExecutor& executor, double seconds, double dt, std::uint64_t frame,
    unsigned width, unsigned height) {
    const auto result = executor.tick({seconds, seconds * 2, dt, 2, frame, width, height});
    if (!result.accepted || result.skipped != 0) { throw std::runtime_error("Offline control tick rejected or skipped state"); }
}
}
OfflineResult runOffline(std::string_view json, const OfflineOptions& options) {
    const auto failure = [](std::string reason, std::string detail) -> OfflineResult {
        return {Diagnostic{"$offline", std::move(reason), std::move(detail)}, 0, 0};
    };
    try {
        Registry registry;
        registerControlOperations(registry); registerAudioKernels(registry);
        auto loaded = loadPlan(json, registry);
        if (!loaded.plan) { return {loaded.error, 0, 0}; }
        const auto& plan = *loaded.plan;
        if (!plan["render"]["passes"].empty() || plan["render"].contains("present") || !plan["slots"].empty()) {
            return failure("unsupported", "Offline driver currently accepts control/audio graphs without render output or slots");
        }
        const auto rate = plan["session"]["sampleRate"].get<unsigned>();
        const auto channels = plan["session"]["channels"] == "mono" ? 1u : 2u;
        const auto width = plan["session"]["width"].get<unsigned>();
        const auto height = plan["session"]["height"].get<unsigned>();
        const auto clock = OfflineClock::prepare(options.duration, options.fps, rate);
        if (!clock) { return failure("clock", "Expected positive duration <= 600 and fps <= 240, as integer, decimal or fraction"); }
        auto audio = AudioExecutor::prepare(plan);
        if (!audio.executor) { return {audio.error, 0, 0}; }
        auto audioControl = ControlExecutor::prepare(plan, ControlDomain::audio);
        if (!audioControl.executor) { return {audioControl.error, 0, 0}; }
        auto renderControl = ControlExecutor::prepare(plan, ControlDomain::render);
        if (!renderControl.executor) { return {renderControl.error, 0, 0}; }
        // Host-thread values. Indices borrow the prepared executor's fixed register
        // layout, while parameter pointers are used only during preparation.
        struct Binding { unsigned parameter; unsigned control; std::string node; };
        std::unordered_map<unsigned, const Plan*> parameters;
        for (const auto& parameter : plan["params"]) {
            parameters.emplace(parameter["slot"].get<unsigned>(), &parameter);
            if (parameter.contains("audioControl") &&
                audioControl.executor->registers()[parameter["audioControl"].get<unsigned>()].width != 1) {
                return {Diagnostic{parameter["node"], "control_width", "Audio parameters require scalar control registers"}, 0, 0};
            }
        }
        std::vector<float> snapshot;
        std::vector<Binding> bindings;
        snapshot.reserve(audio.executor->parameterSlots().size());
        for (const auto slot : audio.executor->parameterSlots()) {
            const auto& parameter = *parameters.at(slot);
            if (parameter.contains("audioControl")) {
                bindings.push_back({static_cast<unsigned>(snapshot.size()), parameter["audioControl"].get<unsigned>(), parameter["node"]});
            }
            const auto& value = parameter["value"];
            snapshot.push_back(value.is_boolean() ? (value.get<bool>() ? 1.0f : 0.0f) : value.get<float>());
        }
        const auto sinkCount = static_cast<unsigned>(plan["audio"]["sinks"].size());
        // A control-only graph exports a silent session-layout track.
        std::array<float, 256> silence{};
        std::vector<std::unique_ptr<Wave>> waves;
        waves.reserve(std::max(1u, sinkCount));
        if (options.output.empty() || !std::filesystem::create_directory(options.output)) {
            return failure("output", "Output must be a new directory with an existing parent");
        }
        Plan files = Plan::array();
        for (unsigned i = 0; i < std::max(1u, sinkCount); ++i) {
            const auto name = i == 0 ? std::string("audio.wav") : "audio-" + std::to_string(i) + ".wav";
            waves.push_back(std::make_unique<Wave>(options.output / name, channels, rate, clock->sampleCount()));
            files.push_back(name);
        }
        std::uint64_t quantum = 0;
        std::uint64_t sanitized = 0;
        double lastRenderTime = 0;
        const double dt = 128.0 / rate;
        const auto advance = [&](std::uint64_t end, std::uint64_t frame) {
            while (quantum < end) {
                const double seconds = static_cast<double>((quantum + 1) * 128) / rate;
                tick(*audioControl.executor, seconds, dt, quantum + 1, width, height);
                for (const auto& binding : bindings) {
                    const auto value = audioControl.executor->registers()[binding.control].lanes[0];
                    if (!std::isfinite(value) || std::abs(value) > std::numeric_limits<float>::max()) {
                        throw std::runtime_error(binding.node + "/parameter: audio control value is outside finite float range");
                    }
                    snapshot[binding.parameter] = static_cast<float>(value);
                }
                const auto result = audio.executor->process({snapshot, true});
                if (!result.accepted) { throw std::runtime_error("Offline audio quantum rejected"); }
                sanitized += result.nonFiniteSamples;
                tick(*renderControl.executor, seconds, seconds - lastRenderTime, frame, width, height);
                lastRenderTime = seconds;
                for (unsigned i = 0; i < waves.size(); ++i) {
                    const auto pcm = sinkCount == 0 ? std::span<const float>(silence).first(channels * 128) : audio.executor->sink(i);
                    waves[i]->append(pcm, clock->exportedSamples(quantum));
                }
                ++quantum;
            }
        };
        for (std::uint64_t frame = 0; frame < clock->frameCount(); ++frame) {
            const auto time = *clock->frame(frame);
            advance(time.completedQuanta, frame);
            tick(*renderControl.executor, time.seconds, time.seconds - lastRenderTime, frame, width, height);
            lastRenderTime = time.seconds;
        }
        advance(clock->quantumCount(), clock->frameCount());
        for (auto& wave : waves) { wave->close(); }
        const Plan manifest = {{"schemaVersion", 1}, {"mode", "offline-audio"},
            {"duration", options.duration}, {"fps", options.fps}, {"sampleRate", rate}, {"channels", channels},
            {"samples", clock->sampleCount()}, {"controlFrames", clock->frameCount()}, {"imageFrames", 0},
            {"quanta", quantum}, {"sanitizedSamples", sanitized}, {"audioFiles", files}};
        std::ofstream stream;
        stream.exceptions(std::ios::failbit | std::ios::badbit);
        stream.open(options.output / "manifest.partial.json", std::ios::binary | std::ios::out);
        stream << manifest.dump(2) << '\n';
        stream.close();
        std::filesystem::rename(options.output / "manifest.partial.json", options.output / "manifest.json");
        return {std::nullopt, clock->sampleCount(), clock->frameCount()};
    } catch (const std::exception& error) {
        return failure("offline", error.what());
    }
}
}
