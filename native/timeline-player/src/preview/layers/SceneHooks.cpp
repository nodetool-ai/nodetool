#include "preview/layers/SceneHooks.h"
#include <algorithm>
#include <mutex>

namespace nt {
namespace {
struct Hook {
    SceneHookToken token = 0;
    LayerDecorator layer;
    LayerDecorationOrder layerOrder = LayerDecorationOrder::Default;
    GroupDecorator group;
    scene::MeasureText measure;
    SourceTimeMapper mapper;
    ClipAnimationProvider clipAnimation;
};
struct Registry {
    // Guards hooks and token allocation.
    std::mutex mutex;
    std::vector<Hook> hooks;
    SceneHookToken next = 1;
};
// native-rules #14: static process-wide mutable registry
Registry& registry() { static Registry value; return value; }
SceneHookToken add(Hook hook) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    hook.token = r.next++;
    r.hooks.push_back(std::move(hook));
    return r.hooks.back().token;
}
}
SceneHookToken registerLayerDecorator(LayerDecorator decorator, LayerDecorationOrder order) {
    Hook hook;
    hook.layer = std::move(decorator);
    hook.layerOrder = order;
    return add(std::move(hook));
}
SceneHookToken registerGroupDecorator(GroupDecorator decorator) {
    Hook hook; hook.group = std::move(decorator); return add(std::move(hook));
}
SceneHookToken registerSceneTextMeasurer(scene::MeasureText measure) {
    Hook hook; hook.measure = std::move(measure); return add(std::move(hook));
}
SceneHookToken registerSourceTimeMapper(SourceTimeMapper mapper) {
    Hook hook; hook.mapper = std::move(mapper); return add(std::move(hook));
}
SceneHookToken registerClipAnimationProvider(ClipAnimationProvider provider) {
    Hook hook;
    hook.clipAnimation = std::move(provider);
    return add(std::move(hook));
}
void unregisterSceneHook(SceneHookToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.hooks, [token](const Hook& hook) { return hook.token == token; });
}
SceneHooks sceneHooks() {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    SceneHooks result;
    for (const auto& hook : r.hooks) {
        if (hook.layer && hook.layerOrder == LayerDecorationOrder::Geometry) {
            result.layers.push_back(hook.layer);
        }
    }
    for (const auto& hook : r.hooks) {
        if (hook.layer && hook.layerOrder == LayerDecorationOrder::Default) {
            result.layers.push_back(hook.layer);
        }
        if (hook.group) { result.groups.push_back(hook.group); }
        if (hook.measure) { result.measureText = hook.measure; }
        if (hook.clipAnimation) { result.clipAnimations.push_back(hook.clipAnimation); }
    }
    return result;
}
std::optional<double> mappedSourceTime(const Clip& clip, double timeMs) {
    std::vector<SourceTimeMapper> mappers;
    {
        auto& r = registry();
        const std::scoped_lock lock(r.mutex);
        for (const auto& hook : r.hooks) {
            if (hook.mapper) { mappers.push_back(hook.mapper); }
        }
    }
    for (const auto& mapper : mappers) {
        if (auto mapped = mapper(clip, timeMs)) { return mapped; }
    }
    return {};
}
}
