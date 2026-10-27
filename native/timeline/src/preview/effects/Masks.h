#pragma once
#include "preview/compose/ComposeRegistry.h"
#include <QImage>
#include <list>

namespace nt::effects {
class DrawCache;
class MaskRasterizer {
  public:
    QImage rasterize(const QJsonObject &mask, QSize sourceSize);
    size_t cacheSize() const { return m_cache.size(); }

  private:
    std::list<std::pair<QByteArray, QImage>> m_cache;
};
void decorateMasks(ActiveLayer &layer, const Clip &clip);
std::vector<SecondSourceRequest> generatedMatteSources(const ActiveLayer &, const Clip &);
class GeneratedMatteSourceStage final : public LayerEffectStage {
  public:
    bool applies(const QJsonObject &ext) const override;
    bool render(const EffectContext &, const LayerFrame &, QRhiTextureRenderTarget &, const QJsonObject &) override;

  private:
    std::shared_ptr<DrawCache> m_cache;
};
class ShapeMaskStage final : public LayerEffectStage {
  public:
    bool applies(const QJsonObject &ext) const override;
    bool render(const EffectContext &, const LayerFrame &, QRhiTextureRenderTarget &, const QJsonObject &) override;

  private:
    MaskRasterizer m_rasterizer;
    std::list<std::pair<qint64, std::shared_ptr<QRhiTexture>>> m_textures;
    std::shared_ptr<DrawCache> m_cache;
};
class ImageMatteStage final : public MatteStage {
  public:
    bool render(const EffectContext &, const LayerFrame &, const LayerFrame &, QRhiTextureRenderTarget &,
                const LayerMatte &, const QJsonObject &) override;

  private:
    std::shared_ptr<DrawCache> m_cache;
};
} // namespace nt::effects
