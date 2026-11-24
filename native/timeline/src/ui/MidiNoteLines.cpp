#include "MidiNoteLines.h"

#include "Tempo/TempoGrid.h"
#include "Tempo/TempoJson.h"
#include "model/TimelineModel.h"

#include <QJsonObject>
#include <QSGGeometry>
#include <QSGGeometryNode>
#include <QSGVertexColorMaterial>
#include <QImage>
#include <QPainter>
#include <QQuickWindow>
#include <QSGImageNode>
#include <QSGRendererInterface>
#include <QSGTexture>

#include <algorithm>
#include <cmath>

namespace nt::ui {

double noteLineThickness(double heightPx) { return heightPx < kShortBodyPx ? 1.0 : 2.0; }

std::vector<NoteLine> computeNoteLines(const QJsonArray& notes, const NoteLineView& view) {
    std::vector<NoteLine> out;
    if (view.widthPx <= 0 || view.heightPx <= 0 || view.msPerPx <= 0 || view.bpm <= 0) { return out; }
    const double periodPx = view.loopLengthMs / view.msPerPx;
    if (periodPx > 0 && periodPx < view.widthPx && std::isfinite(periodPx)) {
        const double from = std::max(0.0, view.fromPx);
        const double to = std::min(view.widthPx, view.toPx);
        auto window = view;
        window.loopLengthMs = 0;
        window.widthPx = periodPx;
        window.fromPx = 0;
        window.toPx = periodPx;
        const auto sourceLines = computeNoteLines(notes, window);
        const double stride = std::max(1.0, std::ceil(1.0 / periodPx));
        for (double repeat = std::floor(from / periodPx); repeat * periodPx < to; repeat += stride) {
            const double offset = repeat * periodPx;
            const double end = std::min(offset + periodPx, view.widthPx);
            for (auto line : sourceLines) {
                line.rect.translate(offset, 0);
                const double right = std::min(end, line.rect.right());
                if (line.rect.left() >= right || right < from || line.rect.left() > to) { continue; }
                line.rect.setRight(right);
                line.repeated = repeat > 0;
                out.push_back(line);
            }
        }
        return out;
    }
    const double msPerTick = 60000.0 / (view.bpm * nt::tempo::MIDI_PPQ);
    const double windowEndMs = view.inPointMs + view.widthPx * view.msPerPx;
    struct Hit { double x0, x1; int pitch; bool muted; };
    std::vector<Hit> hits;
    hits.reserve(static_cast<size_t>(notes.size()));
    int lowest = 127;
    int highest = 0;
    for (const auto& entry : notes) {
        const QJsonObject n = entry.toObject();
        const double startTick = n.value(QLatin1String("startTick")).toDouble(-1.0);
        const double durationTick = n.value(QLatin1String("durationTick")).toDouble(0.0);
        if (!std::isfinite(startTick) || startTick < 0.0 || !std::isfinite(durationTick) || durationTick <= 0.0) { continue; }
        const double startMs = startTick * msPerTick;
        if (startMs < view.inPointMs || startMs >= windowEndMs) { continue; }
        const int pitch = std::clamp(n.value(QLatin1String("pitch")).toInt(60), 0, 127);
        lowest = std::min(lowest, pitch);
        highest = std::max(highest, pitch);
        const double x0 = (startMs - view.inPointMs) / view.msPerPx;
        const double x1 = std::min(view.widthPx, x0 + durationTick * msPerTick / view.msPerPx);
        hits.push_back({x0, x1, pitch, n.value(QLatin1String("muted")).toBool(false)});
    }
    const double thickness = noteLineThickness(view.heightPx);
    const double usable = std::max(0.0, view.heightPx - 2 * view.marginPx - thickness);
    out.reserve(hits.size());
    for (const Hit& h : hits) {
        // Wholly outside the drawn part: nothing to draw.
        if (h.x1 < view.fromPx || h.x0 > view.toPx) { continue; }
        double x0 = h.x0;
        double x1 = h.x1;
        if (x1 - x0 < view.minLengthPx) {
            x1 = std::min(view.widthPx, x0 + view.minLengthPx);
            x0 = std::max(0.0, x1 - view.minLengthPx);
        }
        const double top = highest == lowest
            ? (view.heightPx - thickness) / 2
            : view.marginPx + (static_cast<double>(highest - h.pitch) / (highest - lowest)) * usable;
        out.push_back({QRectF(x0, std::round(top), x1 - x0, thickness), h.muted});
    }
    return out;
}

std::vector<CurveSegment> computeControllerCurve(const QJsonArray& lanes, const NoteLineView& view) {
    const double periodPx = view.msPerPx > 0 ? view.loopLengthMs / view.msPerPx : 0;
    if (periodPx > 0 && periodPx < view.widthPx && std::isfinite(periodPx)) {
        std::vector<CurveSegment> result;
        const double from = std::max(0.0, view.fromPx);
        const double to = std::min(view.widthPx, view.toPx);
        const double stride = std::max(1.0, std::ceil(1.0 / periodPx));
        for (double repeat = std::floor(from / periodPx); repeat * periodPx < to; repeat += stride) {
            const double offset = repeat * periodPx;
            auto window = view;
            window.loopLengthMs = 0;
            window.widthPx = std::min(periodPx, view.widthPx - offset);
            window.fromPx = std::max(0.0, from - offset);
            window.toPx = std::min(window.widthPx, to - offset);
            for (auto segment : computeControllerCurve(lanes, window)) {
                segment.from.rx() += offset;
                segment.to.rx() += offset;
                result.push_back(segment);
            }
        }
        return result;
    }
    std::vector<CurveSegment> out;
    if (view.widthPx <= 0 || view.heightPx <= 0 || view.msPerPx <= 0 || view.bpm <= 0) { return out; }
    QJsonObject lane;
    for (const auto& entry : lanes) {
        if (!entry.toObject().value(QLatin1String("points")).toArray().isEmpty()) {
            lane = entry.toObject();
            break;
        }
    }
    if (lane.isEmpty()) { return out; }
    struct Pt { double tick; double value; };
    std::vector<Pt> pts;
    for (const auto& pe : lane.value(QLatin1String("points")).toArray()) {
        const QJsonObject p = pe.toObject();
        const double tick = p.value(QLatin1String("tick")).toDouble(-1.0);
        if (std::isfinite(tick) && tick >= 0.0) { pts.push_back({tick, p.value(QLatin1String("value")).toDouble(0)}); }
    }
    if (pts.empty()) { return out; }
    std::stable_sort(pts.begin(), pts.end(), [](const Pt& a, const Pt& b) { return a.tick < b.tick; });
    const bool step = lane.value(QLatin1String("interpolation")).toString() == QLatin1String("step");
    const bool bend = lane.value(QLatin1String("kind")).toString() == QLatin1String("pitchBend");
    const double lo = bend ? -8192 : 0;
    const double hi = bend ? 8191 : 127;
    const double msPerTick = 60000.0 / (view.bpm * nt::tempo::MIDI_PPQ);
    const double startTick = view.inPointMs / msPerTick;
    const double endTick = (view.inPointMs + view.widthPx * view.msPerPx) / msPerTick;
    if (pts.front().tick >= endTick) { return out; }
    // The value at a tick at or after the first point.
    const auto valueAt = [&](double tick) {
        size_t i = 0;
        while (i + 1 < pts.size() && pts[i + 1].tick <= tick) { ++i; }
        if (step || i + 1 >= pts.size() || pts[i + 1].tick == pts[i].tick) { return pts[i].value; }
        return pts[i].value + (pts[i + 1].value - pts[i].value) * (tick - pts[i].tick) / (pts[i + 1].tick - pts[i].tick);
    };
    const double usable = std::max(0.0, view.heightPx - 2 * view.marginPx);
    const auto at = [&](double tick, double value) {
        const double x = (tick * msPerTick - view.inPointMs) / view.msPerPx;
        const double y = view.marginPx + (hi - std::clamp(value, lo, hi)) / (hi - lo) * usable;
        return QPointF(x, y);
    };
    std::vector<QPointF> verts;
    const double t0 = std::max(pts.front().tick, startTick);
    double previous = valueAt(t0);
    verts.push_back(at(t0, previous));
    for (const Pt& p : pts) {
        if (p.tick <= t0 || p.tick >= endTick) { continue; }
        if (step) { verts.push_back(at(p.tick, previous)); }
        verts.push_back(at(p.tick, p.value));
        previous = p.value;
    }
    verts.push_back(at(endTick, valueAt(endTick)));
    for (size_t i = 1; i < verts.size(); ++i) {
        const CurveSegment seg{verts[i - 1], verts[i]};
        if (seg.from == seg.to) { continue; }
        if (std::max(seg.from.x(), seg.to.x()) < view.fromPx || std::min(seg.from.x(), seg.to.x()) > view.toPx) { continue; }
        out.push_back(seg);
    }
    return out;
}

MidiNoteLinesItem::MidiNoteLinesItem(QQuickItem* parent) : QQuickItem(parent) { setFlag(ItemHasContents); }

void MidiNoteLinesItem::markDirty() {
    m_dirty = true;
    update();
}

void MidiNoteLinesItem::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    QObject::disconnect(m_clipsConnection);
    m_timeline = timeline;
    if (m_timeline) {
        m_clipsConnection = connect(m_timeline, &TimelineModel::clipsChanged, this, &MidiNoteLinesItem::markDirty);
    }
    emit timelineChanged();
    markDirty();
}
void MidiNoteLinesItem::setClipId(const QString& id) {
    if (m_clipId == id) { return; }
    m_clipId = id;
    emit clipIdChanged();
    markDirty();
}
void MidiNoteLinesItem::setMsPerPx(double v) {
    if (m_msPerPx == v) { return; }
    m_msPerPx = v;
    emit viewChanged();
    markDirty();
}
void MidiNoteLinesItem::setVisibleFromPx(double v) {
    if (m_from == v) { return; }
    m_from = v;
    emit viewChanged();
    markDirty();
}
void MidiNoteLinesItem::setVisibleToPx(double v) {
    if (m_to == v) { return; }
    m_to = v;
    emit viewChanged();
    markDirty();
}
void MidiNoteLinesItem::setColor(const QColor& c) {
    if (m_color == c) { return; }
    m_color = c;
    emit colorChanged();
    markDirty();
}
void MidiNoteLinesItem::setMutedColor(const QColor& c) {
    if (m_mutedColor == c) { return; }
    m_mutedColor = c;
    emit colorChanged();
    markDirty();
}

