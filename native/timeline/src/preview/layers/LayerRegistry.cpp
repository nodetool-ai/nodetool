#include "preview/layers/LayerRegistry.h"
#include <algorithm>
#include <mutex>

namespace nt {
namespace {
struct SourceRegistration { LayerSourceToken token; std::string kind; LayerSourceFactory factory; };
struct EffectRegistration { EffectStageToken token; EffectStageFactory factory; };
struct Registry {
    std::mutex mutex;
    std::vector<SourceRegistration> sources;
    std::vector<EffectRegistration> effects;
    std::uint64_t next = 1;
};
Registry& registry() { static Registry value; return value; }
}
LayerSourceToken registerLayerSource(std::string kind, LayerSourceFactory factory) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    const auto token = r.next++;
    r.sources.push_back({token, std::move(kind), std::move(factory)});
    return token;
}
void unregisterLayerSource(LayerSourceToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.sources, [token](const auto& source) { return source.token == token; });
}
LayerSourceRegistration registeredLayerSourceFactory(const std::string& kind) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    const auto it = std::find_if(r.sources.rbegin(), r.sources.rend(), [&](const auto& source) { return source.kind == kind; });
    return it != r.sources.rend() ? LayerSourceRegistration{it->token, it->factory} : LayerSourceRegistration{};
}
std::unique_ptr<LayerSource> registeredLayerSource(const ActiveLayer& layer) {
    const auto registration = registeredLayerSourceFactory(layer.kind);
    return registration.factory ? registration.factory(layer) : nullptr;
}
EffectStageToken registerEffectStage(EffectStageFactory factory) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    const auto token = r.next++;
    r.effects.push_back({token, std::move(factory)});
    return token;
}
void unregisterEffectStage(EffectStageToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.effects, [token](const auto& effect) { return effect.token == token; });
}
std::vector<std::unique_ptr<LayerEffectStage>> registeredEffectStages() {
    std::vector<EffectStageFactory> factories;
    {
        auto& r = registry();
        const std::scoped_lock lock(r.mutex);
        for (const auto& effect : r.effects) { factories.push_back(effect.factory); }
    }
    std::vector<std::unique_ptr<LayerEffectStage>> stages;
    for (const auto& factory : factories) {
        if (auto stage = factory()) { stages.push_back(std::move(stage)); }
    }
    return stages;
}
}
