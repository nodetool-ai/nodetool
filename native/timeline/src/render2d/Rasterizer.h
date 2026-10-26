#pragma once
#include "preview/SceneEval.h"
#include "scene/TextBlock.h"
#include <QImage>

namespace nt::render2d {
QString resolveFontDirectory(const QString& applicationDir);
scene::MeasureText textMeasurer();
QImage rasterize(const ActiveLayer& layer);

class RasterCache {
  public:
    const QImage& imageFor(const ActiveLayer& layer);
    int rasterCount() const { return m_count; }

  private:
    QJsonObject m_inputs;
    QSize m_size;
    std::string m_kind;
    QImage m_image;
    int m_count = 0;
};
} // namespace nt::render2d