void MidiNoteLinesItem::geometryChange(const QRectF& newGeometry, const QRectF& oldGeometry) {
    QQuickItem::geometryChange(newGeometry, oldGeometry);
    if (newGeometry.size() != oldGeometry.size()) { markDirty(); }
}

NoteLineView MidiNoteLinesItem::currentView(const nt::Clip& clip) const {
    NoteLineView view;
    view.bpm = nt::tempo::json::tempo(nt::tempo::json::resolveTempo(m_timeline->timeline().raw)).bpm;
    view.inPointMs = std::max(0.0, clip.inPointMs);
    view.msPerPx = m_msPerPx;
    view.widthPx = width();
    view.loopLengthMs = clip.raw.value("loopLengthMs").toDouble();
    view.heightPx = height();
    view.fromPx = m_from;
    view.toPx = m_to > m_from ? m_to : width();
    return view;
}

std::vector<NoteLine> MidiNoteLinesItem::build() const {
    if (!m_timeline || m_clipId.isEmpty()) { return {}; }
    const nt::Clip* clip = m_timeline->findClip(m_clipId);
    if (!clip || clip->mediaType != nt::MediaType::Midi) { return {}; }
    return computeNoteLines(clip->raw.value(QLatin1String("notes")).toArray(), currentView(*clip));
}

