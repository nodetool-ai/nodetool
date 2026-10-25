#include "preview/SyntheticSource.h"

#include <QFont>
#include <QFontMetrics>
#include <QPainter>

#include <cmath>

namespace nt {

SyntheticSource::SyntheticSource(QString label, QColor color, QSize size, double fps)
    : m_label(std::move(label)), m_color(color), m_size(size), m_fps(fps > 0.0 ? fps : 30.0) {}

SyntheticSource::~SyntheticSource() = default;

QColor SyntheticSource::colorForId(const QString& id) {
    // FNV-1a: qHash is seeded per process, so it would change colours per run.
    quint32 h = 2166136261u;
    for (const QChar ch : id) {
        h = (h ^ ch.unicode()) * 16777619u;
    }
    return QColor::fromHsv(static_cast<int>(h % 360), 150, 190);
}

QImage SyntheticSource::paintBase() const {
    const int w = m_size.width();
    const int h = m_size.height();
    QImage img(m_size, QImage::Format_RGBA8888_Premultiplied);
    QPainter p(&img);
    p.fillRect(0, 0, w, h, m_color);

    // Grid, so scale and rotation read clearly.
    p.setPen(QPen(m_color.darker(130), std::max(1, w / 400)));
    const int step = std::max(16, std::min(w, h) / 8);
    for (int x = step; x < w; x += step) p.drawLine(x, 0, x, h);
    for (int y = step; y < h; y += step) p.drawLine(0, y, w, y);

    p.setPen(QPen(Qt::white, std::max(2, w / 160)));
    p.drawRect(0, 0, w - 1, h - 1);

    QFont font;
    font.setPixelSize(std::max(12, h / 7));
    font.setWeight(QFont::DemiBold);
    p.setFont(font);
    p.setPen(Qt::white);
    p.drawText(QRect(0, 0, w, h * 2 / 3), Qt::AlignCenter, m_label);
    return img;
}

QRect SyntheticSource::barRect(double sourceTimeMs) const {
    // A block that sweeps across once per two seconds of source time, so
    // motion and its direction read at a glance.
    const int w = m_size.width();
    const int h = m_size.height();
    const int side = std::max(16, h / 6);
    const double phase = std::fmod(sourceTimeMs / 2000.0, 1.0);
    const int x = static_cast<int>(phase * (w + side)) - side;
    return QRect(x, h - side - h / 24, side, side).intersected(QRect(QPoint(0, 0), m_size));
}

QRect SyntheticSource::timecodeRect() const {
    const int w = m_size.width();
    const int h = m_size.height();
    return QRect(w / 3, h * 2 / 3, w / 3, std::max(14, h / 9));
}

void SyntheticSource::buildGlyphs() {
    // Large text goes through the path rasterizer on every draw, which costs
    // milliseconds per frame. The timecode uses 11 characters, so each is
    // drawn once into a cell and then blitted.
    QFont font;
    font.setPixelSize(std::max(10, m_size.height() / 12));
    const QFontMetrics fm(font);
    const QString chars = QStringLiteral("0123456789:");
    int cellW = 0;
    for (const QChar c : chars) cellW = std::max(cellW, fm.horizontalAdvance(c));
    m_glyphSize = QSize(cellW, fm.height());
    for (int i = 0; i < chars.size(); ++i) {
        QImage cell(m_glyphSize, QImage::Format_RGBA8888_Premultiplied);
        cell.fill(Qt::transparent);
        QPainter p(&cell);
        p.setFont(font);
        p.setPen(Qt::white);
        p.drawText(QRect(QPoint(0, 0), m_glyphSize), Qt::AlignCenter, chars.mid(i, 1));
        p.end();
        m_glyphs[static_cast<size_t>(i)] = cell;
    }
}

QString SyntheticSource::timecodeText(long long frameIndex) const {
    // Whole seconds of source time: it changes once a second, so most frames
    // upload only the moving block.
    const long long fpsInt = std::max(1LL, static_cast<long long>(std::llround(m_fps)));
    const long long totalSec = frameIndex / fpsInt;
    return QStringLiteral("%1:%2")
        .arg(totalSec / 60, 2, 10, QLatin1Char('0'))
        .arg(totalSec % 60, 2, 10, QLatin1Char('0'));
}

void SyntheticSource::paintOverlay(QPainter& p, long long frameIndex, const QRect& bar) const {
    if (!bar.isEmpty()) {
        // Opaque: a translucent fill goes through the threaded blend path.
        p.fillRect(bar, QColor(236, 236, 236));
        p.fillRect(bar.adjusted(bar.width() / 4, bar.height() / 4, -bar.width() / 4, -bar.height() / 4),
                   m_color.darker(160));
    }
    const QString tc = timecodeText(frameIndex);
    const QRect box = timecodeRect();
    const int textW = m_glyphSize.width() * static_cast<int>(tc.size());
    QPoint at(box.center().x() - textW / 2, box.center().y() - m_glyphSize.height() / 2);
    for (const QChar c : tc) {
        const int index = c == u':' ? 10 : c.digitValue();
        if (index >= 0) p.drawImage(at, m_glyphs[static_cast<size_t>(index)]);
        at.rx() += m_glyphSize.width();
    }
}

LayerFrame SyntheticSource::frameAt(const FrameContext& ctx, double sourceTimeMs) {
    QRhi* rhi = ctx.rhi;
    QRhiResourceUpdateBatch* updates = ctx.updates;
    if (!m_texture) {
        m_texture.reset(rhi->newTexture(QRhiTexture::RGBA8, m_size));
        if (!m_texture->create()) {
            m_texture.reset();
            return {};
        }
        m_base = paintBase();
        buildGlyphs();
    }
    const long long frame = static_cast<long long>(std::floor(sourceTimeMs * m_fps / 1000.0));
    if (frame != m_uploadedFrame) {
        const QRect bar = barRect(sourceTimeMs);
        if (m_uploadedFrame < 0) {
            // First frame: the whole texture.
            QImage full = m_base.copy();
            QPainter p(&full);
            paintOverlay(p, frame, bar);
            p.end();
            updates->uploadTexture(m_texture.get(), full);
            m_lastCopies = 1;
        } else {
            // Later frames repaint and upload only what changed: the old and
            // new block, and the timecode box when its text changed. The base
            // pattern stays on the GPU.
            QList<QRect> dirty;
            if (timecodeText(frame) != timecodeText(m_uploadedFrame)) {
                dirty.append(timecodeRect());
            }
            const QRect bars = m_bar.united(bar);
            if (bars.width() <= m_bar.width() + bar.width() + 2) {
                dirty.append(bars);
            } else {
                dirty.append(m_bar);
                dirty.append(bar);
            }
            QList<QRhiTextureUploadEntry> entries;
            for (const QRect& r : dirty) {
                if (r.isEmpty()) continue;
                QImage piece = m_base.copy(r);
                QPainter p(&piece);
                p.translate(-r.topLeft());
                paintOverlay(p, frame, bar);
                p.end();
                QRhiTextureSubresourceUploadDescription desc(piece);
                desc.setDestinationTopLeft(r.topLeft());
                entries.append(QRhiTextureUploadEntry(0, 0, desc));
            }
            QRhiTextureUploadDescription upload;
            upload.setEntries(entries.cbegin(), entries.cend());
            updates->uploadTexture(m_texture.get(), upload);
            m_lastCopies = 1;
        }
        m_bar = bar;
        m_uploadedFrame = frame;
    }
    LayerFrame out;
    out.cpuCopies = m_lastCopies;
    m_lastCopies = 0;
    out.format = LayerFrame::Format::Rgba8Premultiplied;
    out.planes[0] = m_texture.get();
    out.size = m_size;
    return out;
}

}  // namespace nt
