#pragma once
#include "preview/SceneEval.h"
#include "scene/TextBlock.h"
#include <functional>
#include <cstdint>

namespace nt {
using SceneHookToken = std::uint64_t;
using LayerDecorator = std::function<void(ActiveLayer&, const Clip&, double)>;
using GroupDecorator = std::function<void(PrecompositeLayer&, const Clip&, double)>;
using SourceTimeMapper = std::function<std::optional<double>(const Clip&, double)>;
SceneHookToken registerLayerDecorator(LayerDecorator decorator);
SceneHookToken registerGroupDecorator(GroupDecorator decorator);
SceneHookToken registerSceneTextMeasurer(scene::MeasureText measure);
SceneHookToken registerSourceTimeMapper(SourceTimeMapper mapper);
void unregisterSceneHook(SceneHookToken token);
struct SceneHooks {
    std::vector<LayerDecorator> layers;
    std::vector<GroupDecorator> groups;
    scene::MeasureText measureText;
};
SceneHooks sceneHooks();
std::optional<double> mappedSourceTime(const Clip& clip, double timeMs);
}
