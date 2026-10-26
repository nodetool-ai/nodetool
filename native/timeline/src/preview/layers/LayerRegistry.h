#pragma once
#include "preview/LayerSource.h"
#include "preview/SceneEval.h"
#include <QMargins>
#include <functional>
#include <cstdint>

namespace nt {
using LayerSourceToken = std::uint64_t;
using LayerSourceFactory = std::function<std::unique_ptr<LayerSource>(const ActiveLayer&)>;
// The last factory for a kind wins. Renderers refresh entries when it changes.
LayerSourceToken registerLayerSource(std::string kind, LayerSourceFactory factory);
void unregisterLayerSource(LayerSourceToken token);
struct LayerSourceRegistration {
    LayerSourceToken token = 0;
    LayerSourceFactory factory;
};
LayerSourceRegistration registeredLayerSourceFactory(const std::string& kind);
std::unique_ptr<LayerSource> registeredLayerSource(const ActiveLayer& layer);

struct EffectContext {
    QRhi* rhi;
    QRhiCommandBuffer* commands;
    long long frameNumber;
    RetireQueue* retire;
};
class LayerEffectStage {
public:
    virtual ~LayerEffectStage() = default;
    virtual bool applies(const QJsonObject& ext) const = 0;
    // Nonnegative source pixels added on each side of this stage output.
    // Input size includes any preceding stages' outsets.
    virtual QMargins outset(const QJsonObject&, QSize) const { return {}; }
    // Record a complete pass into output, reading input without modifying it.
    // Handle the input format and flipV. Output is premultiplied RGBA8 with
    // framebuffer orientation. Retain resources through their last GPU use.
    virtual bool render(const EffectContext&, const LayerFrame& input,
                        QRhiTextureRenderTarget& output, const QJsonObject& ext) = 0;
};
using EffectStageToken = std::uint64_t;
using EffectStageFactory = std::function<std::unique_ptr<LayerEffectStage>()>;
// Each renderer owns its stages. Registration order is processing order.
EffectStageToken registerEffectStage(EffectStageFactory factory);
void unregisterEffectStage(EffectStageToken token);
std::vector<std::unique_ptr<LayerEffectStage>> registeredEffectStages();
}
