#include "nodetool/realtime/plan.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
using namespace nt::realtime;
using Json = nlohmann::json;
void require(bool value, const std::string& detail) { if (!value) { throw std::runtime_error(detail); } }
Registry registry() {
    Registry result;
    result.modules.emplace("filters/blur@1", ModuleDefinition{{{"src", {"encoded-sdr", "premultiplied", std::nullopt}}}, 1, false});
    result.kernels.emplace("oscillator", KernelDefinition{{}, {"session"}, false});
    result.kernels.emplace("gain", KernelDefinition{{"session"}, {"session"}, false});
    result.kernels.emplace("block-delay", KernelDefinition{{"session"}, {"session"}, true});
    result.analyticOps = {"constant", "add"};
    result.statefulOps = {"damp"};
    return result;
}
Json fixture(const std::string& name) {
    std::ifstream input(std::string(NT_FIXTURES) + "/" + name + ".json");
    require(input.good(), "Missing fixture: " + name);
    return Json::parse(input);
}
void rejected(const Json& input, const std::string& node, const std::string& reason, const Plan* previous = nullptr) {
    const auto result = loadPlan(input.dump(), registry(), previous);
    require(!result.plan && result.error.has_value(), "Invalid plan accepted: " + reason);
    require(result.error->node == node && result.error->reason == reason,
        "Wrong error: " + result.error->node + "/" + result.error->reason + " expected " + node + "/" + reason);
}
void accepted(const Json& input) {
    const auto result = loadPlan(input.dump(), registry());
    require(result.plan != nullptr, result.error ? result.error->node + ": " + result.error->reason + " " + result.error->detail : "No plan");
}
}

int main() {
    try {
        const auto base = fixture("mixed");
        accepted(base);
        auto binding = base;
        binding["params"][0]["audioControl"] = 0;
        rejected(binding, "gain", "register");
        auto producer = binding["control"]["ops"][0];
        producer["node"] = "audio-constant"; producer["domain"] = "audio";
        binding["control"]["ops"].push_back(producer);
        accepted(binding);
        binding["params"][0]["audioControl"] = 1;
        rejected(binding, "gain", "register");
        binding["params"][0]["audioControl"] = 0;
        binding["params"][0]["value"] = {1, 2};
        rejected(binding, "gain", "parameter");
        const auto active = loadPlan(base.dump(), registry());
        rejected(fixture("invalid-cycle"), "gain", "cycle");
        rejected(fixture("invalid-kind"), "blur", "kind");
        rejected(fixture("invalid-channel"), "gain", "channels");
        rejected(fixture("invalid-kernel"), "gain", "unknown_kernel");
        auto candidate = base;
        candidate["render"]["passes"][0]["module"] = "unknown";
        rejected(candidate, "blur", "unknown_module", active.plan.get());
        require(*active.plan == base, "Rejected load changed the active description");
        candidate = base; candidate["schemaVersion"] = 2;
        rejected(candidate, "$plan", "structure");
        candidate = base; candidate["audio"]["nodes"][1]["in"][0] = 0;
        rejected(candidate, "gain", "structure");
        candidate = base; candidate["audio"]["nodes"][1]["extra"] = true;
        rejected(candidate, "gain", "structure");
        candidate = base; candidate["audio"]["nodes"][1]["out"][0] = 55;
        rejected(candidate, "gain", "missing_buffer");
        candidate = base; candidate["audio"]["nodes"][1]["out"][0] = 0;
        candidate["audio"]["sinks"][0]["buffer"] = 0;
        rejected(candidate, "gain", "buffer_liveness");
        candidate = base; candidate["audio"]["buffers"].push_back({{"id", 2}, {"channels", "stereo"}});
        candidate["audio"]["sinks"][0]["buffer"] = 2;
        rejected(candidate, "audio-out", "missing_producer");
        candidate = base; candidate["audio"]["nodes"][1]["params"][0] = 55;
        rejected(candidate, "gain", "missing_param");
        candidate = base; candidate["audio"]["nodes"][1]["in"][0]["output"] = 55;
        rejected(candidate, "gain", "port");
        candidate = base; std::swap(candidate["audio"]["nodes"][0], candidate["audio"]["nodes"][1]);
        rejected(candidate, "gain", "order");
        candidate = base; candidate["audio"]["nodes"][1]["node"] = "osc";
        rejected(candidate, "osc", "duplicate_node");
        candidate = base; candidate["params"][0]["slot"] = 3; candidate["audio"]["nodes"][1]["params"][0] = 3;
        rejected(candidate, "gain", "param_slot_changed", active.plan.get());
        candidate = base; candidate["slots"][0]["output"]["alpha"] = "straight";
        rejected(candidate, "blur", "alpha");
        candidate = base; candidate["slots"][0]["output"]["colorSpace"] = "linear";
        const auto warning = loadPlan(candidate.dump(), registry());
        require(warning.plan && warning.warnings.size() == 1 && warning.warnings[0].reason == "color_space", "Color mismatch must warn");
        candidate = base; candidate["control"]["ops"][0]["in"] = {0};
        rejected(candidate, "constant", "cycle");
        candidate = base; candidate["control"]["ops"][0]["out"] = 9;
        rejected(candidate, "constant", "register");
        candidate = base; candidate["render"]["passes"][0]["inputs"]["src"] = "blur";
        rejected(candidate, "blur", "cycle");
        candidate = base;
        candidate["audio"]["nodes"][0]["kernel"] = "block-delay";
        candidate["audio"]["nodes"][0]["in"] = Json::array({{{"node", "gain"}, {"output", 0}}});
        accepted(candidate); // The declared block-delay breaks this cycle.

        // Reusing an expired buffer remains valid when logical edges retain
        // their producer identity independently of the physical buffer id.
        candidate = base;
        auto third = candidate["audio"]["nodes"][1];
        third["node"] = "gain2"; third["in"][0]["node"] = "gain"; third["out"][0] = 0;
        candidate["audio"]["nodes"].push_back(third);
        candidate["audio"]["sinks"][0]["buffer"] = 0;
        accepted(candidate);

        // Large chain: graph checking must not recurse or rescan every prior node.
        candidate = base;
        auto& passes = candidate["render"]["passes"];
        const auto prototype = passes[0]; passes.clear();
        for (unsigned index = 0; index < 10000; ++index) {
            auto pass = prototype;
            pass["node"] = "p" + std::to_string(index);
            pass["inputs"]["src"] = index == 0 ? "t0" : "p" + std::to_string(index - 1);
            passes.push_back(std::move(pass));
        }
        candidate["render"]["present"]["source"] = "p9999";
        accepted(candidate);
        passes[0]["inputs"]["src"] = "p9999";
        rejected(candidate, "p0", "cycle");
        require(loadPlan("{", registry()).error.has_value(), "Malformed JSON accepted");
        std::cout << "Plan schema and semantic fixtures passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
