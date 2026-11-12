#include "nodetool/realtime/audio.h"
#include "platform/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif
#include <array>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
using namespace nt::realtime;
void require(bool condition, const char* message) { if (!condition) { throw std::runtime_error(message); } }
void near(double actual, double expected, double tolerance = 2e-6) {
    if (!std::isfinite(actual) || std::abs(actual - expected) > tolerance) {
        throw std::runtime_error("Sample mismatch: " + std::to_string(actual) + " expected " + std::to_string(expected));
    }
}
Plan base(unsigned channelCount = 1, unsigned rate = 48000) {
    return {{"schemaVersion", 1}, {"revision", 1},
        {"session", {{"sampleRate", rate}, {"quantum", 128}, {"channels", channelCount == 1 ? "mono" : "stereo"}, {"width", 64}, {"height", 64}, {"seed", 17}}},
        {"params", Plan::array()}, {"slots", Plan::array()},
        {"control", {{"registers", 0}, {"ops", Plan::array()}, {"stateful", Plan::array()}}},
        {"render", {{"passes", Plan::array()}}},
        {"audio", {{"buffers", Plan::array()}, {"nodes", Plan::array()}, {"sinks", Plan::array()}}}};
}
unsigned add(Plan& plan, const char* kernel, std::vector<unsigned> inputs, std::vector<float> values) {
    const auto id = static_cast<unsigned>(plan["audio"]["nodes"].size());
    const auto name = "node-" + std::to_string(id);
    Plan in = Plan::array(), params = Plan::array();
    for (auto source : inputs) { in.push_back({{"node", "node-" + std::to_string(source)}, {"output", 0}}); }
    for (float value : values) {
        const auto slot = static_cast<unsigned>(plan["params"].size());
        params.push_back(slot);
        plan["params"].push_back({{"slot", slot}, {"node", name}, {"field", "p" + std::to_string(slot)}, {"smooth", "none"}, {"sync", "audio"}, {"value", value}});
    }
    plan["audio"]["buffers"].push_back({{"id", id}, {"channels", plan["session"]["channels"]}});
    plan["audio"]["nodes"].push_back({{"node", name}, {"kernel", kernel}, {"stateVersion", 1}, {"in", in}, {"out", {id}}, {"params", params}});
    return id;
}
void sink(Plan& plan, unsigned buffer, const char* name = "output") {
    plan["audio"]["sinks"].push_back({{"node", name}, {"buffer", buffer}, {"kind", "device"}, {"subgraphHash", "1234abcd"}});
}
void player(Plan& plan) {
    add(plan, "sample-player", {}, {1});
    plan["audio"]["nodes"][0]["bufferSlot"] = "pcm";
    plan["slots"].push_back({{"id", "pcm"}, {"kind", "buffer"}, {"source", "asset"}, {"channels", plan["session"]["channels"]}});
}
std::vector<AudioBufferSlot> pcm(std::vector<float> samples, unsigned channels = 1, unsigned rate = 48000) {
    std::vector<AudioBufferSlot> result; result.push_back({"pcm", rate, channels, std::move(samples)}); return result;
}
std::unique_ptr<AudioExecutor> prepare(const Plan& plan, std::vector<AudioBufferSlot> slots = {}, AudioPrepareOptions options = {}) {
    auto result = AudioExecutor::prepare(plan, std::move(slots), options);
    if (!result.executor) { throw std::runtime_error(result.error->node + "/" + result.error->reason + ": " + result.error->detail); }
    return std::move(result.executor);
}
void rejected(const Plan& plan, const char* reason, std::vector<AudioBufferSlot> slots = {}, AudioPrepareOptions options = {}) {
    auto result = AudioExecutor::prepare(plan, std::move(slots), options);
    require(!result.executor && result.error && result.error->reason == reason, "Wrong audio preparation rejection");
}

