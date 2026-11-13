#include "nodetool/realtime/render.h"
#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <tuple>

namespace nt::realtime {
namespace {
constexpr unsigned none = NO_RENDER_TEXTURE;
// Render thread only after preparation. Input IDs address slots, then passes.
struct Pass {
    std::vector<unsigned> sources;
    std::vector<unsigned> registers;
    std::vector<unsigned> inputs;
    std::vector<std::uint64_t> seen;
    std::vector<ControlValue> uniforms;
    unsigned group = 0;
    unsigned texture = none;
    unsigned lastUse = 0;
    std::uint64_t version = 0;
    bool reachable = false;
    bool valid = false;
};
// Render thread only. Intrusive lists avoid allocation and stale heap entries.
struct Cell { unsigned owner = none; unsigned previous = none; unsigned next = none; unsigned group = none; };
struct Group {
    RenderTextureSpec spec;
    bool retained = false;
    unsigned head = none;
    unsigned tail = none;
    unsigned peak = 0;
    unsigned total = 0;
    std::vector<unsigned> candidates;
};
bool equal(const ControlValue& a, const ControlValue& b) noexcept {
    return a.width == b.width && std::equal(a.lanes.begin(), a.lanes.begin() + a.width, b.lanes.begin());
}
RenderColorSpace colorSpace(const Plan& value) {
    if (value == "srgb") { return RenderColorSpace::srgb; }
    if (value == "encoded-sdr") { return RenderColorSpace::encodedSdr; }
    return value == "data" ? RenderColorSpace::data : RenderColorSpace::linear;
}
RenderTextureSpec dimensions(const Plan& output, unsigned width, unsigned height,
    const RenderTextureSpec* input = nullptr) {
    RenderTextureSpec result{width, height, output["format"] == "rgba16float" ? RenderFormat::rgba16float : RenderFormat::rgba8unorm};
    const auto& size = output["size"];
    if (size["kind"] == "fixed") { result.width = size["width"]; result.height = size["height"]; }
    if (size["kind"] == "input") {
        if (!input) { throw std::runtime_error("Input-relative dimensions need a bound input"); }
        const double scale = size["scale"];
        const double w = std::floor(input->width * scale), h = std::floor(input->height * scale);
        if (w < 1 || h < 1 || w > 16384 || h > 16384) { throw std::runtime_error("Scaled dimensions exceed texture limits"); }
        result.width = static_cast<unsigned>(w); result.height = static_cast<unsigned>(h);
    }
    return result;
}
}
// Exclusive render-thread ownership after preparation. No retained JSON data.
struct RenderSchedule::Storage {
    std::vector<RenderSlotSpec> slots;
    std::vector<RenderPassSpec> specs;
    std::vector<RenderTextureSpec> textures;
    std::vector<Pass> passes;
    std::vector<Group> groups;
    std::vector<Cell> cells;
    std::vector<std::vector<unsigned>> releaseAt;
    std::vector<std::uint64_t> slotVersions;
    std::vector<RenderCommand> commands;
    std::size_t bytes = 0;
    unsigned source = none;
    unsigned registerCount = 0;
    RenderColorSpace presentation = RenderColorSpace::linear;
    bool volatileWork = false;
    bool first = true;
    bool pending = false;

