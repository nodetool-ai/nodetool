#pragma once
#include "preview/SceneEval.h"
#include "scene/TextBlock.h"
#include <functional>
#include <cstdint>

namespace nt {
using SceneHookToken = std::uint64_t;
using LayerDecorator = std::function<void(ActiveLayer&, const Clip&, double)>;
using GroupDecorator = std::function<void(PrecompositeLayer&, const Clip&, double)>;
struct SceneDecorationContext {
    const Timeline& timeline;
    const Track* track;
    double timeMs;  // clip evaluation time, stepped for leaf layers
    double sequenceTimeMs;
    double fps;
    long long frameIndex;
};
using ContextLayerDecorator = std::function<void(ActiveLayer&, const Clip&, const SceneDecorationContext&)>;
using ContextGroupDecorator = std::function<void(PrecompositeLayer&, const Clip&, const SceneDecorationContext&)>;
// Return true when the record has a treatment. No accepting hook means no record.
using ContextAdjustmentDecorator = std::function<bool(SceneAdjustment&, const Clip&, const SceneDecorationContext&)>;
using SourceTimeMapper = std::function<std::optional<double>(const Clip&, double)>;
using ClipAnimationProvider = std::function<std::optional<QJsonObject>(const Track&, const Clip&)>;
SceneHookToken registerLayerDecorator(LayerDecorator decorator);
SceneHookToken registerGroupDecorator(GroupDecorator decorator);
SceneHookToken registerContextLayerDecorator(ContextLayerDecorator decorator);
SceneHookToken registerContextGroupDecorator(ContextGroupDecorator decorator);
SceneHookToken registerContextAdjustmentDecorator(ContextAdjustmentDecorator decorator);
SceneHookToken registerSceneTextMeasurer(scene::MeasureText measure);
SceneHookToken registerSourceTimeMapper(SourceTimeMapper mapper);
SceneHookToken registerClipAnimationProvider(ClipAnimationProvider provider);
void unregisterSceneHook(SceneHookToken token);
struct SceneHooks {
    std::vector<LayerDecorator> layers;
    std::vector<GroupDecorator> groups;
    scene::MeasureText measureText;
    std::vector<ClipAnimationProvider> clipAnimations;
};
SceneHooks sceneHooks();
std::optional<double> mappedSourceTime(const Clip& clip, double timeMs);
}