std::vector<CurveSegment> MidiNoteLinesItem::buildCurve() const {
    if (!m_timeline || m_clipId.isEmpty()) { return {}; }
    const nt::Clip* clip = m_timeline->findClip(m_clipId);
    if (!clip || clip->mediaType != nt::MediaType::Midi) { return {}; }
    return computeControllerCurve(clip->raw.value(QLatin1String("controllers")).toArray(), currentView(*clip));
}

QVariantList MidiNoteLinesItem::curve() const {
    QVariantList out;
    for (const CurveSegment& s : buildCurve()) {
        out.append(QVariantMap{{"x0", s.from.x()}, {"y0", s.from.y()}, {"x1", s.to.x()}, {"y1", s.to.y()}});
    }
    return out;
}

QVariantList MidiNoteLinesItem::lines() const {
    QVariantList out;
    for (const NoteLine& l : build()) {
        out.append(QVariantMap{{"x", l.rect.x()}, {"y", l.rect.y()}, {"width", l.rect.width()},
                               {"height", l.rect.height()}, {"muted", l.muted}, {"repeated", l.repeated}});
    }
    return out;
}

namespace {
struct Rgba { unsigned char r, g, b, a; };
// The vertex colour material blends premultiplied colours.
Rgba premultiplied(const QColor& c) {
    const double a = c.alphaF();
    return {static_cast<unsigned char>(std::lround(c.redF() * a * 255)),
            static_cast<unsigned char>(std::lround(c.greenF() * a * 255)),
            static_cast<unsigned char>(std::lround(c.blueF() * a * 255)),
            static_cast<unsigned char>(std::lround(a * 255))};
}
}  // namespace

