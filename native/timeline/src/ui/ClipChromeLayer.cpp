#include "ClipChromeLayer.h"
#include "ui/TimelineFormat.h"
#include <QFontMetricsF>
#include <QJsonArray>
#include <QThread>
#include <QMetaMethod>
#include <QMetaProperty>
#include <algorithm>
#include <cmath>
#include <utility>

namespace {
QColor alpha(QColor color, double opacity) { color.setAlphaF(color.alphaF()*opacity); return color; }
QColor tint(const QColor& base, const QColor& over) {
    const double a = over.alphaF() + base.alphaF()*(1-over.alphaF());
    if (a <= 0) { return Qt::transparent; }
    const auto blend = [&](double b, double o) { return (o*over.alphaF()+b*base.alphaF()*(1-over.alphaF()))/a; };
    return QColor::fromRgbF(blend(base.redF(),over.redF()),blend(base.greenF(),over.greenF()),blend(base.blueF(),over.blueF()),a);
}
}
ClipChromeLayer::ClipChromeLayer(QQuickItem* parent) : SceneLayerItem(parent) {
    connect(this, &ClipChromeLayer::detailChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::backgroundOnlyChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::videoFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::audioFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::overlayFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::midiFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::adjustmentFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::fallbackFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::canvasChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::outlineColorChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::inkChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::fxFillChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::fxInkChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::nameStyleChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::durationStyleChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::bandHeightChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::smallChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::mediumChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::microChanged, this, &SceneLayerItem::requestPaint);
    connect(this, &ClipChromeLayer::darkChanged, this, &SceneLayerItem::requestPaint);
}
void ClipChromeLayer::setDetail(QObject* detail) {
    if (m_detail == detail) { return; }
    if (m_detail) { disconnect(m_detail, nullptr, this, nullptr); }
    m_detail = detail;
    if (detail) {
        connect(detail, &QObject::destroyed, this, &SceneLayerItem::requestPaint);
        const auto paint = metaObject()->method(metaObject()->indexOfMethod("requestPaint()"));
        // ClipBody is a GUI-owned QML object. Observe scalar properties here
        // and copy their values in prepare(), never on the render thread.
        for (const char* name : {"fill", "bodyFill", "selected", "name", "durationMs", "hasEffects", "visible", "layerChrome", "interactiveDetails"}) {
            const int index = detail->metaObject()->indexOfProperty(name);
            if (index < 0) { continue; }
            const auto property = detail->metaObject()->property(index);
            if (property.hasNotifySignal()) { connect(detail, property.notifySignal(), this, paint); }
        }
    }
    emit detailChanged();
}
void ClipChromeLayer::setNameStyle(QObject* style) {
    if (m_nameStyle == style) { return; }
    if (m_nameStyle && m_nameStyle != m_durationStyle) { disconnect(m_nameStyle, nullptr, this, nullptr); }
    m_nameStyle = style;
    if (style) {
        connect(style, &QObject::destroyed, this, &SceneLayerItem::requestPaint, Qt::UniqueConnection);
        const int index = style->metaObject()->indexOfProperty("font");
        if (index >= 0) {
            const auto property = style->metaObject()->property(index);
            const auto paint = metaObject()->method(metaObject()->indexOfMethod("requestPaint()"));
            if (property.hasNotifySignal()) { connect(style, property.notifySignal(), this, paint, Qt::UniqueConnection); }
        }
    }
    emit nameStyleChanged();
}
void ClipChromeLayer::setDurationStyle(QObject* style) {
    if (m_durationStyle == style) { return; }
    if (m_durationStyle && m_durationStyle != m_nameStyle) { disconnect(m_durationStyle, nullptr, this, nullptr); }
    m_durationStyle = style;
    if (style) {
        connect(style, &QObject::destroyed, this, &SceneLayerItem::requestPaint, Qt::UniqueConnection);
        const int index = style->metaObject()->indexOfProperty("font");
        if (index >= 0) {
            const auto property = style->metaObject()->property(index);
            const auto paint = metaObject()->method(metaObject()->indexOfMethod("requestPaint()"));
            if (property.hasNotifySignal()) { connect(style, property.notifySignal(), this, paint, Qt::UniqueConnection); }
        }
    }
    emit durationStyleChanged();
}
void ClipChromeLayer::setModel(LaneClipModel* model) {
    if (model == m_model) { return; }
    if (m_model) { disconnect(m_model, nullptr, this, nullptr); }
    m_model = model;
    if (m_model) {
        connect(model, &QObject::destroyed, this, &SceneLayerItem::requestPaint);
        m_modelRevision = model->rebuildCount();
        const QPointer<ClipChromeLayer> self(this);
        connect(model, &LaneClipModel::recomputed, this, [self] {
            if (self && self->m_model && self->m_modelRevision != self->m_model->rebuildCount()) {
                self->m_modelRevision = self->m_model->rebuildCount();
                self->requestPaint();
            }
        });
    }
    requestPaint(); emit modelChanged();
}
void ClipChromeLayer::setViewState(TimelineViewState* view) {
    if (view == m_view) { return; }
    if (m_view) { disconnect(m_view, nullptr, this, nullptr); }
    m_view = view;
    if (view) {
        connect(view, &QObject::destroyed, this, &SceneLayerItem::requestPaint);
        connect(view, &TimelineViewState::scrollLeftPxChanged, this, &ClipChromeLayer::updateRange);
        connect(view, &TimelineViewState::viewportChanged, this, &ClipChromeLayer::updateRange);
        connect(view, &TimelineViewState::msPerPxChanged, this, &ClipChromeLayer::updateRange);
    }
    m_scale = 0; updateRange(); requestPaint(); emit viewStateChanged();
}
void ClipChromeLayer::updateRange() {
    if (!m_view) { return; }
    const double left = m_view->scrollLeftPx(), viewport = m_view->viewportWidthPx();
    if (m_scale == m_view->msPerPx() && left >= x() && left+viewport <= x()+width()) { return; }
    m_scale = m_view->msPerPx();
    const double margin = std::max(320.0, viewport);
    setX(std::max(0.0,left-margin));
    setWidth(left+viewport+margin-x());
    requestPaint();
}
void ClipChromeLayer::setDetailed(const QString& id, bool detailed) {
    if (id.isEmpty()) { return; }
    if (detailed == m_details.contains(id)) { return; }
    if (detailed) { m_details.insert(id); } else { m_details.remove(id); }
    requestPaint();
}
void ClipChromeLayer::prepare() {
    Q_ASSERT(QThread::currentThread() == thread());
    ++m_buildCount; m_clipCount = 0;
    if (m_detail && (!m_detail->property("visible").toBool()
        || (m_detail->property("layerChrome").toBool() && !m_detail->property("interactiveDetails").toBool()))) {
        return;
    }
    const QFont nameFont = m_nameStyle ? m_nameStyle->property("font").value<QFont>() : QFont();
    const QFont durationFont = m_durationStyle ? m_durationStyle->property("font").value<QFont>() : QFont();
    if (m_detail) {
        const bool selected = m_detail->property("selected").toBool();
        Chrome clip;
        clip.name = m_detail->property("name").toString();
        clip.durationMs = m_detail->property("durationMs").toDouble();
        clip.width = width();
        clip.band = m_detail->property("fill").value<QColor>();
        clip.body = m_detail->property("bodyFill").value<QColor>();
        if (selected) { clip.band = clip.band.lighter(118); clip.body = clip.body.lighter(118); }
        clip.border = m_outlineColor;
        clip.borderWidth = selected ? 1.5 : 1;
        clip.hasEffects = m_detail->property("hasEffects").toBool();
        drawChrome(clip, nameFont, durationFont, m_backgroundOnly, !m_backgroundOnly);
        return;
    }
    const auto* timeline = m_model ? m_model->timeline() : nullptr;
    if (!timeline || !m_view || m_scale <= 0) {
        if (!m_overlaps.isEmpty()) { m_overlaps.clear(); ++m_overlapRevision; emit overlapsChanged(); }
        if (m_coversLane) { m_coversLane = false; emit coversLaneChanged(); }
        return;
    }
    // Share the model's immutable snapshot during GUI notifications, which
    // can replace the document. Drawing commands retain values, never clips.
    const auto snapshot = timeline->snapshot();
    std::vector<const nt::Clip*> rows;
    for (const auto index : timeline->trackClipIndices(m_model->trackId())) {
        rows.push_back(&snapshot->clips[index]);
    }
    QSet<QString> overlaps;
    size_t groupStart = 0;
    double groupEnd = -1;
    const auto finishGroup = [&](size_t end) {
        if (end - groupStart > 1) {
            for (size_t i = groupStart; i < end; ++i) { overlaps.insert(QString::fromStdString(rows[i]->id)); }
        }
    };
    for (size_t i = 0; i < rows.size(); ++i) {
        if (rows[i]->startMs >= groupEnd) {
            finishGroup(i);
            groupStart = i;
        }
        groupEnd = std::max(groupEnd, rows[i]->endMs());
    }
    finishGroup(rows.size());
    if (overlaps != m_overlaps) {
        m_overlaps = std::move(overlaps);
        ++m_overlapRevision;
        emit overlapsChanged();
    }
    const bool covers = m_overlaps.isEmpty();
    if (covers != m_coversLane) { m_coversLane = covers; emit coversLaneChanged(); }
    for (const auto& row : rows) {
        const auto id = QString::fromStdString(row->id);
        // Only overlapping participants need interleaved QML chrome/content.
        // Other clips in the lane keep the cached scene-graph drawing.
        if (m_details.contains(id) || m_overlaps.contains(id)) { continue; }
        const double left = row->startMs/m_scale-x(), w = std::max(4.0,row->durationMs/m_scale);
        if (left+w <= 0 || left >= width()) { continue; }
        ++m_clipCount;
        QColor base(row->raw.value("labelColor").toString());
        if (!base.isValid()) {
            switch (row->mediaType) {
            case nt::MediaType::Image: case nt::MediaType::Video: base = m_videoFill; break;
            case nt::MediaType::Audio: base = m_audioFill; break;
            case nt::MediaType::Overlay: case nt::MediaType::Text:
            case nt::MediaType::Shape: case nt::MediaType::Group: base = m_overlayFill; break;
            case nt::MediaType::Midi: base = m_midiFill; break;
            case nt::MediaType::Adjustment: base = m_adjustmentFill; break;
            case nt::MediaType::Model3d: base = m_fallbackFill; break;
            }
        }
        QColor band = QColor::fromHslF(base.hslHueF(),std::min(base.hslSaturationF(),0.85F)*(m_dark?0.5F:0.55F),m_dark?0.4F:0.62F,base.alphaF());
        const QColor body = tint(band,alpha(m_canvas,m_dark?0.5:0.62));
        Chrome clip;
        clip.name = QString::fromStdString(row->name);
        clip.durationMs = row->durationMs;
        clip.left = left;
        clip.width = w;
        clip.opacity = row->hidden ? 0.4 : 1;
        clip.band = band;
        clip.body = body;
        clip.border = band.darker(160);
        clip.hasEffects = !row->raw.value("effects").toArray().isEmpty();
        drawChrome(clip, nameFont, durationFont, true, true);
    }
}
void ClipChromeLayer::drawChrome(const Chrome& clip, const QFont& nameFont, const QFont& durationFont,
                                 bool background, bool foreground) {
    const auto boundedRect = [&](QRectF r, QColor color) {
        rect(r.intersected(QRectF(0, 0, width(), height())), alpha(color, clip.opacity));
    };
    const double left = clip.left, w = clip.width;
    if (background) {
        boundedRect({left, 0, w, height()}, clip.body);
        boundedRect({left, 0, w, m_bandHeight}, clip.band);
    }
    if (!foreground) { return; }
    const double border = clip.borderWidth;
    boundedRect({left, 0, w, border}, clip.border);
    boundedRect({left, height() - border, w, border}, clip.border);
    boundedRect({left, 0, border, height()}, clip.border);
    boundedRect({left + w - border, 0, border, height()}, clip.border);
    const QFontMetricsF nameMetrics(nameFont), durationMetrics(durationFont);
    double nameLeft = left + m_small;
    if (clip.hasEffects) {
        const double badgeWidth = durationMetrics.horizontalAdvance("fx") + 2 * m_micro;
        boundedRect({nameLeft, (m_bandHeight - 11) / 2, badgeWidth, 11}, m_fxFill);
        label("fx", {nameLeft + m_micro, (m_bandHeight - durationMetrics.height()) / 2},
              durationFont, alpha(m_fxInk, clip.opacity));
        nameLeft += badgeWidth + m_small;
    }
    double nameRight = left + w - m_medium;
    if (w >= 96) {
        const auto duration = nt::ui::formatClipDuration(clip.durationMs);
        const double durationLeft = left + w - m_small - durationMetrics.horizontalAdvance(duration);
        label(duration, {durationLeft, (m_bandHeight - durationMetrics.height()) / 2},
              durationFont, alpha(m_ink, clip.opacity * 0.7));
        nameRight = durationLeft - m_small;
    }
    const auto text = nameMetrics.elidedText(clip.name, Qt::ElideRight, std::max(0.0, nameRight - nameLeft));
    label(text, {nameLeft, (m_bandHeight - nameMetrics.height()) / 2}, nameFont, alpha(m_ink, clip.opacity));
}
