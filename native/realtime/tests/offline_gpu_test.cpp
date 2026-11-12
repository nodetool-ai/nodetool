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
    std::unique_ptr<OfflineGpu> prepare(const Plan& catalog) const {
        auto result = OfflineGpu::prepare(plan, registry, catalog.dump());
        if (!result.gpu) { throw std::runtime_error(result.error->node + ": " + result.error->detail); }
        return std::move(result.gpu);
    }
};
std::vector<std::byte> read(OfflineGpu& gpu, std::uint64_t expectedFrame) {
    std::vector<std::byte> pixels(gpu.readbackBytes()); std::uint64_t frame = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
        require(gpu.poll(), "GPU failed while polling readback");
        if (gpu.takeReadback(pixels, frame)) { require(frame == expectedFrame, "Readback order changed"); return pixels; }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    throw std::runtime_error("Readback did not complete within test deadline");
}
void golden(const std::vector<std::byte>& pixels, std::array<unsigned, 4> expected) {
    require(pixels.size() == 64, "Unexpected readback dimensions");
    for (unsigned i = 0; i < pixels.size(); ++i) {
        const auto actual = std::to_integer<int>(pixels[i]);
        require(std::abs(actual - static_cast<int>(expected[i % 4])) <= 1, "Shader-chain pixel differs from reference");
    }
}
void chains(const Plan& catalog) {
    for (unsigned chain = 0; chain < 3; ++chain) {
        Fixture fixture; fixture.slot("unrelated"); // Must not block an independent present chain.
        fixture.add(catalog, "sources.solid@1", Plan::object(), {{"color", {0.25, 0.5, 0.75, 1}}});
        fixture.add(catalog, "color.invert@1", {{"source", "pass-0"}});
        if (chain == 1) { fixture.add(catalog, "color.invert@1", {{"source", "pass-1"}}); }
        if (chain == 2) { fixture.add(catalog, "color.brightnessContrast@1", {{"source", "pass-1"}}, {{"brightness", 0}, {"contrast", 1}}); }
        auto gpu = fixture.prepare(catalog);
        for (unsigned i = 0; i < 3; ++i) { require(gpu->render({fixture.values, fixture.versions}, true).readbackQueued, "Readback submission rejected"); }
        require(!gpu->render({fixture.values, fixture.versions}, true).accepted, "Full readback ring did not apply backpressure");
        for (unsigned i = 0; i < 3; ++i) { golden(read(*gpu, i), chain == 1 ? std::array<unsigned, 4>{64, 128, 191, 255} : std::array<unsigned, 4>{191, 128, 64, 255}); }
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
    // Destroy with an outstanding map callback. Sanitizers must cover this later.
    require(gpu->render({fixture.values, fixture.versions}, true).accepted, "Pending teardown fixture rejected");
}
}
int main() {
    try {
        std::ifstream input(NT_GPU_CATALOG); require(bool(input), "Export the GPU catalog before testing"); Plan catalog; input >> catalog;
        chains(catalog); computeAndRejections(catalog); std::cout << "Offline software-adapter GPU tests passed\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
