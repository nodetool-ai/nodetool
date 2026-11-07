#include "preview/layers/LayerRegistry.h"
#include "preview/layers/SceneHooks.h"
#include "render2d/LayerStyle.h"
#include "render2d/RasterSource.h"
#include <QCoreApplication>
#include <QGuiApplication>
namespace {
void registerRender2d() {
    // --dump-plan creates QCoreApplication and must keep the oracle's fallback
    // measurement. Only the GUI render path registers font metrics and pixels.
    if (!qobject_cast<QGuiApplication*>(QCoreApplication::instance())) {
        return;
    }
    nt::registerSceneTextMeasurer(nt::render2d::textMeasurer());
    nt::registerLayerDecorator(nt::render2d::decorateLayer);
    for (const auto* kind : {"text", "shape", "caption"}) {
        nt::registerLayerSource(
            kind, [](const nt::ActiveLayer& layer) { return std::make_unique<nt::render2d::RasterSource>(layer); });
    }
}
Q_COREAPP_STARTUP_FUNCTION(registerRender2d)
} // namespace
