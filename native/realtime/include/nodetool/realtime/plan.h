#pragma once
#include <nlohmann/json.hpp>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nt::realtime {
// Prepare thread values. Registries describe the modules available in this host.
struct TextureInput {
    std::string colorSpace;
    std::string alpha;
    std::optional<std::string> format;
    bool optional = false;
};
struct ModuleDefinition {
    std::unordered_map<std::string, TextureInput> inputs;
    std::size_t uniforms = 0;
    bool delayedInputs = false;
};
struct KernelDefinition {
    // Layouts are mono, stereo or session. Port counts are explicit.
    std::vector<std::string> inputs;
    std::vector<std::string> outputs;
    bool delayedInputs = false;
};
struct Registry {
    std::unordered_map<std::string, ModuleDefinition> modules;
    std::unordered_map<std::string, KernelDefinition> kernels;
    std::unordered_set<std::string> analyticOps;
    std::unordered_set<std::string> statefulOps;
};
struct Diagnostic {
    std::string node;
    std::string reason;
    std::string detail;
};

// Constructed on the prepare thread. The const document owns every string and
// array, and may be moved to another owner. Executors lower it before ticking.
// JSON access is never part of the render/quantum execution path.
using Plan = nlohmann::json;
struct LoadResult {
    std::unique_ptr<const Plan> plan;
    std::optional<Diagnostic> error;
    std::vector<Diagnostic> warnings;
};

// No active-plan mutation: a rejection returns no candidate. previous is
// borrowed only for this call to validate stable parameter identities.
LoadResult loadPlan(std::string_view json, const Registry& registry, const Plan* previous = nullptr);
}
