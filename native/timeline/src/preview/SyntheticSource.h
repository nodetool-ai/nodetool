#pragma once

#include "preview/LayerSource.h"

#include <QColor>
#include <QImage>
#include <QRect>
#include <QString>

#include <array>
#include <memory>

class QPainter;

namespace nt {

// A test pattern: a solid colour per clip, a grid, a block that sweeps once
// per two seconds of source time, the clip label and the source time in whole
// seconds. It redraws only when the source frame (at `fps`) changes, and then
// uploads only the block and, once a second, the timecode, so its CPU cost
// stays small next to the compositor's.
class SyntheticSource final : public LayerSource {
public:
    SyntheticSource(QString label, QColor color, QSize size, double fps);
    ~SyntheticSource() override;

    QSize frameSize() const override { return m_size; }
    LayerFrame frameAt(QRhi* rhi, QRhiResourceUpdateBatch* updates, double sourceTimeMs) override;

    // Stable colour for a clip id, so a clip looks the same every run.
    static QColor colorForId(const QString& id);

private:
    QImage paintBase() const;
    QRect barRect(double sourceTimeMs) const;
    QRect timecodeRect() const;
    void buildGlyphs();
    QString timecodeText(long long frameIndex) const;
    void paintOverlay(QPainter& p, long long frameIndex, const QRect& bar) const;

    QString m_label;
    QColor m_color;
    QSize m_size;
    double m_fps;
    QImage m_base;  // the pattern without the bar and timecode
    QRect m_bar;    // block rectangle of the uploaded frame
    std::array<QImage, 11> m_glyphs;  // "0".."9" and ":", pre-rendered
    QSize m_glyphSize;
    std::unique_ptr<QRhiTexture> m_texture;
    long long m_uploadedFrame = -1;
};

}  // namespace nt