void sourcesAndPorts() {
    for (const unsigned rate : {44100u, 48000u}) {
        auto plan = base(2, rate); add(plan, "oscillator", {}, {static_cast<float>(rate) / 4, 0.5f}); sink(plan, 0);
        auto engine = prepare(plan); require(engine->process().accepted, "Oscillator quantum rejected");
        for (unsigned i = 0; i < 128; ++i) {
            near(engine->sink(0)[i], std::sin(i * 3.141592653589793 / 2) * 0.5);
            near(engine->sink(0)[128 + i], engine->sink(0)[i], 0);
        }
        const std::array<AudioEvent, 1> reset{{{128 + 3, 0, NT_DSP_RESET}}};
        engine->process({}, reset); near(engine->sink(0)[3], 0); near(engine->sink(0)[4], 0.5);
    }
    auto plan = base(2); player(plan); add(plan, "gain", {0}, {0.5f}); add(plan, "mix", {0, 1}, {0.25f, 1}); add(plan, "level-meter", {2}, {}); sink(plan, 3);
    std::vector<float> samples(256, -0.5f); std::fill_n(samples.begin(), 128, 1.0f);
    auto engine = prepare(plan, pcm(samples, 2)); engine->process();
    for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], 0.75); near(engine->sink(0)[128 + i], -0.375); }
    const auto levels = engine->meter(3); near(levels.peak[0], 0.75); near(levels.rms[1], 0.375);

    plan = base(); add(plan, "noise", {}, {1}); add(plan, "gain", {0}, {0.5f}); add(plan, "gain", {1}, {0.5f}); sink(plan, 2);
    auto separate = prepare(plan); separate->process();
    plan["audio"]["nodes"][2]["out"] = {0}; plan["audio"]["sinks"][0]["buffer"] = 0;
    auto reused = prepare(plan); reused->process();
    require(std::memcmp(separate->sink(0).data(), reused->sink(0).data(), 128 * sizeof(float)) == 0, "Liveness buffer reuse changed output");
    plan["audio"]["nodes"][1]["out"] = {0}; rejected(plan, "buffer_liveness");
}

void rampsAndEvents() {
    auto plan = base(); player(plan); add(plan, "gain", {0}, {0}); sink(plan, 1);
    plan["params"][1]["smooth"] = "ramp"; plan["params"][1]["slot"] = 4000000000u;
    plan["audio"]["nodes"][1]["params"] = {4000000000u};
    auto engine = prepare(plan, pcm(std::vector<float>(512, 1)));
    require(engine->parameterSlots().size() == 2 && engine->parameterSlots()[1] == 4000000000u, "Sparse slot mapping changed");
    const std::array<float, 2> values{1, 1};
    require(engine->process({values, true}).accepted, "Snapshot rejected");
    for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], i / 127.0); }
    engine->process(); for (float value : engine->sink(0)) { near(value, 1); }
    plan["params"][1]["smooth"] = "none";
    engine = prepare(plan, pcm(std::vector<float>(512, 1))); engine->process({values, true});
    for (float value : engine->sink(0)) { near(value, 1); }

    plan["params"][1]["smooth"] = "onePole";
    rejected(plan, "smoothing", pcm(std::vector<float>(512, 1)));
    plan["params"][1]["timeConstant"] = 0.01;
    engine = prepare(plan, pcm(std::vector<float>(512, 1)));
    engine->process({values, true});
    for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], 1 - std::exp(-(static_cast<double>(i) + 1) / 480.0)); }
    engine->process();
    for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], 1 - std::exp(-(static_cast<double>(i) + 129) / 480.0)); }
    plan["params"][1]["smooth"] = "none";
    rejected(plan, "smoothing", pcm(std::vector<float>(512, 1)));

    plan = base(); player(plan); sink(plan, 0);
    engine = prepare(plan, pcm({0.1f, 0.2f, 0.3f, 0.4f, 0.5f}));
    const std::array<AudioEvent, 3> events{{{2, 0, NT_DSP_STOP}, {4, 0, NT_DSP_SEEK, 3}, {4, 0, NT_DSP_START}}};
    auto result = engine->process({}, events);
    require(result.accepted && result.consumedEvents == 3 && result.lateEvents == 0, "Wrong event accounting");
    near(engine->sink(0)[0], 0.1); near(engine->sink(0)[1], 0.2); near(engine->sink(0)[2], 0);
    near(engine->sink(0)[4], 0.4); near(engine->sink(0)[5], 0.5); near(engine->sink(0)[6], 0);
    const std::array<AudioEvent, 2> lateAndFuture{{{0, 0, NT_DSP_RESET}, {256, 0, NT_DSP_STOP}}};
    result = engine->process({}, lateAndFuture);
    require(result.streamFrame == 128 && result.lateEvents == 1 && result.consumedEvents == 1, "Late/future event boundary wrong");
    near(engine->sink(0)[0], 0.1);
    result = engine->process({}, std::span(lateAndFuture).subspan(1));
    require(result.consumedEvents == 1 && result.lateEvents == 0, "Quantum-end event lost");
    near(engine->sink(0)[0], 0);
    const std::array<AudioEvent, 2> unordered{{{500, 0, NT_DSP_START}, {400, 0, NT_DSP_STOP}}};
    require(!engine->process({}, unordered).accepted, "Unsorted events accepted");
    const std::array<AudioEvent, 1> invalidSeek{{{384, 0, NT_DSP_SEEK, 100}}};
    require(!engine->process({}, invalidSeek).accepted, "Out-of-range seek accepted");
    const std::array<float, 1> nan{std::numeric_limits<float>::quiet_NaN()};
    require(!engine->process({nan, true}).accepted, "Non-finite snapshot accepted");
    require(engine->process().streamFrame == 384, "Rejected batch advanced stream state");
}

