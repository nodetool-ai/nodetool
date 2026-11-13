#include "nodetool/realtime/render.h"
#include "platform/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif
#include <algorithm>
#include <array>
#include <iostream>
#include <stdexcept>

namespace {
using namespace nt::realtime;
void require(bool value, const char* message) { if (!value) { throw std::runtime_error(message); } }
Plan texture() { return {{"format", "rgba8unorm"}, {"size", {{"kind", "session"}}}, {"colorSpace", "linear"}, {"alpha", "premultiplied"}}; }
Plan base() {
    return {{"schemaVersion", 1}, {"revision", 1},
        {"session", {{"sampleRate", 48000}, {"quantum", 128}, {"channels", "stereo"}, {"width", 4}, {"height", 4}, {"seed", 1}}},
        {"params", Plan::array()}, {"slots", Plan::array()},
        {"control", {{"registers", 1}, {"ops", {{{"node", "constant"}, {"op", "constant"}, {"domain", "render"}, {"out", 0}, {"in", Plan::array()}, {"values", {1}}}}}, {"stateful", Plan::array()}}},
        {"render", {{"passes", Plan::array()}}},
        {"audio", {{"buffers", Plan::array()}, {"nodes", Plan::array()}, {"sinks", Plan::array()}}}};
}
Registry registry() {
    Registry value;
    value.modules.emplace("solid", ModuleDefinition{{}, 1});
    value.modules.emplace("copy", ModuleDefinition{{{"src", {"linear", "premultiplied", {}}}}, 1});
    value.modules.emplace("mix", ModuleDefinition{{{"a", {"linear", "premultiplied", {}}}, {"b", {"linear", "premultiplied", {}}}}, 1});
    return value;
}
void add(Plan& plan, const std::string& name, const char* module, Plan inputs = Plan::object(), bool retained = true) {
    plan["render"]["passes"].push_back({{"node", name}, {"module", module}, {"inputs", inputs}, {"uniforms", {0}},
        {"retention", retained ? "retained" : "volatile"}, {"output", texture()}});
    plan["render"]["present"] = {{"source", name}, {"colorSpace", "linear"}};
}
std::unique_ptr<RenderSchedule> prepare(const Plan& plan, std::size_t budget = 512ull * 1024 * 1024) {
    auto prepared = RenderSchedule::prepare(plan, registry(), {budget});
    if (!prepared.schedule) { throw std::runtime_error(prepared.error->node + ": " + prepared.error->detail); }
    return std::move(prepared.schedule);
}
void rejected(const Plan& plan, const char* reason, std::size_t budget = 512ull * 1024 * 1024) {
    auto result = RenderSchedule::prepare(plan, registry(), {budget});
    require(!result.schedule && result.error && result.error->reason == reason, "Wrong render-plan rejection");
}
std::array<ControlValue, 1> values(double value = 1) { return {{{{value, 0, 0, 0}, 1}}}; }

void retentionAndPool() {
    auto plan = base(); add(plan, "still", "solid"); add(plan, "moving", "solid", Plan::object(), false);
    add(plan, "filtered", "copy", {{"src", "moving"}}, false);
    add(plan, "mixed", "mix", {{"a", "still"}, {"b", "filtered"}}, false);
    auto engine = prepare(plan);
    auto registers = values();
    std::vector<double> pixels(engine->textures().size(), -1);
    std::array<unsigned, 4> runs{};
    unsigned retained = NO_RENDER_TEXTURE;
    for (unsigned frame = 0; frame < 101; ++frame) {
        const auto result = engine->beginFrame({registers, {}, true});
        require(result.accepted && result.present, "Running volatile chain did not present");
        for (const auto& command : result.commands) {
            ++runs[command.pass];
            double pixel = command.uniforms[0].lanes[0];
            for (auto source : command.inputs) { pixel += pixels[source]; }
            pixels[command.output] = pixel;
            if (command.pass == 0) { retained = command.output; }
            else { require(command.output != retained, "Volatile pool overwrote retained output"); }
        }
        require(pixels[retained] == 1 && pixels[result.source] == 4, "Retained pixels changed");
        engine->completeFrame(true);
    }
    require(runs[0] == 1 && runs[1] == 101 && runs[2] == 101 && runs[3] == 101, "Retention execution counts differ");
    require(engine->textures().size() == 3, "Volatile liveness pool did not reuse storage");
    auto idle = engine->beginFrame({registers, {}, false});
    require(idle.accepted && !idle.present && idle.commands.empty(), "Paused graph did GPU work");
    registers[0].lanes[0] = 2;
    auto changed = engine->beginFrame({registers, {}, false});
    require(changed.accepted && changed.commands.size() == 4, "Paused edit did not reconstruct volatile outputs");
    require(!engine->beginFrame({registers, {}, false}).accepted, "Outstanding frame was overwritten");
    engine->completeFrame(true);
}

void dirtyAndFailure() {
    auto plan = base(); plan["slots"].push_back({{"id", "image"}, {"kind", "texture"}, {"source", "asset"}, {"output", texture()}});
    add(plan, "first", "copy", {{"src", "image"}}); add(plan, "second", "copy", {{"src", "first"}});
    auto engine = prepare(plan); auto registers = values(); std::array<std::uint64_t, 1> versions{0};
    require(engine->beginFrame({registers, versions}).commands.size() == 2, "Initial passes missing"); engine->completeFrame(true);
    auto exposed = engine->beginFrame({registers, versions, false, true});
    require(exposed.present && exposed.commands.empty(), "Exposure rerendered retained chain"); engine->completeFrame(true);
    ++versions[0];
    require(engine->beginFrame({registers, versions}).commands.size() == 2, "Slot version did not dirty descendants"); engine->completeFrame(true);
    registers[0].lanes[0] = 3;
    require(engine->beginFrame({registers, versions}).commands.size() == 2, "Uniform value did not dirty passes");
    engine->completeFrame(false);
    require(engine->beginFrame({registers, versions}).commands.size() == 2, "Failed submission kept outputs valid"); engine->completeFrame(true);
    registers[0].width = 5;
    require(!engine->beginFrame({registers, versions}).accepted, "Invalid uniform width accepted");
    registers[0].width = 1;
    require(!engine->beginFrame({registers, versions}).present, "Rejected snapshot changed cache state");
    plan["session"]["width"] = 8;
    auto resized = prepare(plan);
    require(resized->passes()[1].output.width == 8 && resized->beginFrame({registers, versions}).commands.size() == 2, "Resized plan reused old outputs");
}

void budgetAndValidation() {
    auto plan = base(); add(plan, "a", "solid"); add(plan, "b", "copy", {{"src", "a"}}); add(plan, "c", "copy", {{"src", "b"}});
    auto engine = prepare(plan, 128); auto registers = values();
    require(engine->textureBytes() == 128 && engine->textures().size() == 2, "Budget did not cap retained storage");
    auto frame = engine->beginFrame({registers, {}});
    require(frame.accepted && frame.commands.size() == 3 && frame.evictions == 1, "LRU failed to evict dead retained output");
    require(frame.commands[0].output == frame.commands[2].output && frame.commands[1].output != frame.commands[2].output, "LRU overwrote a live input");
    engine->completeFrame(false);
    require(engine->beginFrame({registers, {}}).accepted, "Failed frame corrupted LRU lists"); engine->completeFrame(true);
    rejected(plan, "budget", 127);
    plan["render"]["passes"][0]["retention"] = "volatile"; rejected(plan, "retention");
    plan["render"]["passes"][1]["retention"] = "volatile"; plan["render"]["passes"][2]["retention"] = "volatile";
    engine = prepare(plan, 128);
    require(engine->textures().size() == 2, "Volatile chain did not fit liveness budget");
    plan["render"]["passes"][1]["output"]["size"] = {{"kind", "input"}, {"input", "src"}, {"scale", 0.5}};
    engine = prepare(plan); require(engine->passes()[1].output.width == 2, "Input-relative size incorrect");
    plan["render"]["passes"][1]["output"]["size"]["scale"] = 0.01; rejected(plan, "render_plan");
}

void largeAndAllocation() {
    auto plan = base(); add(plan, "p0", "solid", Plan::object(), false);
    for (unsigned i = 1; i < 2000; ++i) { add(plan, "p" + std::to_string(i), "copy", {{"src", "p" + std::to_string(i - 1)}}, false); }
    auto engine = prepare(plan, 128); auto registers = values();
    require(engine->textures().size() == 2, "Large graph used an unbounded texture pool");
#ifndef NT_SANITIZED
    require(nt::testing::countsAnAllocation(), "Allocation counter positive control failed");
    nt::testing::allocations = 0; nt::testing::countAllocations = true;
#endif
    const auto frame = engine->beginFrame({registers, {}, true}); engine->completeFrame(true);
#ifndef NT_SANITIZED
    nt::testing::countAllocations = false;
    require(nt::testing::allocations == 0, "Render scheduling allocated during frame");
#endif
    require(frame.accepted && frame.commands.size() == 2000, "Large graph did not schedule every pass");
}
}
int main() {
    try { retentionAndPool(); dirtyAndFailure(); budgetAndValidation(); largeAndAllocation(); std::cout << "Render scheduling tests passed\n"; }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
