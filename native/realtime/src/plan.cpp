#include "nodetool/realtime/plan.h"
#include "plan_schema.h"
#include <algorithm>
#include <cmath>
#include <queue>
#include <stdexcept>

namespace nt::realtime {
namespace {
using Json = nlohmann::json;
// Prepare thread only. Carries one deterministic rejection to the load boundary.
struct Rejected : std::runtime_error {
    Diagnostic diagnostic;
    Rejected(std::string node, std::string reason, std::string detail)
        : std::runtime_error(detail), diagnostic{std::move(node), std::move(reason), std::move(detail)} {}
};
[[noreturn]] void reject(const std::string& node, const std::string& reason, const std::string& detail) {
    throw Rejected(node, reason, detail);
}
std::string identity(const Json& value, const std::string& fallback) {
    if (value.is_object() && value.contains("node") && value["node"].is_string()) {
        return value["node"].get<std::string>();
    }
    return fallback;
}

// The canonical schema uses this bounded subset of JSON Schema. Unknown schema
// keywords fail closed, so extending the schema requires extending this checker.
void shape(const Json& value, const Json& schema, const std::string& parent, const std::string& path) {
    const auto node = identity(value, parent);
    constexpr std::string_view keywords[] = {"$schema", "$id", "title", "description", "type", "const", "enum",
        "oneOf", "properties", "required", "additionalProperties", "items", "minItems", "maxItems",
        "minimum", "maximum", "exclusiveMinimum", "minLength", "maxLength", "pattern"};
    for (auto item = schema.begin(); item != schema.end(); ++item) {
        if (std::find(std::begin(keywords), std::end(keywords), item.key()) == std::end(keywords)) {
            reject(node, "schema_keyword", item.key());
        }
    }
    const auto fail = [&] { reject(node, "structure", path); };
    if (schema.contains("oneOf")) {
        unsigned matches = 0;
        for (const auto& branch : schema["oneOf"]) {
            try { shape(value, branch, node, path); ++matches; }
            catch (const Rejected& error) { if (error.diagnostic.reason != "structure") { throw; } }
        }
        if (matches != 1) { fail(); }
    }
    if (schema.contains("const") && value != schema["const"]) { fail(); }
    if (schema.contains("enum") && std::find(schema["enum"].begin(), schema["enum"].end(), value) == schema["enum"].end()) { fail(); }
    if (schema.contains("type")) {
        const auto type = schema["type"].get<std::string>();
        const bool valid = (type == "object" && value.is_object()) || (type == "array" && value.is_array()) ||
            (type == "string" && value.is_string()) || (type == "boolean" && value.is_boolean()) ||
            (type == "number" && value.is_number()) || (type == "integer" && value.is_number() &&
                std::floor(value.get<double>()) == value.get<double>());
        if (!valid) { fail(); }
    }
    if (value.is_number()) {
        const double number = value.get<double>();
        if (!std::isfinite(number) || (schema.contains("minimum") && number < schema["minimum"].get<double>()) ||
            (schema.contains("maximum") && number > schema["maximum"].get<double>()) ||
            (schema.contains("exclusiveMinimum") && number <= schema["exclusiveMinimum"].get<double>())) { fail(); }
    }
    if (value.is_string()) {
        const auto& string = value.get_ref<const std::string&>();
        if ((schema.contains("minLength") && string.size() < schema["minLength"].get<std::size_t>()) ||
            (schema.contains("maxLength") && string.size() > schema["maxLength"].get<std::size_t>())) { fail(); }
        if (schema.contains("pattern")) {
            if (schema["pattern"] != "^[0-9a-f]+$") { reject(node, "schema_keyword", "unsupported pattern"); }
            if (string.empty() || string.find_first_not_of("0123456789abcdef") != std::string::npos) { fail(); }
        }
    }
    if (value.is_array()) {
        if ((schema.contains("minItems") && value.size() < schema["minItems"].get<std::size_t>()) ||
            (schema.contains("maxItems") && value.size() > schema["maxItems"].get<std::size_t>())) { fail(); }
        if (schema.contains("items")) {
            for (std::size_t i = 0; i < value.size(); ++i) { shape(value[i], schema["items"], node, path + "/" + std::to_string(i)); }
        }
    }
    if (value.is_object()) {
        if (schema.contains("required")) {
            for (const auto& key : schema["required"]) {
                if (!value.contains(key.get<std::string>())) { fail(); }
            }
        }
        for (auto field = value.begin(); field != value.end(); ++field) {
            if (schema.contains("properties") && schema["properties"].contains(field.key())) {
                shape(field.value(), schema["properties"][field.key()], node, path + "/" + field.key());
            } else if (schema.contains("additionalProperties")) {
                const auto& extra = schema["additionalProperties"];
                if (extra.is_boolean()) { if (!extra.get<bool>()) { fail(); } }
                else { shape(field.value(), extra, node, path + "/" + field.key()); }
            }
        }
    }
}

// Prepare thread only. Linear-time cycle check, including disconnected components.
void acyclic(const std::vector<std::vector<std::size_t>>& edges, const std::vector<std::string>& names) {
    std::vector<std::size_t> incoming(edges.size());
    for (const auto& targets : edges) { for (auto target : targets) { ++incoming[target]; } }
    std::queue<std::size_t> ready;
    for (std::size_t i = 0; i < incoming.size(); ++i) { if (incoming[i] == 0) { ready.push(i); } }
    std::size_t visited = 0;
    while (!ready.empty()) {
        const auto index = ready.front(); ready.pop(); ++visited;
        for (auto target : edges[index]) { if (--incoming[target] == 0) { ready.push(target); } }
    }
    if (visited != edges.size()) {
        for (std::size_t i = 0; i < incoming.size(); ++i) {
            if (incoming[i] != 0) { reject(names[i], "cycle", "Cycle has no delayed edge"); }
        }
    }
}

void semantics(const Json& plan, const Registry& registry, const Plan* previous, std::vector<Diagnostic>& warnings) {
    std::unordered_set<unsigned> params;
    std::unordered_map<std::string, unsigned> identities;
    for (const auto& param : plan["params"]) {
        const auto node = param["node"].get<std::string>();
        if ((param["smooth"] == "onePole") != param.contains("timeConstant")) {
            reject(node, "smoothing", "Only onePole smoothing requires a timeConstant");
        }
        const auto key = Json::array({param["node"], param["field"]}).dump();
        const auto slot = param["slot"].get<unsigned>();
        if (!params.insert(slot).second || !identities.emplace(key, slot).second) { reject(node, "duplicate_param", key); }
    }
    if (previous) {
        for (const auto& param : (*previous)["params"]) {
            const auto key = Json::array({param["node"], param["field"]}).dump();
            const auto found = identities.find(key);
            if (found != identities.end() && found->second != param["slot"].get<unsigned>()) {
                reject(param["node"], "param_slot_changed", key);
            }
        }
    }

    const auto registerCount = plan["control"]["registers"].get<unsigned>();
    std::vector<const Json*> ops;
    std::vector<std::string> opNames;
    std::unordered_map<std::string, std::size_t> registers;
    std::unordered_set<std::string> statefulNodes;
    for (const auto* list : {"ops", "stateful"}) {
        const bool stateful = std::string_view(list) == "stateful";
        for (const auto& op : plan["control"][list]) {
            const auto node = op["node"].get<std::string>();
            const auto operation = op["op"].get<std::string>();
            if (!(stateful ? registry.statefulOps : registry.analyticOps).contains(operation)) { reject(node, "unknown_control", operation); }
            if (stateful && !statefulNodes.insert(node).second) { reject(node, "stateful_domain", "Stateful node appears more than once"); }
            const auto output = op["out"].get<unsigned>();
            const auto key = op["domain"].get<std::string>() + ":" + std::to_string(output);
            if (output >= registerCount || !registers.emplace(key, ops.size()).second) { reject(node, "register", "Invalid or multiply-written register"); }
            ops.push_back(&op); opNames.push_back(node);
        }
    }
    for (const auto& param : plan["params"]) {
        if (!param.contains("audioControl")) { continue; }
        if (!param["value"].is_number() && !param["value"].is_boolean()) {
            reject(param["node"], "parameter", "Audio control bindings require scalar parameter values");
        }
        if (!registers.contains("audio:" + std::to_string(param["audioControl"].get<unsigned>()))) {
            reject(param["node"], "register", "Parameter binding has no audio-domain producer");
        }
    }
    std::vector<std::vector<std::size_t>> controlEdges(ops.size());
    for (std::size_t i = 0; i < ops.size(); ++i) {
        for (const auto& input : (*ops[i])["in"]) {
            const auto key = (*ops[i])["domain"].get<std::string>() + ":" + std::to_string(input.get<unsigned>());
            const auto found = registers.find(key);
            if (found == registers.end()) { reject(opNames[i], "register", "Input register has no producer in this domain"); }
            controlEdges[found->second].push_back(i);
        }
    }
    acyclic(controlEdges, opNames);

    std::unordered_map<std::string, const Json*> textures;
    std::unordered_set<std::string> nonTextures;
    for (const auto& slot : plan["slots"]) {
        const auto id = slot["id"].get<std::string>();
        if (textures.contains(id) || nonTextures.contains(id)) { reject(id, "duplicate_slot", id); }
        if (slot["kind"] == "texture") { textures.emplace(id, &slot["output"]); }
        else { nonTextures.insert(id); }
    }
    const auto& passes = plan["render"]["passes"];
    std::unordered_map<std::string, std::size_t> passIndices;
    std::vector<std::string> passNames;
    for (std::size_t i = 0; i < passes.size(); ++i) {
        const auto name = passes[i]["node"].get<std::string>();
        if (textures.contains(name) || nonTextures.contains(name) || !passIndices.emplace(name, i).second) { reject(name, "duplicate_node", name); }
        if (passes[i]["output"]["alpha"] != "premultiplied") { reject(name, "alpha", "Pass outputs must be premultiplied"); }
        textures.emplace(name, &passes[i]["output"]); passNames.push_back(name);
    }
    std::vector<std::vector<std::size_t>> renderEdges(passes.size());
    for (std::size_t i = 0; i < passes.size(); ++i) {
        const auto& pass = passes[i]; const auto& name = passNames[i];
        const auto module = registry.modules.find(pass["module"].get<std::string>());
        if (module == registry.modules.end()) { reject(name, "unknown_module", pass["module"]); }
        if (pass["inputs"].size() != module->second.inputs.size()) { reject(name, "port", "Module input count differs"); }
        if (pass["uniforms"].size() != module->second.uniforms) { reject(name, "uniform", "Module uniform count differs"); }
        for (const auto& reg : pass["uniforms"]) {
            if (!registers.contains("render:" + std::to_string(reg.get<unsigned>()))) { reject(name, "register", "Uniform has no render-domain producer"); }
        }
        for (auto input = pass["inputs"].begin(); input != pass["inputs"].end(); ++input) {
            const auto contract = module->second.inputs.find(input.key());
            if (contract == module->second.inputs.end()) { reject(name, "port", input.key()); }
            const auto source = input.value().get<std::string>();
            const auto texture = textures.find(source);
            if (texture == textures.end()) { reject(name, nonTextures.contains(source) ? "kind" : "missing_source", source); }
            const auto& output = *texture->second;
            if (output["alpha"] != contract->second.alpha) { reject(name, "alpha", "Insert an explicit alpha conversion pass"); }
            if (contract->second.format && output["format"] != *contract->second.format) { reject(name, "format", source); }
            if (output["colorSpace"] != contract->second.colorSpace) { warnings.push_back({name, "color_space", source}); }
            const auto producer = passIndices.find(source);
            if (producer != passIndices.end() && !module->second.delayedInputs) { renderEdges[producer->second].push_back(i); }
        }
        const auto& size = pass["output"]["size"];
        if (size["kind"] == "input" && !pass["inputs"].contains(size["input"].get<std::string>())) { reject(name, "size", "Size rule names an unknown input"); }
    }
    acyclic(renderEdges, passNames);
    for (std::size_t i = 0; i < renderEdges.size(); ++i) {
        for (auto target : renderEdges[i]) { if (i >= target) { reject(passNames[target], "order", "Render passes are not topologically ordered"); } }
    }
    if (plan["render"].contains("present")) {
        const auto source = plan["render"]["present"]["source"].get<std::string>();
        if (!textures.contains(source)) { reject(source, "missing_source", "Presenter requires a texture"); }
    }

    std::unordered_map<unsigned, std::string> buffers;
    for (const auto& buffer : plan["audio"]["buffers"]) {
        if (!buffers.emplace(buffer["id"].get<unsigned>(), buffer["channels"].get<std::string>()).second) { reject("$audio", "duplicate_buffer", "Buffer id reused in declarations"); }
    }
    const auto& nodes = plan["audio"]["nodes"];
    std::unordered_map<std::string, std::size_t> audioIndices;
    std::vector<std::string> audioNames;
    std::vector<std::vector<std::size_t>> audioEdges(nodes.size());
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        const auto name = nodes[i]["node"].get<std::string>();
        if (!audioIndices.emplace(name, i).second) { reject(name, "duplicate_node", name); }
        audioNames.push_back(name);
    }
    const auto layout = [&](const std::string& requested) { return requested == "session" ? plan["session"]["channels"].get<std::string>() : requested; };
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        const auto& node = nodes[i]; const auto& name = audioNames[i];
        const auto kernel = registry.kernels.find(node["kernel"].get<std::string>());
        if (kernel == registry.kernels.end()) { reject(name, "unknown_kernel", node["kernel"]); }
        if (node["in"].size() != kernel->second.inputs.size() || node["out"].size() != kernel->second.outputs.size()) { reject(name, "port", "Kernel port count differs"); }
        for (std::size_t port = 0; port < node["out"].size(); ++port) {
            const auto buffer = buffers.find(node["out"][port].get<unsigned>());
            if (buffer == buffers.end()) { reject(name, "missing_buffer", "Output buffer is undeclared"); }
            if (buffer->second != layout(kernel->second.outputs[port])) { reject(name, "channels", "Output layout differs from kernel contract"); }
        }
        for (std::size_t port = 0; port < node["in"].size(); ++port) {
            const auto& input = node["in"][port];
            const auto producer = audioIndices.find(input["node"].get<std::string>());
            if (producer == audioIndices.end()) { reject(name, "missing_source", input["node"]); }
            const auto& outputs = nodes[producer->second]["out"];
            const auto output = input["output"].get<std::size_t>();
            if (output >= outputs.size()) { reject(name, "port", "Producer output port is out of bounds"); }
            const auto buffer = buffers.find(outputs[output].get<unsigned>());
            if (buffer == buffers.end()) { reject(name, "missing_buffer", "Input buffer is undeclared"); }
            if (buffer->second != layout(kernel->second.inputs[port])) { reject(name, "channels", "Input layout differs from kernel contract"); }
            if (!kernel->second.delayedInputs) { audioEdges[producer->second].push_back(i); }
        }
        for (const auto& param : node["params"]) {
            if (!params.contains(param.get<unsigned>())) { reject(name, "missing_param", "Kernel parameter slot is undeclared"); }
        }
    }
    acyclic(audioEdges, audioNames);
    for (std::size_t i = 0; i < audioEdges.size(); ++i) {
        for (auto target : audioEdges[i]) { if (i >= target) { reject(audioNames[target], "order", "Audio nodes are not topologically ordered"); } }
    }
    std::vector<std::vector<std::size_t>> lastUse(nodes.size());
    std::unordered_map<unsigned, std::pair<std::size_t, std::size_t>> finalWriter;
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        lastUse[i].resize(nodes[i]["out"].size(), i);
        for (std::size_t port = 0; port < nodes[i]["out"].size(); ++port) {
            finalWriter[nodes[i]["out"][port].get<unsigned>()] = {i, port};
        }
    }
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        const bool delayed = registry.kernels.at(nodes[i]["kernel"].get<std::string>()).delayedInputs;
        for (const auto& input : nodes[i]["in"]) {
            auto& end = lastUse[audioIndices.at(input["node"].get<std::string>())][input["output"].get<std::size_t>()];
            end = std::max(end, delayed ? nodes.size() : i);
        }
    }
    for (const auto& sink : plan["audio"]["sinks"]) {
        const auto buffer = buffers.find(sink["buffer"].get<unsigned>());
        if (buffer == buffers.end()) { reject(sink["node"], "missing_buffer", "Sink buffer is undeclared"); }
        if (sink["kind"] == "device" && buffer->second != plan["session"]["channels"].get<std::string>()) { reject(sink["node"], "channels", "Device sink differs from session layout"); }
        const auto writer = finalWriter.find(buffer->first);
        if (writer == finalWriter.end()) { reject(sink["node"], "missing_producer", "Sink buffer is never written"); }
        lastUse[writer->second.first][writer->second.second] = nodes.size();
    }
    std::unordered_map<unsigned, std::pair<std::size_t, std::size_t>> liveBuffers;
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        for (std::size_t port = 0; port < nodes[i]["out"].size(); ++port) {
            const auto id = nodes[i]["out"][port].get<unsigned>();
            const auto previousWriter = liveBuffers.find(id);
            if (previousWriter != liveBuffers.end() &&
                lastUse[previousWriter->second.first][previousWriter->second.second] >= i) {
                reject(audioNames[i], "buffer_liveness", "Output overwrites a buffer that still has consumers");
            }
            liveBuffers[id] = {i, port};
        }
    }
}
}

LoadResult loadPlan(std::string_view source, const Registry& registry, const Plan* previous) {
    LoadResult result;
    try {
        if (source.size() > 64 * 1024 * 1024) { reject("$plan", "size", "Plan exceeds 64 MiB"); }
        auto document = Json::parse(source);
        const auto schema = Json::parse(planSchema);
        shape(document, schema, "$plan", "");
        semantics(document, registry, previous, result.warnings);
        result.plan = std::make_unique<const Plan>(std::move(document));
    } catch (const Rejected& error) {
        result.error = error.diagnostic;
    } catch (const Json::exception& error) {
        result.error = Diagnostic{"$plan", "json", error.what()};
    }
    return result;
}
}
