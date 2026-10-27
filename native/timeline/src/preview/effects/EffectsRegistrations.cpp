#include "preview/effects/BlendModes.h"
#include "preview/layers/SceneHooks.h"
#include <QCoreApplication>
#include <QGuiApplication>

namespace {
void registerEffects() {
    if (!qobject_cast<QGuiApplication*>(QCoreApplication::instance())) { return; }
    // Blends consume the evaluated blendMode and placed pixels. No raw JSON
    // payload belongs in ext until an effect stage needs it.
    nt::registerLayerDecorator([](nt::ActiveLayer&, const nt::Clip&, double) {});
    nt::registerGroupDecorator([](nt::PrecompositeLayer&, const nt::Clip&, double) {});
    for (const auto mode : nt::effects::blendModes) {
        nt::registerBlendHandler(std::string(mode), [] { return std::make_unique<nt::effects::BlendModeHandler>(); });
    }
}
Q_COREAPP_STARTUP_FUNCTION(registerEffects)
}
