#include "Reframe.h"
#include "preview/layers/SceneHooks.h"

namespace {
const auto registered = nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip& clip, double) {
    // Reframe crops need the sequence canvas and media tracks in the decorator seam.
    if (clip.raw.contains("reframe") || layer.sourceWidth <= 0 || layer.sourceHeight <= 0) {
        return;
    }
    const auto rect = nt::reframe::cropRectPx(clip.raw.value("crop").toObject(),
                                            layer.sourceWidth, layer.sourceHeight);
    layer.sourceRect = {static_cast<float>(rect["x"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["y"].toDouble() / layer.sourceHeight),
                        static_cast<float>(rect["width"].toDouble() / layer.sourceWidth),
                        static_cast<float>(rect["height"].toDouble() / layer.sourceHeight)};
});
}
