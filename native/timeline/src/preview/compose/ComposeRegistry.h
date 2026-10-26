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
}
