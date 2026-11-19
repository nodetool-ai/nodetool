#pragma once
#include "preview/SceneEval.h"
#include "scene/TextBlock.h"
#include <QImage>

namespace nt::render2d {
QString resolveFontDirectory(const QString& applicationDir);
// Registers the fonts documents draw with. Call it once, before any QML loads. Some of them share a
// family name with the interface fonts, and a font added after the interface has text makes all of
// that text draw with the wrong glyphs. A first text or caption layer would otherwise do just that.
void loadTimelineFonts();
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