void sampledFilterParameters() {
    const auto& kernel = *nt_dsp_builtin("biquad.lowpass");
    const nt_dsp_config config{48000, 128, 1, 0, 0};
    alignas(NT_DSP_STATE_ALIGNMENT) std::array<std::byte, 1024> blockState{}, scalarState{};
    require(kernel.state_size(&config) <= blockState.size(), "Filter state exceeds test storage");
    kernel.init(blockState.data(), &config); kernel.init(scalarState.data(), &config);
    std::array<float, 128> input{}, output{}, frequency{}, q{}, gain{};
    input.fill(1); frequency.fill(12000); q.fill(0.5f);
    for (unsigned i = 1; i < 127; ++i) { frequency[i] = 6000; }
    const std::array<const float*, 1> in{input.data()};
    const std::array<float*, 1> out{output.data()};
    const std::array<const float*, 3> samples{frequency.data(), q.data(), gain.data()};
    const std::array<float, 3> endpoints{12000, 0.5f, 0};
    nt_dsp_args args{};
    args.in = in.data(); args.out = out.data(); args.param_begin = endpoints.data(); args.param_end = endpoints.data();
    args.frames = 128; args.param_samples = samples.data();
    kernel.process(blockState.data(), &args);
    for (unsigned i = 0; i < 128; ++i) {
        float actual = 0;
        const std::array<const float*, 1> scalarIn{input.data() + i};
        const std::array<float*, 1> scalarOut{&actual};
        const std::array<float, 3> values{frequency[i], q[i], gain[i]};
        args.in = scalarIn.data(); args.out = scalarOut.data(); args.frames = 1; args.param_samples = nullptr;
        args.param_begin = values.data(); args.param_end = values.data();
        kernel.process(scalarState.data(), &args);
        near(output[i], actual);
    }
}

