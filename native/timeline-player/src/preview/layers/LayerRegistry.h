#pragma once
#include "preview/LayerSource.h"
#include "preview/SceneEval.h"
#include <QMargins>
#include <functional>
#include <map>
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
    // Requested sources are premultiplied RGBA with explicit LayerFrame format and transfer at their decoded size.
    // Valid only during render(), keyed by the requesting provider.
    const std::map<std::string, LayerFrame>* sources = nullptr;
    WorkingFormat workingFormat = WorkingFormat::Rgba8;
};
class LayerEffectStage {
public:
    virtual ~LayerEffectStage() = default;
    virtual bool applies(const QJsonObject& ext) const = 0;
    // Nonnegative source pixels added on each side of this stage output.
    // Input size includes any preceding stages' outsets.
    virtual QMargins outset(const QJsonObject&, QSize) const { return {}; }
    // Preserve the declared input transfer. Mixed/generated content may remain unknown.
    // Record a complete pass into output, reading input without modifying it.
    // Handle input format, transfer and flipV. Output is premultiplied RGBA
    // in framebuffer orientation, retaining the declared transfer. Retain resources through their last GPU use.
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
