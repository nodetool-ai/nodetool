#include "preview/effects/EffectsRegistrations.h"
#include "preview/compose/BackdropStage.h"
#include "preview/effects/BlendModes.h"
#include "preview/effects/ClipEffects.h"
#include "preview/effects/Denoise.h"
#include "preview/effects/Masks.h"
#include "preview/layers/SceneHooks.h"
#include <QCoreApplication>
#include <QGuiApplication>
#include <QJsonArray>
#include <algorithm>
#include <cmath>

namespace nt::effects {
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
using SecondSourceFunction = std::vector<SecondSourceRequest> (*)(const ActiveLayer &, const Clip &);
bool hasSecondSource(SecondSourceFunction function) {
    const auto providers = registeredSecondSourceProviders();
    return std::ranges::any_of(providers, [function](const SecondSourceProvider &provider) {
        const auto *target = provider.target<SecondSourceFunction>();
        return target && *target == function;
    });
}
template <typename Stage> bool hasEffectStage() {
    const auto stages = registeredEffectStages();
    return std::ranges::any_of(stages, [](const auto &stage) { return dynamic_cast<const Stage *>(stage.get()); });
}
} // namespace

HookRegistrations registerEffectHooks() {
    HookRegistrations hooks;
    if (!qobject_cast<QGuiApplication *>(QCoreApplication::instance())) {
        return hooks;
    }
    const auto scene = [&hooks](SceneHookToken token) { hooks.add([token] { unregisterSceneHook(token); }); };
    scene(nt::registerContextLayerDecorator([](nt::ActiveLayer &layer, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
        nt::effects::decorateEffects(layer.ext, clip, context);
        nt::effects::decorateTrackEffects(layer.ext, context.track);
        const auto crop = clip.raw.value("crop").toObject();
        if (!layer.ext.value("generatedMatteSource").toBool() && !crop.isEmpty() && layer.sourceRect == std::array<float, 4>{0, 0, 1, 1}) {
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
        nt::effects::decorateMasks(layer, clip, &context);
    }));
    scene(nt::registerContextGroupDecorator([](nt::PrecompositeLayer &layer, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
        layer.ext.insert("effectGroupSurface", true);
        nt::effects::decorateEffects(layer.ext, clip, context);
    }));
    scene(nt::registerContextAdjustmentDecorator(nt::effects::decorateAdjustment));
    const auto backdrop = nt::registerBackdropStage([] { return std::make_unique<AdjustmentStage>(); });
    hooks.add([backdrop] { unregisterBackdropStage(backdrop); });
    for (const SecondSourceFunction provider : {SecondSourceFunction(nt::effects::generatedMatteSources),
                                                SecondSourceFunction(nt::effects::denoiseSources)}) {
        const auto token = nt::registerSecondSourceProvider(provider);
        hooks.add([token] { unregisterSecondSourceProvider(token); });
    }
    const auto stage = [&hooks](EffectStageToken token) { hooks.add([token] { unregisterEffectStage(token); }); };
    stage(nt::registerEffectStage([] { return std::make_unique<nt::effects::GeneratedMatteSourceStage>(); }));
    stage(nt::registerEffectStage([] { return std::make_unique<nt::effects::ClipEffectStage>(); }));
    stage(nt::registerEffectStage([] { return std::make_unique<nt::effects::ShapeMaskStage>(); }));
    const auto matte = nt::registerMatteStage([] { return std::make_unique<nt::effects::ImageMatteStage>(); });
    hooks.add([matte] { unregisterMatteStage(matte); });
    for (const auto mode : nt::effects::blendModes) {
        const auto token =
            nt::registerBlendHandler(std::string(mode), [] { return std::make_unique<nt::effects::BlendModeHandler>(); });
        hooks.add([token] { unregisterBlendHandler(token); });
    }
    return hooks;
}

QStringList missingEffectHooks() {
    QStringList missing;
    const auto handlers = registeredBlendHandlers();
    for (const auto mode : blendModes) {
        const auto found = handlers.find(std::string(mode));
        if (found == handlers.end() || !dynamic_cast<const BlendModeHandler *>(found->second.get())) {
            missing.append(QStringLiteral("blend:%1").arg(QLatin1StringView(mode.data(), qsizetype(mode.size()))));
        }
    }
    if (!hasEffectStage<GeneratedMatteSourceStage>()) {
        missing.append(QStringLiteral("effect-stage:generated-matte"));
    }
    if (!hasEffectStage<ClipEffectStage>()) {
        missing.append(QStringLiteral("effect-stage:clip-effects"));
    }
    if (!hasEffectStage<ShapeMaskStage>()) {
        missing.append(QStringLiteral("effect-stage:shape-mask"));
    }
    if (!dynamic_cast<const ImageMatteStage *>(registeredMatteStage().get())) {
        missing.append(QStringLiteral("matte-stage:image"));
    }
    const auto backdrops = registeredBackdropStages();
    if (!std::ranges::any_of(backdrops, [](const auto &stage) { return dynamic_cast<const AdjustmentStage *>(stage.get()); })) {
        missing.append(QStringLiteral("backdrop-stage:adjustment"));
    }
    if (!hasSecondSource(generatedMatteSources)) {
        missing.append(QStringLiteral("second-source:generated-matte"));
    }
    if (!hasSecondSource(denoiseSources)) {
        missing.append(QStringLiteral("second-source:denoise"));
    }
    return missing;
}
} // namespace nt::effects