    void remove(unsigned groupId, unsigned cell) noexcept {
        auto& group = groups[groupId]; auto& item = cells[cell];
        if (item.previous == none) { group.head = item.next; } else { cells[item.previous].next = item.next; }
        if (item.next == none) { group.tail = item.previous; } else { cells[item.next].previous = item.previous; }
        item.previous = none; item.next = none;
    }
    void append(unsigned groupId, unsigned cell) noexcept {
        auto& group = groups[groupId]; auto& item = cells[cell];
        item.group = groupId;
        item.previous = group.tail; item.next = none;
        if (group.tail == none) { group.head = cell; } else { cells[group.tail].next = cell; }
        group.tail = cell;
    }
};
std::size_t RenderTextureSpec::bytes() const noexcept { return static_cast<std::size_t>(width) * height * (format == RenderFormat::rgba16float ? 8 : 4); }
RenderSchedule::RenderSchedule(std::unique_ptr<Storage> storage) : storage_(std::move(storage)) {}
RenderSchedule::~RenderSchedule() = default;
std::span<const RenderSlotSpec> RenderSchedule::slots() const noexcept { return storage_->slots; }
std::span<const RenderPassSpec> RenderSchedule::passes() const noexcept { return storage_->specs; }
std::span<const RenderTextureSpec> RenderSchedule::textures() const noexcept { return storage_->textures; }
std::span<const unsigned> RenderSchedule::outputCandidates(unsigned index) const noexcept {
    if (index >= storage_->passes.size() || !storage_->passes[index].reachable) { return {}; }
    const auto& pass = storage_->passes[index];
    return storage_->specs[index].retained ? std::span<const unsigned>(storage_->groups[pass.group].candidates) : std::span<const unsigned>(&pass.texture, 1);
}
std::size_t RenderSchedule::textureBytes() const noexcept { return storage_->bytes; }
RenderColorSpace RenderSchedule::presentationColorSpace() const noexcept { return storage_->presentation; }

RenderFramePlan RenderSchedule::beginFrame(const RenderFrameInput& input) noexcept {
    auto& data = *storage_;
    if (data.pending || input.registers.size() != data.registerCount || input.slotVersions.size() != data.slots.size()) { return {}; }
    // Validate the complete snapshot before changing cache metadata.
    bool work = data.first || input.targetChanged || (input.running && data.volatileWork);
    for (unsigned i = 0; i < data.passes.size(); ++i) {
        const auto& pass = data.passes[i];
        if (!pass.reachable) { continue; }
        for (unsigned j = 0; j < pass.registers.size(); ++j) {
            const auto& value = input.registers[pass.registers[j]];
            if (value.width < 1 || value.width > 4) { return {}; }
            for (unsigned lane = 0; lane < value.width; ++lane) { if (!std::isfinite(value.lanes[lane])) { return {}; } }
            work = work || !equal(value, pass.uniforms[j]);
        }
        if (pass.version == std::numeric_limits<std::uint64_t>::max()) { return {}; }
    }
    work = work || !std::equal(input.slotVersions.begin(), input.slotVersions.end(), data.slotVersions.begin());
    if (!work || data.source == none) { return {true, false, none, 0, {}}; }
    std::copy(input.slotVersions.begin(), input.slotVersions.end(), data.slotVersions.begin());
    data.commands.clear();
    std::size_t evictions = 0;
    for (unsigned i = 0; i < data.passes.size(); ++i) {
        auto& pass = data.passes[i];
        if (!pass.reachable) { continue; }
        const bool retained = data.specs[i].retained;
        bool dirty = !retained || !pass.valid;
        for (unsigned j = 0; j < pass.sources.size(); ++j) {
            const auto source = pass.sources[j];
            const bool slot = source < data.slots.size();
            const auto version = slot ? data.slotVersions[source] : data.passes[source - data.slots.size()].version;
            dirty = dirty || version != pass.seen[j]; pass.seen[j] = version;
            pass.inputs[j] = slot ? source : data.passes[source - data.slots.size()].texture;
        }
        for (unsigned j = 0; j < pass.registers.size(); ++j) {
            const auto& value = input.registers[pass.registers[j]];
            dirty = dirty || !equal(value, pass.uniforms[j]); pass.uniforms[j] = value;
        }
        if (retained) {
            if (pass.texture == none) {
                const auto cell = data.groups[pass.group].head;
                // Preparation guarantees enough cells for simultaneously live outputs.
                if (cell == none) { completeFrame(false); return {}; }
                auto& owner = data.cells[cell].owner;
                if (owner != none) {
                    data.passes[owner].texture = none; data.passes[owner].valid = false; ++evictions;
                }
                owner = i; pass.texture = cell; dirty = true;
            }
            // Pin through the final consumer, keeping live inputs out of LRU.
            data.remove(pass.group, pass.texture);
        }
        if (dirty) {
            ++pass.version; pass.valid = retained;
            data.commands.push_back({i, pass.texture, pass.inputs, pass.uniforms});
        }
        for (auto released : data.releaseAt[i]) {
            auto& previous = data.passes[released];
            if (data.specs[released].retained) { data.append(previous.group, previous.texture); }
        }
    }
    const auto source = data.source < data.slots.size() ? data.source : data.passes[data.source - data.slots.size()].texture;
    for (auto released : data.releaseAt[data.passes.size()]) {
        auto& pass = data.passes[released];
        if (data.specs[released].retained) { data.append(pass.group, pass.texture); }
    }
    data.pending = true;
    return {true, true, source, evictions, data.commands};
}
void RenderSchedule::completeFrame(bool success) noexcept {
    auto& data = *storage_;
    if (success && !data.pending) { return; }
    if (!success) {
        for (auto& pass : data.passes) { pass.valid = false; }
        // Rebuild only metadata after a rejected backend frame, without allocation.
        for (auto& group : data.groups) { group.head = none; group.tail = none; }
        for (unsigned i = 0; i < data.cells.size(); ++i) {
            if (data.cells[i].group != none) { data.append(data.cells[i].group, i); }
        }
    }
    data.first = !success; data.pending = false;
}

RenderSchedule::Prepared RenderSchedule::prepare(const Plan& plan, const Registry& registry, RenderOptions options) {
    std::string current = "$render";
    const auto failure = [&](std::string reason, std::string detail) -> Prepared { return {nullptr, Diagnostic{current, std::move(reason), std::move(detail)}}; };
    try {
        auto projection = plan;
        projection["audio"] = {{"buffers", Plan::array()}, {"nodes", Plan::array()}, {"sinks", Plan::array()}};
        Registry renderRegistry = registry; registerControlOperations(renderRegistry);
        const auto loaded = loadPlan(projection.dump(), renderRegistry);
        if (!loaded.plan) { return {nullptr, loaded.error}; }
        const auto& document = *loaded.plan;
        auto data = std::make_unique<Storage>();
        const unsigned width = document["session"]["width"], height = document["session"]["height"];
        data->registerCount = document["control"]["registers"];
        if (options.reservedTextureBytes > options.textureBudget) { return failure("budget", "Reserved textures exceed session budget"); }
        data->bytes = options.reservedTextureBytes;
        const auto allocate = [&](const RenderTextureSpec& spec) {
            if (spec.bytes() > options.textureBudget - data->bytes) { throw std::length_error("Live textures exceed session budget"); }
            data->bytes += spec.bytes(); data->textures.push_back(spec); data->cells.emplace_back();
            return static_cast<unsigned>(data->textures.size() - 1);
        };
        std::unordered_map<std::string, unsigned> sources;
        for (const auto& slot : document["slots"]) {
            if (slot["kind"] != "texture") { continue; }
            current = slot["id"].get<std::string>();
            const auto spec = dimensions(slot["output"], width, height);
            sources.emplace(current, static_cast<unsigned>(data->slots.size()));
            data->slots.push_back({current, spec, colorSpace(slot["output"]["colorSpace"]), slot["output"]["alpha"] == "premultiplied"}); allocate(spec);
        }
        data->slotVersions.resize(data->slots.size());
        const auto& descriptions = document["render"]["passes"];
        data->passes.reserve(descriptions.size()); data->specs.reserve(descriptions.size());
        std::map<std::tuple<unsigned, unsigned, RenderFormat, bool>, unsigned> groups;
        for (const auto& description : descriptions) {
            current = description["node"].get<std::string>();
            const auto module = description["module"].get<std::string>();
            if (registry.modules.at(module).delayedInputs) { return failure("feedback", "Feedback passes require WP23"); }
            const auto index = static_cast<unsigned>(data->passes.size());
            Pass pass; pass.lastUse = index;
            RenderPassSpec spec; spec.node = current; spec.module = module; spec.retained = description["retention"] == "retained";
            const RenderTextureSpec* relative = nullptr;
            for (auto input = description["inputs"].begin(); input != description["inputs"].end(); ++input) {
                const auto source = sources.at(input.value().get<std::string>());
                pass.sources.push_back(source); spec.inputs.push_back(input.key());
                const RenderTextureSpec* texture = nullptr;
                if (source < data->slots.size()) { texture = &data->slots[source].texture; }
                else {
                    const auto producer = source - static_cast<unsigned>(data->slots.size());
                    texture = &data->specs[producer].output;
                    if (spec.retained && !data->specs[producer].retained) { return failure("retention", "A volatile input requires volatile downstream passes"); }
                }
                const auto& size = description["output"]["size"];
                if (size["kind"] == "input" && size["input"] == input.key()) { relative = texture; }
            }
            spec.output = dimensions(description["output"], width, height, relative);
            spec.colorSpace = colorSpace(description["output"]["colorSpace"]);
            for (const auto& reg : description["uniforms"]) { pass.registers.push_back(reg.get<unsigned>()); }
            spec.uniformCount = static_cast<unsigned>(pass.registers.size());
            pass.uniforms.resize(pass.registers.size()); pass.inputs.resize(pass.sources.size()); pass.seen.resize(pass.sources.size());
            const auto key = std::tuple{spec.output.width, spec.output.height, spec.output.format, spec.retained};
            const auto [group, inserted] = groups.emplace(key, static_cast<unsigned>(data->groups.size()));
            if (inserted) { data->groups.push_back({spec.output, spec.retained}); }
            pass.group = group->second;
            sources.emplace(current, static_cast<unsigned>(data->slots.size()) + index);
            data->passes.push_back(std::move(pass)); data->specs.push_back(std::move(spec));
        }
        data->releaseAt.resize(data->passes.size() + 1);
        if (document["render"].contains("present")) {
            data->presentation = colorSpace(document["render"]["present"]["colorSpace"]);
            data->source = sources.at(document["render"]["present"]["source"].get<std::string>());
            if (data->source >= data->slots.size()) {
                auto& pass = data->passes[data->source - data->slots.size()];
                pass.reachable = true; pass.lastUse = static_cast<unsigned>(data->passes.size());
            }
        }
        // Reverse topological walk prunes passes outside the present chain.
        for (std::size_t i = data->passes.size(); i-- > 0;) {
            const auto& pass = data->passes[i];
            if (!pass.reachable) { continue; }
            for (auto source : pass.sources) {
                if (source < data->slots.size()) { continue; }
                auto& producer = data->passes[source - data->slots.size()];
                producer.reachable = true; producer.lastUse = std::max(producer.lastUse, static_cast<unsigned>(i));
            }
        }
        std::vector<unsigned> live(data->groups.size());
        std::vector<std::vector<unsigned>> free(data->groups.size());
        for (unsigned i = 0; i < data->passes.size(); ++i) {
            auto& pass = data->passes[i];
            if (!pass.reachable) { continue; }
            auto& group = data->groups[pass.group]; ++group.total;
            group.peak = std::max(group.peak, ++live[pass.group]);
            data->releaseAt[pass.lastUse].push_back(i);
            if (!group.retained) {
                data->volatileWork = true;
                if (free[pass.group].empty()) { pass.texture = allocate(group.spec); }
                else { pass.texture = free[pass.group].back(); free[pass.group].pop_back(); }
            }
            for (auto released : data->releaseAt[i]) {
                const auto& previous = data->passes[released]; --live[previous.group];
                if (!data->groups[previous.group].retained) { free[previous.group].push_back(previous.texture); }
            }
        }
        for (unsigned i = 0; i < data->groups.size(); ++i) {
            const auto& group = data->groups[i];
            if (!group.retained) { continue; }
            for (unsigned count = 0; count < group.peak; ++count) { data->append(i, allocate(group.spec)); }
        }
        // Spare budget preserves more retained outputs between frames. Mandatory
        // live sets are allocated first so an early cache cannot starve a chain.
        for (unsigned i = 0; i < data->groups.size(); ++i) {
            const auto& group = data->groups[i];
            if (!group.retained) { continue; }
            for (unsigned count = group.peak; count < group.total && group.spec.bytes() <= options.textureBudget - data->bytes; ++count) {
                data->append(i, allocate(group.spec));
            }
        }
        data->commands.reserve(data->passes.size());
        for (unsigned i = 0; i < data->cells.size(); ++i) {
            if (data->cells[i].group != none) { data->groups[data->cells[i].group].candidates.push_back(i); }
        }
        return {std::make_unique<RenderSchedule>(std::move(data)), std::nullopt};
    } catch (const Plan::exception& error) { return failure("structure", error.what()); }
    catch (const std::length_error& error) { return failure("budget", error.what()); }
    catch (const std::exception& error) { return failure("render_plan", error.what()); }
}
}
