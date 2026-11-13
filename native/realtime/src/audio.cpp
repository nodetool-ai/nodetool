#include "nodetool/realtime/audio.h"
#include "nodetool/realtime/control.h"
#include "nodetool/realtime/math.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace nt::realtime {
namespace {
// Executor-thread-only storage. Cells provide the C ABI alignment and lifetime.
struct alignas(NT_DSP_STATE_ALIGNMENT) Cell { std::byte bytes[NT_DSP_STATE_ALIGNMENT]; };
// Audio thread only after preparation. PCM owns its backing allocation.
struct Buffer { unsigned channels; std::vector<float> pcm; };
// Audio thread only. All pointers borrow stable storage owned by the executor.
struct Node {
    const nt_dsp_kernel* kernel = nullptr;
    nt_dsp_config config{};
    std::vector<Cell> state;
    std::vector<const float*> inputs;
    std::vector<float*> outputs;
    std::vector<unsigned> params;
    std::vector<float> begin;
    std::vector<float> end;
    std::vector<const float*> parameterFrames;
    std::array<const float*, 2> sample{};
    std::uint64_t sampleFrames = 0;
    nt_dsp_meter meter{};
    unsigned eventStart = 0;
    unsigned eventCount = 0;
};
// Audio thread only, owns a sink's immutable-until-next-quantum output copy.
struct Sink { unsigned buffer; std::vector<float> pcm; };
unsigned channels(const Plan& value) { return value == "mono" ? 1u : 2u; }
enum class Smoothing { none, ramp, onePole };
std::uint32_t seed(std::uint32_t session, std::string_view name) {
    auto hash = session ^ 2166136261u;
    for (unsigned char byte : name) { hash = (hash ^ byte) * 16777619u; }
    return hash;
}
}
// Same exclusive ownership as AudioExecutor. No borrowed preparation data.
struct AudioExecutor::Storage {
    std::vector<Buffer> buffers;
    std::vector<Node> nodes;
    std::vector<Sink> sinks;
    std::vector<AudioBufferSlot> slots;
    std::vector<unsigned> parameterSlots;
    std::vector<float> initial;
    std::vector<float> previous;
    std::vector<float> snapshot;
    std::vector<Smoothing> smoothing;
    std::vector<double> coefficient;
    std::vector<float> parameterFrames;
    std::vector<nt_dsp_event> events;
    unsigned quantum = 128;
    std::uint64_t streamFrame = 0;
};