// The software scene graph draws no custom geometry, so there the lines are
// painted into an image of the visible window.
QSGNode* MidiNoteLinesItem::softwarePaintNode(QSGNode* old, const std::vector<NoteLine>& lines,
                                              const std::vector<CurveSegment>& curve) {
    const double from = std::clamp(m_from, 0.0, width());
    const double to = std::clamp(m_to > m_from ? m_to : width(), from, width());
    const QSize size(int(std::ceil(to - from)), int(std::ceil(height())));
    if (size.isEmpty() || (lines.empty() && curve.empty())) {
        delete old;
        return nullptr;
    }
    const qreal dpr = window()->effectiveDevicePixelRatio();
    QImage image(size * dpr, QImage::Format_ARGB32_Premultiplied);
    image.setDevicePixelRatio(dpr);
    image.fill(Qt::transparent);
    {
        QPainter painter(&image);
        painter.translate(-from, 0);
        for (const NoteLine& l : lines) { painter.fillRect(l.rect, l.muted || l.repeated ? m_mutedColor : m_color); }
        QColor curveColor = m_color;
        curveColor.setAlphaF(m_color.alphaF() * 0.7);
        painter.setPen(QPen(curveColor, 1));
        painter.setRenderHint(QPainter::Antialiasing);
        for (const CurveSegment& s : curve) { painter.drawLine(s.from, s.to); }
    }
    auto* node = static_cast<QSGImageNode*>(old);
    if (!node) {
        // The scene graph owns the node; the node owns its texture.
        node = window()->createImageNode();
        node->setOwnsTexture(true);
    }
    node->setTexture(window()->createTextureFromImage(image, QQuickWindow::TextureHasAlphaChannel));
    node->setRect(QRectF(from, 0, size.width(), size.height()));
    return node;
}

QSGNode* MidiNoteLinesItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    if (!m_dirty && old) { return old; }
    m_dirty = false;
    ++m_paintCount;
    const std::vector<NoteLine> lines = build();
    const std::vector<CurveSegment> curve = buildCurve();
    if (window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software) {
        QSGNode* result = softwarePaintNode(old, lines, curve);
        QMetaObject::invokeMethod(this, &MidiNoteLinesItem::painted, Qt::QueuedConnection);
        return result;
    }
    auto* node = static_cast<QSGGeometryNode*>(old);
    if (!node) {
        // The scene graph owns the node, its geometry and its material.
        node = new QSGGeometryNode;
        auto* geometry = new QSGGeometry(QSGGeometry::defaultAttributes_ColoredPoint2D(), 0);
        geometry->setDrawingMode(QSGGeometry::DrawTriangles);
        node->setGeometry(geometry);
        node->setFlag(QSGNode::OwnsGeometry);
        auto* material = new QSGVertexColorMaterial;
        node->setMaterial(material);
        node->setFlag(QSGNode::OwnsMaterial);
    }
    QSGGeometry* geometry = node->geometry();
    geometry->allocate(static_cast<int>(lines.size() + curve.size()) * 6);
    QSGGeometry::ColoredPoint2D* v = geometry->vertexDataAsColoredPoint2D();
    const Rgba normal = premultiplied(m_color);
    const Rgba dim = premultiplied(m_mutedColor);
    for (const NoteLine& l : lines) {
        const Rgba c = l.muted || l.repeated ? dim : normal;
        const float x0 = float(l.rect.left()), x1 = float(l.rect.right());
        const float y0 = float(l.rect.top()), y1 = float(l.rect.bottom());
        v[0].set(x0, y0, c.r, c.g, c.b, c.a);
        v[1].set(x1, y0, c.r, c.g, c.b, c.a);
        v[2].set(x0, y1, c.r, c.g, c.b, c.a);
        v[3].set(x1, y0, c.r, c.g, c.b, c.a);
        v[4].set(x1, y1, c.r, c.g, c.b, c.a);
        v[5].set(x0, y1, c.r, c.g, c.b, c.a);
        v += 6;
    }
    // The curve: 1 px wide, the note color at 70 % opacity.
    QColor curveColor = m_color;
    curveColor.setAlphaF(m_color.alphaF() * 0.7);
    const Rgba cc = premultiplied(curveColor);
    for (const CurveSegment& s : curve) {
        const double dx = s.to.x() - s.from.x();
        const double dy = s.to.y() - s.from.y();
        const double len = std::hypot(dx, dy);
        const float nx = float(-dy / len * 0.5), ny = float(dx / len * 0.5);
        const float ax = float(s.from.x()) + nx, ay = float(s.from.y()) + ny;
        const float bx = float(s.from.x()) - nx, by = float(s.from.y()) - ny;
        const float cx = float(s.to.x()) + nx, cy = float(s.to.y()) + ny;
        const float dxx = float(s.to.x()) - nx, dyy = float(s.to.y()) - ny;
        v[0].set(ax, ay, cc.r, cc.g, cc.b, cc.a);
        v[1].set(cx, cy, cc.r, cc.g, cc.b, cc.a);
        v[2].set(bx, by, cc.r, cc.g, cc.b, cc.a);
        v[3].set(cx, cy, cc.r, cc.g, cc.b, cc.a);
        v[4].set(dxx, dyy, cc.r, cc.g, cc.b, cc.a);
        v[5].set(bx, by, cc.r, cc.g, cc.b, cc.a);
        v += 6;
    }
    node->markDirty(QSGNode::DirtyGeometry);
    QMetaObject::invokeMethod(this, &MidiNoteLinesItem::painted, Qt::QueuedConnection);
    return node;
}

}  // namespace nt::ui
