#include "render2d/Render2dRegistrations.h"
#include "preview/layers/LayerRegistry.h"
#include "preview/layers/SceneHooks.h"
#include "render2d/LayerStyle.h"
#include "render2d/RasterSource.h"
#include <QCoreApplication>
#include <QGuiApplication>

namespace nt::render2d {
namespace {
constexpr const char* kRasterKinds[] = {"text", "shape", "caption"};
}

HookRegistrations registerRender2dHooks() {
    HookRegistrations hooks;
    // --dump-plan creates QCoreApplication and must keep the oracle's fallback
    // measurement. Only the GUI render path registers font metrics and pixels.
    if (!qobject_cast<QGuiApplication*>(QCoreApplication::instance())) {
        return hooks;
    }
    for (const auto token : {registerSceneTextMeasurer(textMeasurer()), registerLayerDecorator(decorateLayer)}) {
        hooks.add([token] { unregisterSceneHook(token); });
    }
    for (const auto* kind : kRasterKinds) {
        const auto token = registerLayerSource(
            kind, [](const ActiveLayer& layer) { return std::make_unique<RasterSource>(layer); });
        hooks.add([token] { unregisterLayerSource(token); });
    }
    return hooks;
}

QStringList missingRender2dHooks() {
    QStringList missing;
    if (!sceneHooks().measureText) {
        missing.append(QStringLiteral("scene:text-measurer"));
    }
    for (const auto* kind : kRasterKinds) {
        if (!registeredLayerSourceFactory(kind).factory) {
            missing.append(QStringLiteral("layer-source:%1").arg(QLatin1StringView(kind)));
        }
    }
    return missing;
}
}