void registerAudioKernels(Registry& registry) {
    for (unsigned i = 0; const auto* name = nt_dsp_builtin_name(i); ++i) {
        const auto& kernel = *nt_dsp_builtin(name);
        registry.kernels.insert_or_assign(name, KernelDefinition{
            std::vector<std::string>(kernel.inputs, "session"), std::vector<std::string>(kernel.outputs, "session"), false});
    }
}
AudioExecutor::AudioExecutor(std::unique_ptr<Storage> storage) : storage_(std::move(storage)) {}
AudioExecutor::~AudioExecutor() = default;
std::span<const unsigned> AudioExecutor::parameterSlots() const noexcept { return storage_->parameterSlots; }
std::span<const float> AudioExecutor::sink(unsigned index) const noexcept {
    return index < storage_->sinks.size() ? std::span<const float>(storage_->sinks[index].pcm) : std::span<const float>{};
}
nt_dsp_meter AudioExecutor::meter(unsigned node) const noexcept { return node < storage_->nodes.size() ? storage_->nodes[node].meter : nt_dsp_meter{}; }
void AudioExecutor::reset() noexcept {
    auto& data = *storage_;
    data.streamFrame = 0;
    std::copy(data.initial.begin(), data.initial.end(), data.previous.begin());
    std::copy(data.initial.begin(), data.initial.end(), data.snapshot.begin());
    for (auto& node : data.nodes) { node.kernel->init(node.state.data(), &node.config); node.meter = {}; }
    for (auto& buffer : data.buffers) { std::fill(buffer.pcm.begin(), buffer.pcm.end(), 0.0f); }
    for (auto& sink : data.sinks) { std::fill(sink.pcm.begin(), sink.pcm.end(), 0.0f); }
}
AudioQuantumResult AudioExecutor::process(AudioParamSnapshot params, std::span<const AudioEvent> events) noexcept {
    auto& data = *storage_;
    AudioQuantumResult result{false, data.streamFrame};
    if (data.streamFrame > std::numeric_limits<std::uint64_t>::max() - data.quantum || events.size() > data.events.size()) { return result; }
    if (params.valid) {
        if (params.values.size() != data.previous.size()) { return result; }
        for (float value : params.values) { if (!std::isfinite(value)) { return result; } }
    }
    const auto end = data.streamFrame + data.quantum;
    for (std::size_t i = 0; i < events.size(); ++i) {
        const auto& event = events[i];
        if (event.node >= data.nodes.size() || event.type < NT_DSP_RESET || event.type > NT_DSP_SEEK ||
            !std::isfinite(event.value) || (i > 0 && event.streamFrame < events[i - 1].streamFrame)) { return result; }
        const auto& node = data.nodes[event.node];
        if (!(node.kernel->event_mask & (1u << event.type))) { return result; }
        if (event.type == NT_DSP_SEEK && (event.value < 0 || event.value > static_cast<double>(node.sampleFrames) ||
            event.value != std::floor(event.value))) { return result; }
    }
    // No mutation occurs before the whole supplied snapshot/event batch validates.
    if (params.valid) { std::copy(params.values.begin(), params.values.end(), data.snapshot.begin()); }
    // A failed snapshot keeps the previous target, including a one-pole tail.
    for (std::size_t slot = 0; slot < data.snapshot.size(); ++slot) {
        double filtered = data.previous[slot];
        const double target = data.snapshot[slot];
        for (unsigned frame = 0; frame < data.quantum; ++frame) {
            double value = target;
            if (data.smoothing[slot] == Smoothing::ramp) {
                value = data.previous[slot] + (target - data.previous[slot]) * frame / (data.quantum - 1);
            } else if (data.smoothing[slot] == Smoothing::onePole) {
                filtered = target + (filtered - target) * data.coefficient[slot];
                if (std::abs(filtered) < 1e-30) { filtered = 0; }
                value = filtered;
            }
            data.parameterFrames[slot * data.quantum + frame] = static_cast<float>(std::clamp(value,
                -static_cast<double>(std::numeric_limits<float>::max()), static_cast<double>(std::numeric_limits<float>::max())));
        }
    }
    for (auto& node : data.nodes) { node.eventCount = 0; }
    for (const auto& event : events) {
        if (event.streamFrame >= end) { break; }
        ++data.nodes[event.node].eventCount; ++result.consumedEvents;
        if (event.streamFrame < data.streamFrame) { ++result.lateEvents; }
    }
    unsigned offset = 0;
    for (auto& node : data.nodes) { node.eventStart = offset; offset += node.eventCount; node.eventCount = 0; }
    for (std::size_t i = 0; i < result.consumedEvents; ++i) {
        const auto& event = events[i]; auto& node = data.nodes[event.node];
        data.events[node.eventStart + node.eventCount++] = {
            event.streamFrame < data.streamFrame ? 0u : static_cast<unsigned>(event.streamFrame - data.streamFrame), event.type, event.value};
    }
    for (auto& node : data.nodes) {
        for (unsigned i = 0; i < node.params.size(); ++i) {
            const auto slot = node.params[i];
            node.begin[i] = data.parameterFrames[slot * data.quantum];
            node.end[i] = data.parameterFrames[(slot + 1) * data.quantum - 1];
        }
        const nt_dsp_args args{node.inputs.data(), node.outputs.data(), node.begin.data(), node.end.data(),
            data.events.data() + node.eventStart, node.eventCount, data.quantum, data.streamFrame,
            node.sample.data(), node.sampleFrames, &node.meter, node.parameterFrames.data()};
        node.kernel->process(node.state.data(), &args);
    }
    for (auto& sink : data.sinks) {
        const auto& source = data.buffers[sink.buffer].pcm;
        for (std::size_t i = 0; i < source.size(); ++i) {
            if (std::isfinite(source[i])) { sink.pcm[i] = source[i]; }
            else { sink.pcm[i] = 0; ++result.nonFiniteSamples; }
        }
    }
    for (std::size_t slot = 0; slot < data.previous.size(); ++slot) { data.previous[slot] = data.parameterFrames[(slot + 1) * data.quantum - 1]; }
    data.streamFrame = end; result.accepted = true;
    return result;
}

