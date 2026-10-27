#include "render2d/RasterSource.h"
#include "preview/RetireQueue.h"
namespace nt::render2d {
LayerFrame RasterSource::frameAt(const FrameContext& context, double) {
    if (!context.rhi || !context.updates) {
        return {};
    }
    const auto& image = m_cache.imageFor(m_layer);
    if (image.isNull()) {
        return {};
    }
    if (!m_texture || m_texture->pixelSize() != image.size()) {
        // A resized image needs a new allocation. Keep the old texture through
        // the last command buffer that sampled it, just like a replaced source.
        if (m_texture && context.retire) {
            context.retire->retire(std::move(m_texture), m_lastUse);
        }
        m_texture.reset(context.rhi->newTexture(QRhiTexture::RGBA8, image.size()));
        if (!m_texture->create()) {
            m_texture.reset();
            return {};
        }
        m_uploadedKey = 0;
    }
    LayerFrame result;
    if (m_uploadedKey != image.cacheKey()) {
        context.updates->uploadTexture(m_texture.get(), image);
        m_uploadedKey = image.cacheKey();
        result.cpuCopies = 1;
    }
    m_lastUse = context.frameNumber;
    result.format = LayerFrame::Format::Rgba8Premultiplied;
    result.planes[0] = m_texture.get();
    result.size = image.size();
    return result;
}
} // namespace nt::render2d
