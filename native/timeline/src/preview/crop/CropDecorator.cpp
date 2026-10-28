#include "Reframe.h"
#include "preview/layers/SceneHooks.h"
#include <QJsonArray>

namespace {
const auto registered = nt::registerContextLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip& clip,
                                                           const nt::SceneDecorationContext& context) {
    if (layer.sourceWidth <= 0 || layer.sourceHeight <= 0) {
        return;
    }
    auto crop = clip.raw.value("crop").toObject();
    if (clip.raw.contains("reframe")) {
        QJsonObject reframeTrack;
        const auto trackId = clip.raw.value("reframe").toObject().value("trackId").toString();
        if (!trackId.isEmpty()) {
            for (const auto& value : context.timeline.raw.value("mediaTracks").toArray()) {
                const auto candidate = value.toObject();
                if (candidate.value("id").toString() == trackId) {
                    reframeTrack = candidate;
                    break;
                }
            }
        }
        const auto activeReframe = nt::reframe::renderableReframe(clip.raw, reframeTrack);
        if (activeReframe.isObject()) {
            const auto reframe = activeReframe.toObject();
            const auto resolved = nt::reframe::resolveReframeCrop(reframe,
                nt::clipSourceMsAt(clip, context.sequenceTimeMs),
                {{"width", reframe.value("sourceWidth").toDouble(layer.sourceWidth)},
                 {"height", reframe.value("sourceHeight").toDouble(layer.sourceHeight)}},
                {{"width", context.timeline.width}, {"height", context.timeline.height}}, reframeTrack);
            if (resolved.isObject()) {
                crop = resolved.toObject();
            }
        }
    }
    const auto rect = nt::reframe::cropRectPx(crop, layer.sourceWidth, layer.sourceHeight);
    layer.sourceRect = {static_cast<float>(rect["x"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["y"].toDouble() / layer.sourceHeight),
                        static_cast<float>(rect["width"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["height"].toDouble() / layer.sourceHeight)};
});
}
