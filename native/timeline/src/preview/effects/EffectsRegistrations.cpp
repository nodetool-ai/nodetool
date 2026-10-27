#include "preview/effects/BlendModes.h"
#include "preview/PreviewCompositor.h"
#include "preview/effects/ClipEffects.h"
#include "preview/effects/Masks.h"
#include "preview/layers/SceneHooks.h"
#include <QCoreApplication>
#include <QGuiApplication>
#include <QJsonArray>
#include <algorithm>
#include <cmath>

namespace {
class AdjustmentStage final : public nt::BackdropStage {
    nt::effects::AdjustmentTreatment m_treatment;
public:
    bool applies(const QJsonObject &ext) const override { return m_treatment.applies(ext); }
    bool render(const nt::EffectContext &context, const nt::LayerFrame &input, QRhiTextureRenderTarget &output,
                const nt::SceneAdjustment &adjustment) override {
        return m_treatment.render(context, input, output, adjustment);
    }
};
void registerEffects() {
    if (!qobject_cast<QGuiApplication *>(QCoreApplication::instance())) {
        return;
    }
    nt::registerContextLayerDecorator([](nt::ActiveLayer &layer, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
        nt::effects::decorateEffects(layer.ext, clip, context);
        nt::effects::decorateTrackEffects(layer.ext, context.track);
        const auto crop = clip.raw.value("crop").toObject();
        if (!crop.isEmpty() && layer.sourceRect == std::array<float, 4>{0, 0, 1, 1}) {
            const double left = crop.value("left").toDouble(), right = crop.value("right").toDouble();
            const double top = crop.value("top").toDouble(), bottom = crop.value("bottom").toDouble();
            if (std::isfinite(left + right + top + bottom) && left >= 0 && right >= 0 && top >= 0 && bottom >= 0 &&
                left + right < 1 - 1e-4 && top + bottom < 1 - 1e-4 && std::max({left, right, top, bottom}) > 1e-4) {
                layer.sourceRect = {float(left), float(top), float(1 - left - right), float(1 - top - bottom)};
            }
        }
        QJsonArray rect;
        for (const float component : layer.sourceRect) {
            rect.append(component);
        }
        layer.ext.insert("effectSourceRect", rect);
        nt::effects::decorateMasks(layer,clip);
    });
    nt::registerContextGroupDecorator([](nt::PrecompositeLayer &layer, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
        nt::effects::decorateEffects(layer.ext, clip, context);
        layer.ext.insert("effectGroupSurface", true);
    });
    nt::registerContextAdjustmentDecorator(nt::effects::decorateAdjustment);
    nt::registerBackdropStage([] { return std::make_unique<AdjustmentStage>(); });
    nt::registerSecondSourceProvider(nt::effects::generatedMatteSources);
    nt::registerEffectStage([] { return std::make_unique<nt::effects::GeneratedMatteSourceStage>(); });
    nt::registerEffectStage([] { return std::make_unique<nt::effects::ClipEffectStage>(); });
    nt::registerEffectStage([] { return std::make_unique<nt::effects::ShapeMaskStage>(); });
    nt::registerMatteStage([] { return std::make_unique<nt::effects::ImageMatteStage>(); });
    for (const auto mode : nt::effects::blendModes) {
        nt::registerBlendHandler(std::string(mode), [] { return std::make_unique<nt::effects::BlendModeHandler>(); });
    }
}
Q_COREAPP_STARTUP_FUNCTION(registerEffects)
} // namespace
