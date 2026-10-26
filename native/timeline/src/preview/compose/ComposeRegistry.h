#pragma once
#include "preview/layers/LayerRegistry.h"
#include <map>

namespace nt {
class BlendHandler {
public:
    virtual ~BlendHandler() = default;
    // Inputs are container-sized, premultiplied RGBA8. The backdrop is the
    // container before this item. The layer is alone at its placement, with
    // opacity applied. Respect each flipV. Write the complete container after
    // the item to output, in framebuffer orientation. Retire GPU resources
    // through the context until their last use.
    virtual bool render(const EffectContext&, const LayerFrame& backdrop, const LayerFrame& layer,
                        QRhiTextureRenderTarget& output, const std::string& mode, const QJsonObject& ext) = 0;
};
using BlendHandlerToken = std::uint64_t;
using BlendHandlerFactory = std::function<std::unique_ptr<BlendHandler>()>;
// Last registration for a mode wins. Each renderer owns its handlers, taking
// a snapshot when its QRhi initializes. Normal always uses premultiplied over.
BlendHandlerToken registerBlendHandler(std::string mode, BlendHandlerFactory factory);
void unregisterBlendHandler(BlendHandlerToken token);
std::map<std::string, std::unique_ptr<BlendHandler>> registeredBlendHandlers();

class MatteStage {
public:
    virtual ~MatteStage() = default;
    // Inputs and output are canvas-sized premultiplied RGBA8. The layer is
    // placed with opacity 1, the matte with its own opacity. Effects precede
    // placement. The result meets the stack with the layer's opacity/blend.
    // Respect flipV and retire resources through their last GPU use.
    virtual bool render(const EffectContext&, const LayerFrame& layer, const LayerFrame& matte,
                        QRhiTextureRenderTarget& output, const LayerMatte& info, const QJsonObject& ext) = 0;
};
using MatteStageToken = std::uint64_t;
using MatteStageFactory = std::function<std::unique_ptr<MatteStage>()>;
// Last registration wins. Each renderer snapshots and owns its stage at QRhi initialization.
MatteStageToken registerMatteStage(MatteStageFactory factory);
void unregisterMatteStage(MatteStageToken token);
std::unique_ptr<MatteStage> registeredMatteStage();

struct SecondSourceRequest {
    std::string key;
    std::string mediaPath;
};
using SecondSourceProvider = std::function<std::vector<SecondSourceRequest>(const ActiveLayer&, const Clip&)>;
using SecondSourceToken = std::uint64_t;
SecondSourceToken registerSecondSourceProvider(SecondSourceProvider provider);
void unregisterSecondSourceProvider(SecondSourceToken token);
// Snapshot under the registry lock, invoke on the render thread outside it.
// Providers run in registration order. The last request for a key wins.
std::vector<SecondSourceProvider> registeredSecondSourceProviders();
}