void filters() {
    struct Reference { const char* name; std::array<double, 3> impulse; };
    for (const auto& reference : {Reference{"biquad.lowpass", {0.25, 0.5, 0.25}}, {"biquad.highpass", {0.25, -0.5, 0.25}},
        {"biquad.bandpass", {0.5, 0, -0.5}}, {"biquad.notch", {0.5, 0, 0.5}}, {"biquad.allpass", {0, 0, 1}},
        {"biquad.peaking", {1, 0, 0}}, {"biquad.lowshelf", {1, 0, 0}}, {"biquad.highshelf", {1, 0, 0}}}) {
        auto plan = base(); player(plan); add(plan, reference.name, {0}, {12000, 0.5f, 0}); sink(plan, 1);
        std::vector<float> input(128); input[0] = 1;
        auto engine = prepare(plan, pcm(input)); engine->process();
        for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], i < 3 ? reference.impulse[i] : 0); }
    }
    for (const char* name : {"biquad.peaking", "biquad.lowshelf", "biquad.highshelf"}) {
        auto plan = base(); player(plan); add(plan, name, {0}, {12000, 0.5f, 12}); sink(plan, 1);
        std::vector<float> signal(2048);
        for (unsigned i = 0; i < signal.size(); ++i) {
            signal[i] = std::string_view(name) == "biquad.lowshelf" ? 1.0f :
                (std::string_view(name) == "biquad.highshelf" ? (i % 2 ? -1.0f : 1.0f) : static_cast<float>(std::sin(i * 3.141592653589793 / 2)));
        }
        auto engine = prepare(plan, pcm(signal)); for (int i = 0; i < 16; ++i) { engine->process(); }
        for (unsigned i = 0; i < 128; ++i) { near(engine->sink(0)[i], signal[1920 + i] * std::pow(10, 12.0 / 20), 2e-5); }
    }
    auto plan = base(); player(plan); add(plan, "delay", {0}, {0.5f, 1});
    plan["audio"]["nodes"][1]["delayFrames"] = 3; sink(plan, 1);
    std::vector<float> input(128); input[0] = 1;
    auto engine = prepare(plan, pcm(input)); engine->process();
    for (unsigned i = 0; i < 128; ++i) {
        near(engine->sink(0)[i], i > 0 && i % 3 == 0 ? std::pow(0.5, i / 3 - 1) : 0);
    }
}

void repeatAndSafety() {
    auto noisePlan = base(); add(noisePlan, "noise", {}, {1}); sink(noisePlan, 0);
    auto noise = prepare(noisePlan); noise->process();
    const std::array<float, 4> golden{0.42520463466644287f, -0.9431201815605164f, 0.29725024104118347f, -0.9774585962295532f};
    for (unsigned i = 0; i < golden.size(); ++i) { near(noise->sink(0)[i], golden[i], 0); }
    noisePlan["audio"]["nodes"][0]["node"] = "renamed"; noisePlan["params"][0]["node"] = "renamed";
    auto renamed = prepare(noisePlan); renamed->process();
    require(std::memcmp(noise->sink(0).data(), renamed->sink(0).data(), 128 * sizeof(float)) != 0, "Noise ignored node identity");
    auto plan = base(2); add(plan, "noise", {}, {1}); add(plan, "gain", {0}, {0.5f}); sink(plan, 1);
    auto first = prepare(plan); auto second = prepare(plan);
    for (unsigned quantum = 0; quantum < 64; ++quantum) {
        const std::array<float, 2> values{1, quantum / 64.0f};
        first->process({values, true}); second->process({values, true});
        require(std::memcmp(first->sink(0).data(), second->sink(0).data(), 256 * sizeof(float)) == 0, "Audio run is not byte-repeatable");
    }
    first->reset(); second->reset(); first->process(); second->process();
    require(std::memcmp(first->sink(0).data(), second->sink(0).data(), 256 * sizeof(float)) == 0, "Reset changed repeatability");
    plan["session"]["seed"] = 18; auto different = prepare(plan); different->process();
    require(std::memcmp(first->sink(0).data(), different->sink(0).data(), 256 * sizeof(float)) != 0, "Noise ignored session seed");

    plan = base(2); player(plan); sink(plan, 0); sink(plan, 0, "second-sink");
    std::vector<float> input(256, 0.25f); input[0] = std::numeric_limits<float>::quiet_NaN(); input[128] = std::numeric_limits<float>::infinity();
    auto engine = prepare(plan, pcm(input, 2)); const auto result = engine->process();
    require(result.nonFiniteSamples == 4, "Non-finite samples not counted independently per sink");
    for (unsigned output = 0; output < 2; ++output) {
        near(engine->sink(output)[0], 0); near(engine->sink(output)[128], 0); near(engine->sink(output)[1], 0.25);
    }
    auto invalid = plan; invalid["audio"]["nodes"][0]["stateVersion"] = 2; rejected(invalid, "state_version", pcm(input, 2));
    invalid = plan; invalid["audio"]["nodes"][0]["params"] = Plan::array(); rejected(invalid, "parameter", pcm(input, 2));
    rejected(plan, "buffer_slot"); rejected(plan, "buffer_slot", pcm(input, 2, 44100));
    rejected(plan, "budget", pcm(input, 2), {1, 2});
    engine = prepare(plan, pcm(input, 2), {1024 * 1024, 2});
    const std::array<AudioEvent, 3> tooMany{{{0, 0, NT_DSP_RESET}, {1, 0, NT_DSP_RESET}, {2, 0, NT_DSP_RESET}}};
    require(!engine->process({}, tooMany).accepted, "Oversized event batch accepted");
    invalid = base(); add(invalid, "delay", {0}, {0, 1}); sink(invalid, 0); rejected(invalid, "cycle");
}

