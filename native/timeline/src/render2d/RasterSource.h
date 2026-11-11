#pragma once
#include "preview/LayerSource.h"
#include "render2d/Rasterizer.h"

namespace nt::render2d {
class RasterSource final : public LayerSource {
  public:
    explicit RasterSource(ActiveLayer layer) : m_layer(std::move(layer)) {}
    QSize frameSize() const override { return {m_layer.sourceWidth, m_layer.sourceHeight}; }
    void updateLayer(const ActiveLayer& layer) override { m_layer = layer; }
    LayerFrame frameAt(const FrameContext& context, double sourceTimeMs) override;

  private:
    ActiveLayer m_layer;
    RasterCache m_cache;
    std::shared_ptr<QRhiTexture> m_texture;
    qint64 m_uploadedKey = 0;
    long long m_lastUse = 0;
};
} // namespace nt::render2d