AudioExecutor::Prepared AudioExecutor::prepare(const Plan& plan, std::vector<AudioBufferSlot> slots, AudioPrepareOptions options) {
    std::string current = "$audio";
    const auto failure = [&](std::string reason, std::string detail) -> Prepared { return {nullptr, Diagnostic{current, std::move(reason), std::move(detail)}}; };
    try {
        if (options.maxEvents == 0 || options.maxEvents > 65536 || options.maxBytes > 1024ull * 1024 * 1024) { return failure("budget", "Invalid audio preparation limits"); }
        // Preserve control producers for parameter-reference validation. The host
        // still prepares control instructions and supplies snapshots separately.
        auto projection = plan;
        projection["render"] = {{"passes", Plan::array()}};
        Registry registry; registerAudioKernels(registry); registerControlOperations(registry);
        const auto loaded = loadPlan(projection.dump(), registry);
        if (!loaded.plan) { return {nullptr, loaded.error}; }
        const auto& document = *loaded.plan;
        auto data = std::make_unique<Storage>();
        data->slots = std::move(slots);
        data->quantum = document["session"]["quantum"].get<unsigned>();
        const auto rate = document["session"]["sampleRate"].get<unsigned>();
        const auto layout = channels(document["session"]["channels"]);
        std::size_t bytes = 0;
        const auto reserve = [&](std::size_t amount) {
            if (amount > options.maxBytes - bytes) { throw std::length_error("Audio storage exceeds budget"); }
            bytes += amount;
        };
        reserve(static_cast<std::size_t>(options.maxEvents) * sizeof(nt_dsp_event));
        data->events.resize(options.maxEvents);
        std::unordered_map<std::string, std::size_t> sampleIndices;
        std::unordered_map<std::string, const Plan*> declaredSlots;
        for (const auto& slot : document["slots"]) { declaredSlots.emplace(slot["id"].get<std::string>(), &slot); }
        reserve(data->slots.capacity() * sizeof(AudioBufferSlot));
        for (std::size_t i = 0; i < data->slots.size(); ++i) {
            const auto& slot = data->slots[i]; current = slot.id;
            if (slot.sampleRate != rate || slot.channels != layout || slot.samples.empty() || slot.samples.size() % layout != 0 ||
                !sampleIndices.emplace(slot.id, i).second) { return failure("buffer_slot", "Slot must be unique planar PCM at session rate/layout"); }
            const auto declared = declaredSlots.find(slot.id);
            if (declared == declaredSlots.end() || (*declared->second)["kind"] != "buffer" || channels((*declared->second)["channels"]) != layout) {
                return failure("buffer_slot", "PCM has no matching buffer slot declaration");
            }
            reserve(slot.samples.capacity() * sizeof(float));
        }
        std::unordered_map<unsigned, unsigned> bufferIndices;
        reserve(document["audio"]["buffers"].size() * sizeof(Buffer));
        data->buffers.reserve(document["audio"]["buffers"].size());
        for (const auto& description : document["audio"]["buffers"]) {
            const auto count = channels(description["channels"]);
            reserve(count * data->quantum * sizeof(float));
            bufferIndices.emplace(description["id"].get<unsigned>(), static_cast<unsigned>(data->buffers.size()));
            data->buffers.push_back({count, std::vector<float>(count * data->quantum)});
        }
        std::unordered_set<unsigned> used;
        for (const auto& node : document["audio"]["nodes"]) { for (const auto& slot : node["params"]) { used.insert(slot.get<unsigned>()); } }
        std::unordered_map<unsigned, unsigned> paramIndices;
        data->parameterSlots.reserve(used.size()); data->initial.reserve(used.size());
        data->smoothing.reserve(used.size()); data->coefficient.reserve(used.size());
        for (const auto& param : document["params"]) {
            const auto slot = param["slot"].get<unsigned>();
            if (!used.contains(slot)) { continue; }
            current = param["node"].get<std::string>();
            const auto& value = param["value"];
            if (!value.is_number() && !value.is_boolean()) { return failure("parameter", "Audio parameters must be scalar"); }
            const double number = value.is_boolean() ? (value.get<bool>() ? 1.0 : 0.0) : value.get<double>();
            if (std::abs(number) > std::numeric_limits<float>::max()) { return failure("parameter", "Audio parameter exceeds float range"); }
            reserve(sizeof(float) * (3 + data->quantum) + sizeof(unsigned) + sizeof(Smoothing) + sizeof(double));
            paramIndices.emplace(slot, static_cast<unsigned>(data->parameterSlots.size()));
            data->parameterSlots.push_back(slot); data->initial.push_back(static_cast<float>(number));
            data->smoothing.push_back(param["smooth"] == "ramp" ? Smoothing::ramp : (param["smooth"] == "onePole" ? Smoothing::onePole : Smoothing::none));
            data->coefficient.push_back(param["smooth"] == "onePole" ? math::exponential(-1 / (param["timeConstant"].get<double>() * rate)) : 0);
        }
        data->previous = data->initial; data->snapshot = data->initial;
        data->parameterFrames.resize(data->initial.size() * data->quantum);
        std::unordered_map<std::string, const Plan*> nodeDescriptions;
        for (const auto& node : document["audio"]["nodes"]) { nodeDescriptions.emplace(node["node"].get<std::string>(), &node); }
        reserve(document["audio"]["nodes"].size() * sizeof(Node));
        data->nodes.reserve(document["audio"]["nodes"].size());
        for (const auto& description : document["audio"]["nodes"]) {
            current = description["node"].get<std::string>();
            const auto name = description["kernel"].get<std::string>();
            Node node; node.kernel = nt_dsp_builtin(name.c_str());
            if (description["stateVersion"] != node.kernel->state_version) { return failure("state_version", "Unsupported DSP state version"); }
            if (description["params"].size() != node.kernel->params) { return failure("parameter", "Kernel parameter count differs"); }
            node.config = {rate, data->quantum, layout, seed(document["session"]["seed"].get<std::uint32_t>(), current), 0};
            if (name == "delay") {
                if (!description.contains("delayFrames")) { return failure("delay", "Delay requires delayFrames"); }
                node.config.delay_frames = description["delayFrames"].get<unsigned>();
            } else if (description.contains("delayFrames")) { return failure("delay", "Only delay accepts delayFrames"); }
            if (name == "sample-player") {
                if (!description.contains("bufferSlot")) { return failure("buffer_slot", "Sample player requires bufferSlot"); }
                const auto slot = sampleIndices.find(description["bufferSlot"].get<std::string>());
                if (slot == sampleIndices.end()) { return failure("buffer_slot", "Missing prepared PCM"); }
                const auto& source = data->slots[slot->second]; node.sampleFrames = source.samples.size() / layout;
                for (unsigned c = 0; c < layout; ++c) { node.sample[c] = source.samples.data() + c * node.sampleFrames; }
            } else if (description.contains("bufferSlot")) { return failure("buffer_slot", "Only sample-player accepts bufferSlot"); }
            const auto cells = (node.kernel->state_size(&node.config) + sizeof(Cell) - 1) / sizeof(Cell);
            reserve(cells * sizeof(Cell)); node.state.resize(cells);
            node.kernel->init(node.state.data(), &node.config);
            reserve((node.kernel->inputs + node.kernel->outputs) * layout * sizeof(float*) + node.kernel->params * (2 * sizeof(float) + sizeof(unsigned) + sizeof(float*)));
            node.inputs.reserve(node.kernel->inputs * layout); node.outputs.reserve(node.kernel->outputs * layout); node.params.reserve(node.kernel->params);
            node.parameterFrames.reserve(node.kernel->params);
            for (const auto& input : description["in"]) {
                const auto& producer = *nodeDescriptions.at(input["node"].get<std::string>());
                const auto& buffer = data->buffers[bufferIndices.at(producer["out"][input["output"].get<unsigned>()].get<unsigned>())];
                for (unsigned c = 0; c < layout; ++c) { node.inputs.push_back(buffer.pcm.data() + c * data->quantum); }
            }
            for (const auto& output : description["out"]) {
                auto& buffer = data->buffers[bufferIndices.at(output.get<unsigned>())];
                for (unsigned c = 0; c < layout; ++c) { node.outputs.push_back(buffer.pcm.data() + c * data->quantum); }
            }
            for (const auto& slot : description["params"]) {
                const auto index = paramIndices.at(slot.get<unsigned>());
                node.params.push_back(index); node.parameterFrames.push_back(data->parameterFrames.data() + index * data->quantum);
            }
            node.begin.resize(node.params.size()); node.end.resize(node.params.size());
            data->nodes.push_back(std::move(node));
        }
        data->sinks.reserve(document["audio"]["sinks"].size());
        for (const auto& description : document["audio"]["sinks"]) {
            current = description["node"].get<std::string>();
            const auto buffer = bufferIndices.at(description["buffer"].get<unsigned>());
            reserve(sizeof(Sink) + data->buffers[buffer].pcm.size() * sizeof(float));
            data->sinks.push_back({buffer, std::vector<float>(data->buffers[buffer].pcm.size())});
        }
        return {std::make_unique<AudioExecutor>(std::move(data)), std::nullopt};
    } catch (const Plan::exception& error) { return failure("structure", error.what()); }
    catch (const std::length_error& error) { return failure("budget", error.what()); }
}
}