void decayAndAllocation() {
    using Clock = std::chrono::steady_clock;
    for (const char* kernel : {"biquad.lowpass", "delay"}) {
        auto plan = base(); player(plan);
        add(plan, kernel, {0}, std::string_view(kernel) == "delay" ? std::vector<float>{0.5f, 1} : std::vector<float>{1000, 0.707f, 0});
        if (std::string_view(kernel) == "delay") { plan["audio"]["nodes"][1]["delayFrames"] = 1; }
        sink(plan, 1); auto engine = prepare(plan, pcm(std::vector<float>(128 * 64, 1)));
        const auto signalStart = Clock::now(); for (unsigned q = 0; q < 64; ++q) { engine->process(); }
        const auto signal = Clock::now() - signalStart;
        for (unsigned q = 0; q < 512; ++q) { engine->process(); }
        const auto tailStart = Clock::now(); for (unsigned q = 0; q < 64; ++q) { engine->process(); }
        const auto tail = Clock::now() - tailStart;
        for (float value : engine->sink(0)) { require(value == 0 && std::fpclassify(value) != FP_SUBNORMAL, "Decay did not clear tiny state"); }
        require(tail < std::max(std::chrono::duration_cast<Clock::duration>(std::chrono::milliseconds(100)), signal * 20), "Silence render time regressed excessively");
        std::cout << kernel << " signal_us=" << std::chrono::duration<double, std::micro>(signal).count()
            << " silence_us=" << std::chrono::duration<double, std::micro>(tail).count() << '\n';
    }
#ifndef NT_SANITIZED
    require(nt::testing::countsAnAllocation(), "Allocation counter positive control failed");
    auto plan = base(); add(plan, "noise", {}, {1}); add(plan, "gain", {0}, {0.5f}); sink(plan, 1);
    auto engine = prepare(plan);
    nt::testing::allocations = 0; nt::testing::countAllocations = true;
    bool accepted = true;
    for (unsigned q = 0; q < 4096; ++q) { accepted = engine->process().accepted && accepted; }
    nt::testing::countAllocations = false;
    require(accepted && nt::testing::allocations == 0, "Audio run rejected or allocated");
    std::cout << "Audio C++ allocations=0; positive control passed\n";
#else
    std::cout << "Allocation audit requires separate unsanitized run\n";
#endif
}
}
int main() {
    try { sourcesAndPorts(); rampsAndEvents(); sampledFilterParameters(); filters(); repeatAndSafety(); decayAndAllocation(); std::cout << "Audio executor tests passed\n"; }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
