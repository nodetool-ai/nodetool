#include "nodetool/realtime/offline_gpu.h"
#include <array>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <thread>

namespace {
using namespace nt::realtime;
void require(bool value, const char* reason) { if (!value) { throw std::runtime_error(reason); } }
Plan output(bool straight = false) {
    return {{"format", "rgba8unorm"}, {"size", {{"kind", "session"}}}, {"colorSpace", "linear"}, {"alpha", straight ? "straight" : "premultiplied"}};
}
// Test-thread-owned fixtures, with no GPU resources until prepare().
struct Fixture {
    Plan plan = {{"schemaVersion", 1}, {"revision", 1},
        {"session", {{"sampleRate", 48000}, {"quantum", 128}, {"channels", "stereo"}, {"width", 4}, {"height", 4}, {"seed", 1}}},
        {"params", Plan::array()}, {"slots", Plan::array()},
        {"control", {{"registers", 0}, {"ops", Plan::array()}, {"stateful", Plan::array()}}},
        {"render", {{"passes", Plan::array()}}}, {"audio", {{"buffers", Plan::array()}, {"nodes", Plan::array()}, {"sinks", Plan::array()}}}};
    Registry registry;
    std::vector<ControlValue> values;
    std::vector<std::uint64_t> versions;
    void slot(const std::string& id, bool straight = false) {
        plan["slots"].push_back({{"id", id}, {"kind", "texture"}, {"source", "fixture"}, {"output", output(straight)}}); versions.push_back(0);
    }
    void add(const Plan& catalog, const std::string& key, Plan inputs = Plan::object(), Plan overrides = Plan::object()) {
        const auto& module = catalog["modules"][key];
        const auto name = "pass-" + std::to_string(plan["render"]["passes"].size());
        auto params = module.value("paramDefaults", Plan::object()); params.update(overrides);
        Plan uniforms = Plan::array(); ModuleDefinition definition;
        for (auto input = inputs.begin(); input != inputs.end(); ++input) {
            definition.inputs.emplace(input.key(), TextureInput{"linear", module["io"]["inputs"][input.key()].value("alpha", "premultiplied"), {}});
        }
        if (module.contains("uniform") && module["uniform"].is_object()) {
            for (const auto& field : module["uniform"]["fields"]) {
                auto value = params.at(field["name"].get<std::string>());
                if (field.contains("index")) { value = value.at(field["index"].get<unsigned>()); }
                if (!value.is_array()) { value = Plan::array({value}); }
                ControlValue control{}; control.width = static_cast<unsigned>(value.size());
                for (unsigned i = 0; i < control.width; ++i) { control.lanes[i] = value[i]; }
                const auto reg = static_cast<unsigned>(values.size()); values.push_back(control); uniforms.push_back(reg);
                plan["control"]["ops"].push_back({{"node", "value-" + std::to_string(reg)}, {"op", "constant"}, {"domain", "render"}, {"out", reg}, {"in", Plan::array()}, {"values", value}});
            }
        }
        definition.uniforms = uniforms.size(); registry.modules.insert_or_assign(key, std::move(definition));
        plan["control"]["registers"] = values.size();
        plan["render"]["passes"].push_back({{"node", name}, {"module", key}, {"inputs", inputs}, {"uniforms", uniforms}, {"retention", "retained"}, {"output", output()}});
        plan["render"]["present"] = {{"source", name}, {"colorSpace", "linear"}};
    }
    std::unique_ptr<OfflineGpu> prepare(const Plan& catalog, OfflineGpuOptions options = {}) const {
        auto result = OfflineGpu::prepare(plan, registry, catalog.dump(), options);
        if (!result.gpu) { throw std::runtime_error(result.error->node + ": " + result.error->detail); }
        return std::move(result.gpu);
    }
};
std::vector<std::byte> read(OfflineGpu& gpu, std::uint64_t expectedFrame, bool rejectShortBuffer = false) {
    std::vector<std::byte> pixels(gpu.readbackBytes()); std::uint64_t frame = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
        require(gpu.poll(), "GPU failed while polling readback");
        if (rejectShortBuffer) {
            require(!gpu.takeReadback(std::span(pixels).first(pixels.size() - 1), frame), "Short readback buffer accepted");
        }
        if (gpu.takeReadback(pixels, frame)) { require(frame == expectedFrame, "Readback order changed"); return pixels; }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    throw std::runtime_error("Readback did not complete within test deadline");
}
void golden(const std::vector<std::byte>& pixels, std::array<unsigned, 4> expected, unsigned width = 4, unsigned height = 4) {
    require(pixels.size() == width * height * 4, "Unexpected readback dimensions");
    for (unsigned i = 0; i < pixels.size(); ++i) {
        const auto actual = std::to_integer<int>(pixels[i]);
        if (std::abs(actual - static_cast<int>(expected[i % 4])) > 1) {
            throw std::runtime_error("Shader-chain pixel byte " + std::to_string(i) + ": got " +
                std::to_string(actual) + ", expected " + std::to_string(expected[i % 4]));
        }
    }
}
void retainedPixelsAndResize(const Plan& catalog) {
    Fixture fixture;
    fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0.25, 0, 0, 1}}});
    fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0, 0.25, 0, 1}}});
    fixture.add(catalog, "color.invert@1", {{"source", "pass-1"}});
    fixture.add(catalog, "color.invert@1", {{"source", "pass-2"}});
    fixture.add(catalog, "mixer.add@1", {{"source", "pass-0"}, {"over", "pass-3"}});
    for (unsigned pass = 1; pass < 5; ++pass) { fixture.plan["render"]["passes"][pass]["retention"] = "volatile"; }
    auto prepared = RenderSchedule::prepare(fixture.plan, fixture.registry);
    require(bool(prepared.schedule), "Retention schedule preparation failed");
    auto& schedule = *prepared.schedule;
    require(schedule.textures().size() == 3, "Volatile GPU fixture did not reuse two pool textures");
    auto gpu = fixture.prepare(catalog);
    const auto moving = fixture.plan["render"]["passes"][1]["uniforms"][0].get<unsigned>();
    unsigned retained = NO_RENDER_TEXTURE;
    for (unsigned frame = 0; frame < 101; ++frame) {
        fixture.values[moving].lanes[1] = frame % 2 == 0 ? 0.25 : 0.5;
        const RenderFrameInput input{fixture.values, fixture.versions, true, true};
        const auto planned = schedule.beginFrame(input);
        require(planned.accepted && planned.present, "Retention frame was not scheduled");
        require(planned.commands.size() == (frame == 0 ? 5u : 4u), "Clean retained pass was scheduled again");
        for (const auto& command : planned.commands) {
            if (command.pass == 0) {
                require(frame == 0, "Clean retained producer ran after its initial frame");
                retained = command.output;
            }
            else { require(command.output != retained, "Volatile GPU fixture overwrote retained pool storage"); }
        }
        schedule.completeFrame(true);
        const auto rendered = gpu->render(input, true);
        require(rendered.accepted && rendered.presented && rendered.readbackQueued, "Retention GPU frame rejected");
        const auto pixels = read(*gpu, frame);
        const std::array<unsigned, 4> expected{64, frame % 2 == 0 ? 64u : 128u, 0, 255};
        golden(pixels, expected);
        if (frame == 100) {
            auto corrupted = pixels; corrupted[0] = std::byte{0};
            bool rejected = false;
            try { golden(corrupted, expected); } catch (const std::runtime_error&) { rejected = true; }
            require(rejected, "Retention golden accepted corrupted retained pixels");
        }
    }
    fixture.plan["session"]["width"] = 8; fixture.plan["session"]["height"] = 8;
    auto resized = fixture.prepare(catalog);
    require(resized->readbackBytes() == 8 * 8 * 4, "Resize retained the old readback dimensions");
    require(resized->render({fixture.values, fixture.versions, true}, true).readbackQueued, "Resized GPU frame rejected");
    golden(read(*resized, 0), {64, 64, 0, 255}, 8, 8);
}
void cachePressure(const Plan& catalog) {
    Fixture fixture;
    fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0.25, 0.25, 0, 1}}});
    fixture.add(catalog, "color.invert@1", {{"source", "pass-0"}});
    fixture.add(catalog, "color.invert@1", {{"source", "pass-1"}});
    constexpr std::size_t reserved = 4 * 4 * 4 + 4;
    constexpr std::size_t budget = reserved + 2 * 4 * 4 * 4;
    auto prepared = RenderSchedule::prepare(fixture.plan, fixture.registry, {budget, reserved});
    require(bool(prepared.schedule), "Cache-pressure schedule preparation failed");
    auto& schedule = *prepared.schedule;
    require(schedule.textures().size() == 2 && schedule.textureBytes() == budget,
        "Cache-pressure fixture did not enforce the two-texture budget");
    auto rejected = OfflineGpu::prepare(fixture.plan, fixture.registry, catalog.dump(), {true, budget - 1});
    require(!rejected.gpu && rejected.error && rejected.error->reason == "budget", "Below-minimum GPU budget accepted");
    auto gpu = fixture.prepare(catalog, {true, budget});
    for (unsigned frame = 0; frame < 6; ++frame) {
        fixture.values[0].lanes[0] = frame % 2 == 0 ? 0.25 : 0.75;
        const RenderFrameInput input{fixture.values, fixture.versions, true, true};
        const auto planned = schedule.beginFrame(input);
        require(planned.accepted && planned.commands.size() == 3 && planned.evictions > 0,
            "Cache pressure did not reconstruct evicted retained outputs");
        require(planned.commands[0].output == planned.commands[2].output &&
            planned.commands[1].output != planned.commands[2].output, "Cache pressure overwrote a live input");
        schedule.completeFrame(true);
        require(gpu->render(input, true).readbackQueued, "Cache-pressure GPU frame rejected");
        golden(read(*gpu, frame), {frame % 2 == 0 ? 64u : 191u, 64, 0, 255});
    }
}
void readbackRecovery(const Plan& catalog) {
    Fixture fixture;
    fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0, 0, 0, 1}}});
    auto gpu = fixture.prepare(catalog);
    constexpr std::array<double, 6> colors{0, 0.25, 0.5, 0.75, 1, 0};
    constexpr std::array<unsigned, 6> bytes{0, 64, 128, 191, 255, 0};
    for (unsigned frame = 0; frame < 3; ++frame) {
        fixture.values[0].lanes[0] = colors[frame];
        require(gpu->render({fixture.values, fixture.versions}, true).readbackQueued, "Initial ring capture rejected");
    }
    fixture.values[0].lanes[0] = colors[3];
    require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Saturated ring accepted another capture");
    for (unsigned frame = 0; frame < 6; ++frame) {
        golden(read(*gpu, frame, frame == 0), {bytes[frame], 0, 0, 255});
        if (frame < 3) {
            fixture.values[0].lanes[0] = colors[frame + 3];
            require(gpu->render({fixture.values, fixture.versions}, true).readbackQueued, "Freed ring slot did not accept a capture");
        }
    }
    std::vector<std::byte> pixels(gpu->readbackBytes()); std::uint64_t frame = 0;
    require(!gpu->takeReadback(pixels, frame) && gpu->healthy(), "Drained ring returned a capture or failed");
    for (unsigned pending = 0; pending < 3; ++pending) {
        require(gpu->render({fixture.values, fixture.versions}, true).readbackQueued, "Pending teardown ring did not fill");
    }
    require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Pending teardown ring did not apply backpressure");
}
void chains(const Plan& catalog) {
    for (unsigned chain = 0; chain < 4; ++chain) {
        Fixture fixture; fixture.slot("unrelated"); // Must not block an independent present chain.
        fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0.25, 0.5, 0.75, 1}}});
        fixture.add(catalog, "color.invert@1", {{"source", "pass-0"}});
        if (chain == 1) { fixture.add(catalog, "color.invert@1", {{"source", "pass-1"}}); }
        if (chain == 2) { fixture.add(catalog, "color.brightnessContrast@1", {{"source", "pass-1"}}, {{"brightness", 0}, {"contrast", 1}}); }
        if (chain == 3) { fixture.add(catalog, "color.invert@1", {{"source", "pass-1"}}, {{"amount", 0}}); }
        auto gpu = fixture.prepare(catalog);
        for (unsigned i = 0; i < 3; ++i) { require(gpu->render({fixture.values, fixture.versions}, true).readbackQueued, "Readback submission rejected"); }
        require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Full readback ring did not apply backpressure");
        for (unsigned i = 0; i < 3; ++i) {
            try {
                golden(read(*gpu, i), chain == 1 ? std::array<unsigned, 4>{64, 128, 191, 255} : std::array<unsigned, 4>{191, 128, 64, 255});
            }
            catch (const std::exception& error) { throw std::runtime_error("Chain " + std::to_string(chain) + ", frame " + std::to_string(i) + ": " + error.what()); }
        }
        const auto idle = gpu->render({fixture.values, fixture.versions}); require(idle.accepted && !idle.presented, "Unchanged graph presented again");
        fixture.values[0].width = 1;
        require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Invalid vector width accepted");
        fixture.values[0].width = 4;
        require(gpu->render({fixture.values, fixture.versions}, true).accepted, "Valid retry after bad uniform failed"); read(*gpu, 3);
    }
}
void computeAndRejections(const Plan& catalog) {
    Fixture fixture; fixture.slot("source", true); fixture.add(catalog, "alpha.straightToPremul@1", {{"source", "source"}});
    auto gpu = fixture.prepare(catalog);
    require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Unuploaded reachable slot accepted");
    std::vector<std::byte> pixels(64);
    for (unsigned i = 0; i < 16; ++i) { pixels[i * 4] = std::byte{255}; pixels[i * 4 + 3] = std::byte{128}; }
    require(!gpu->uploadSlot(0, std::span(pixels).first(4)), "Short slot upload accepted");
    require(gpu->uploadSlot(0, pixels), "Slot upload rejected"); ++fixture.versions[0];
    require(gpu->render({fixture.values, fixture.versions}, true).accepted, "Compute frame rejected"); golden(read(*gpu, 0), {128, 0, 0, 128});
    auto bad = catalog; bad["modules"]["alpha.straightToPremul@1"]["workgroupSize"][0] = 4294967295u;
    auto result = OfflineGpu::prepare(fixture.plan, fixture.registry, bad.dump());
    require(!result.gpu && result.error->node == "pass-0", "Bad compute metadata not rejected at node");
    bad = catalog; bad["modules"]["alpha.straightToPremul@1"]["wgsl"] = "invalid WGSL";
    result = OfflineGpu::prepare(fixture.plan, fixture.registry, bad.dump());
    require(!result.gpu && result.error->node == "pass-0", "Bad shader diagnostic lost graph-node identity");
    result = OfflineGpu::prepare(fixture.plan, fixture.registry, catalog.dump(), {true, 1});
    require(!result.gpu, "Insufficient texture budget accepted");
    // One outstanding map complements the saturated-ring teardown case.
    require(gpu->render({fixture.values, fixture.versions}, true).accepted, "Pending teardown fixture rejected");
}
}
int main() {
    try {
        std::ifstream input(NT_GPU_CATALOG); require(bool(input), "Export the GPU catalog before testing"); Plan catalog; input >> catalog;
        chains(catalog); retainedPixelsAndResize(catalog); cachePressure(catalog); readbackRecovery(catalog); computeAndRejections(catalog);
        std::cout << "Offline software-adapter GPU tests passed\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
