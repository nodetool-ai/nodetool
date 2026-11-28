#include "NoteLayerItem.h"

#include <QFontMetricsF>
#include <QPainter>
#include <QPainterPath>
#include <QQuickWindow>
#include <QSet>
#include <QThread>
#include <QSGGeometryNode>
#include <QSGImageNode>
#include <QSGRendererInterface>
#include <QSGTexture>
#include <QSGTransformNode>
#include <QSGVertexColorMaterial>

#include <algorithm>
#include <cmath>
#include <memory>

namespace {
bool blackKey(int pitch) { return pitch % 12 == 1 || pitch % 12 == 3 || pitch % 12 == 6 || pitch % 12 == 8 || pitch % 12 == 10; }
QString pitchName(int pitch) {
    constexpr std::array names{"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    return QString::fromLatin1(names[static_cast<std::size_t>((pitch % 12 + 12) % 12)]) + QString::number(static_cast<int>(std::floor(pitch / 12.0)) - 1);
}
QColor mix(const QColor& a, const QColor& b, double amount) {
    return QColor(static_cast<int>(std::round(a.red() + (b.red() - a.red()) * amount)),
                  static_cast<int>(std::round(a.green() + (b.green() - a.green()) * amount)),
                  static_cast<int>(std::round(a.blue() + (b.blue() - a.blue()) * amount)));
}
QColor alpha(QColor color, double opacity) { color.setAlphaF(color.alphaF() * opacity); return color; }
QColor velocityColor(int velocity) {
    constexpr std::array<std::array<int, 4>, 7> stops{{{1,110,91,216}, {32,62,123,224}, {56,63,180,200}, {80,108,191,78}, {100,201,195,63}, {114,224,135,58}, {127,224,69,58}}};
    const int value = std::clamp(velocity, 1, 127);
    for (std::size_t i = 1; i < stops.size(); ++i) {
        const auto& lo = stops[i - 1]; const auto& hi = stops[i];
        if (value <= hi[0]) { return mix(QColor(lo[1], lo[2], lo[3]), QColor(hi[1], hi[2], hi[3]), double(value - lo[0]) / (hi[0] - lo[0])); }
    }
    return {};
}

// Render thread only. The scene graph owns this node and its children.
struct LayerNode : QSGNode {
    LayerNode() = default;
    LayerNode(const LayerNode&) = delete;
    LayerNode& operator=(const LayerNode&) = delete;
    LayerNode(LayerNode&&) = delete;
    LayerNode& operator=(LayerNode&&) = delete;
    ~LayerNode() override {
        // Image nodes borrow the texture and must die before its RAII owner.
        while (firstChild()) {
            auto child = std::unique_ptr<QSGNode>(firstChild());
            removeChildNode(child.get());
        }
    }
    std::unique_ptr<QSGTexture> texture;
    std::vector<std::unique_ptr<QSGTexture>> textTextures;
};
// Render thread only. Retained ranges and revision flags belong to the node,
// never to a GUI-thread callback.
struct NoteRoot : QSGTransformNode {
    double tick = 0;
    int pitch = 0;
    int row = 0;
    double span = 0;
    int rows = 0;
    bool dragging = false;
    QString kind;
    LayerNode* background = nullptr;
    LayerNode* notes = nullptr;
    LayerNode* overlay = nullptr;
};

// Render thread only. Values are copied from the item in updatePaintNode.
class Drawing {
public:
    Drawing(QRectF bounds, qreal dpr, bool software) : m_software(software), m_bounds(bounds) {
        const QSize size(static_cast<int>(std::ceil(bounds.width())), static_cast<int>(std::ceil(bounds.height())));
        if (software) {
            image = QImage(size * dpr, QImage::Format_ARGB32_Premultiplied);
            image.setDevicePixelRatio(dpr); image.fill(Qt::transparent);
            painter = std::make_unique<QPainter>(&image);
            painter->translate(-bounds.topLeft());
        }
    }
    void rect(double x, double y, double w, double h, const QColor& c) {
        if (c.alpha() == 0 || w <= 0 || h <= 0 || x+w < m_bounds.left() || x > m_bounds.right() || y+h < m_bounds.top() || y > m_bounds.bottom()) { return; }
        if (m_software) { painter->fillRect(QRectF(x, y, w, h), c); return; }
        vertex(x,y,c); vertex(x+w,y,c); vertex(x,y+h,c);
        vertex(x+w,y,c); vertex(x+w,y+h,c); vertex(x,y+h,c);
    }
    void rounded(double x, double y, double w, double h, double radius, const QColor& color) {
        if (w <= 0 || h <= 0) { return; }
        if (m_software) {
            QPainterPath shape; shape.addRoundedRect(QRectF(x,y,w,h), radius, radius); painter->fillPath(shape,color); return;
        }
        radius = std::clamp(radius,0.0,std::min(w,h)/2);
        const QPointF center(x+w/2,y+h/2);
        QPointF previous;
        QPointF first;
        constexpr double pi = 3.14159265358979323846;
        for (int corner = 0; corner < 4; ++corner) {
            const QPointF origin(x+(corner == 0 || corner == 3 ? w-radius : radius),y+(corner < 2 ? h-radius : radius));
            for (int segment = 0; segment <= 4; ++segment) {
                const double angle = (corner*0.5+segment/8.0)*pi;
                const QPointF point = origin+QPointF(radius*std::cos(angle),radius*std::sin(angle));
                if (corner == 0 && segment == 0) { first = point; }
                else { vertex(center.x(),center.y(),color); vertex(previous.x(),previous.y(),color); vertex(point.x(),point.y(),color); }
                previous = point;
            }
        }
        vertex(center.x(),center.y(),color); vertex(previous.x(),previous.y(),color); vertex(first.x(),first.y(),color);
    }
    void polyline(const std::vector<QPointF>& input, const QColor& color, double width = 1) {
        std::vector<QPointF> points;
        for (const auto& p : input) { if (points.empty() || points.back() != p) { points.push_back(p); } }
        if (points.size() < 2) { return; }
        if (m_software) {
            QPainterPath path; path.moveTo(points.front());
            for (std::size_t i = 1; i < points.size(); ++i) { path.lineTo(points[i]); }
            QPen pen(color,width); pen.setJoinStyle(Qt::MiterJoin); pen.setCapStyle(Qt::FlatCap); pen.setMiterLimit(10);
            painter->strokePath(path,pen); return;
        }
        const auto normal = [&](std::size_t i) {
            const auto delta = points[i+1]-points[i];
            const double length = std::hypot(delta.x(),delta.y());
            return QPointF(delta.y()/length,-delta.x()/length);
        };
        std::vector<QPointF> offsets(points.size());
        offsets.front() = normal(0)*(width/2);
        offsets.back() = normal(points.size()-2)*(width/2);
        for (std::size_t i = 1; i+1 < points.size(); ++i) {
            const auto a = normal(i-1), b = normal(i);
            const double denominator = 1+QPointF::dotProduct(a,b);
            auto offset = denominator > 0.000001 ? (a+b)*(width/(2*denominator)) : b*(width/2);
            const double length = std::hypot(offset.x(),offset.y());
            if (length > 5*width) { offset *= 5*width/length; }
            offsets[i] = offset;
        }
        for (std::size_t i = 1; i < points.size(); ++i) {
            for (const auto& p : {points[i-1]+offsets[i-1],points[i]+offsets[i],points[i-1]-offsets[i-1],
                                  points[i]+offsets[i],points[i]-offsets[i],points[i-1]-offsets[i-1]}) { vertex(p.x(),p.y(),color); }
        }
    }
    void circle(double x, double y, double radius, const QColor& color, double innerRadius = 0) {
        if (m_software) {
            QPainterPath shape; shape.addEllipse(QPointF(x,y),radius,radius);
            if (innerRadius > 0) { shape.addEllipse(QPointF(x,y),innerRadius,innerRadius); }
            painter->fillPath(shape,color); return;
        }
        constexpr double pi = 3.14159265358979323846;
        for (int segment = 0; segment < 24; ++segment) {
            const double a = segment*pi/12, b = (segment+1)*pi/12;
            const QPointF outerA(x+radius*std::cos(a),y+radius*std::sin(a)), outerB(x+radius*std::cos(b),y+radius*std::sin(b));
            const QPointF innerA(x+innerRadius*std::cos(a),y+innerRadius*std::sin(a)), innerB(x+innerRadius*std::cos(b),y+innerRadius*std::sin(b));
            for (const auto& p : {outerA,outerB,innerA,outerB,innerB,innerA}) { vertex(p.x(),p.y(),color); }
        }
    }

    void text(const QImage& mask, double advance, double x, double middle, const QColor& color, bool right = false) {
        if (mask.isNull()) { return; }
        if (right) { x -= advance; }
        QImage colored = mask;
        { QPainter tint(&colored); tint.setCompositionMode(QPainter::CompositionMode_SourceIn); tint.fillRect(colored.rect(), color); }
        const QPointF origin(std::round(x), std::round(middle - colored.deviceIndependentSize().height()/2));
        if (m_software) { painter->drawImage(origin,colored); }
        else { labels.push_back({std::move(colored),origin,vertices.size()}); }
    }
    std::unique_ptr<LayerNode> node(QQuickWindow& window) {
        auto result = std::make_unique<LayerNode>();
        if (m_software) {
            painter.reset();
            result->texture.reset(window.createTextureFromImage(image));
            auto imageNode = std::unique_ptr<QSGImageNode>(window.createImageNode());
            if (!result->texture || !imageNode) { return result; }
            imageNode->setTexture(result->texture.get());
            imageNode->setRect(QRectF(m_bounds.topLeft(), image.deviceIndependentSize()));
            result->appendChildNode(imageNode.release());
        }
        const auto appendGeometry = [&](std::size_t begin, std::size_t end) {
            if (begin == end) { return; }
            auto geometryNode = std::make_unique<QSGGeometryNode>();
            auto geometry = std::make_unique<QSGGeometry>(QSGGeometry::defaultAttributes_ColoredPoint2D(), static_cast<int>(end-begin));
            geometry->setDrawingMode(QSGGeometry::DrawTriangles);
            std::copy(vertices.begin()+static_cast<std::ptrdiff_t>(begin),vertices.begin()+static_cast<std::ptrdiff_t>(end),geometry->vertexDataAsColoredPoint2D());
            geometryNode->setGeometry(geometry.release()); geometryNode->setFlag(QSGNode::OwnsGeometry);
            geometryNode->setMaterial(std::make_unique<QSGVertexColorMaterial>().release()); geometryNode->setFlag(QSGNode::OwnsMaterial);
            result->appendChildNode(geometryNode.release());
        };
        std::size_t begin = 0;
        for (const auto& label : labels) {
            appendGeometry(begin,label.vertexEnd); begin = label.vertexEnd;
            auto texture = std::unique_ptr<QSGTexture>(window.createTextureFromImage(label.image));
            auto node = std::unique_ptr<QSGImageNode>(window.createImageNode());
            if (!texture || !node) { continue; }
            node->setTexture(texture.get());
            node->setRect(QRectF(label.origin,label.image.deviceIndependentSize()));
            result->textTextures.push_back(std::move(texture));
            result->appendChildNode(node.release());
        }
        appendGeometry(begin,vertices.size());
        return result;
    }
private:
    struct Label { QImage image; QPointF origin; std::size_t vertexEnd; };
    std::vector<Label> labels;
    void vertex(double x, double y, const QColor& c) {
        QSGGeometry::ColoredPoint2D v{};
        v.set(static_cast<float>(x), static_cast<float>(y),
              static_cast<uchar>(std::lround(c.red() * c.alphaF())), static_cast<uchar>(std::lround(c.green() * c.alphaF())),
              static_cast<uchar>(std::lround(c.blue() * c.alphaF())), static_cast<uchar>(c.alpha()));
        vertices.push_back(v);
    }
    bool m_software;
    QRectF m_bounds;
    QImage image;
    std::unique_ptr<QPainter> painter;
    std::vector<QSGGeometry::ColoredPoint2D> vertices;
};
void replaceLayer(NoteRoot& root, LayerNode*& old, std::unique_ptr<LayerNode> next) {
    std::unique_ptr<LayerNode> previous(old);
    auto* following = old ? old->nextSibling() : nullptr;
    if (old) { root.removeChildNode(old); }
    old = next.release();
    if (following) { root.insertChildNodeBefore(old,following); }
    else { root.appendChildNode(old); }
}
}

NoteLayerItem::NoteLayerItem(QQuickItem* parent) : QQuickItem(parent) {
    setFlag(ItemHasContents);
    connect(this, &NoteLayerItem::selectedIdsChanged, this, &NoteLayerItem::repaintNotes);
    connect(this, &NoteLayerItem::marqueeChanged, this, &NoteLayerItem::invalidateOverlay);
    connect(this, &NoteLayerItem::marqueeVisibleChanged, this, &NoteLayerItem::invalidateOverlay);
    for (const auto signal : {
        &NoteLayerItem::drawingKindChanged,
        &NoteLayerItem::collapsedChanged,
        &NoteLayerItem::pxPerTickChanged,
        &NoteLayerItem::rowHeightChanged,
        &NoteLayerItem::clipColorsChanged,
        &NoteLayerItem::noteLabelsChanged,
        &NoteLayerItem::darkChanged,
        &NoteLayerItem::stepTicksChanged,
        &NoteLayerItem::phaseTickChanged,
        &NoteLayerItem::marginChanged,
        &NoteLayerItem::pointSizeChanged,
        &NoteLayerItem::microChanged,
        &NoteLayerItem::labelMinWidthChanged,
        &NoteLayerItem::scaleInsetChanged,
        &NoteLayerItem::hoverPitchChanged,
        &NoteLayerItem::pressedPitchChanged,
        &NoteLayerItem::labelFontChanged,
        &NoteLayerItem::backgroundChanged,
        &NoteLayerItem::panelColorChanged,
        &NoteLayerItem::selectedColorChanged,
        &NoteLayerItem::borderSubtleChanged,
        &NoteLayerItem::borderStrongChanged,
        &NoteLayerItem::borderControlChanged,
        &NoteLayerItem::scrimChanged,
        &NoteLayerItem::textPrimaryChanged,
        &NoteLayerItem::textSecondaryChanged,
        &NoteLayerItem::textOnAccentChanged,
        &NoteLayerItem::accentChanged,
        &NoteLayerItem::accentSecondaryChanged,
        &NoteLayerItem::accentOutlineChanged,
        &NoteLayerItem::clipAccentChanged,
        &NoteLayerItem::selectedPointIdsChanged,
        &NoteLayerItem::curveMinChanged,
        &NoteLayerItem::curveMaxChanged,
        &NoteLayerItem::curveNeutralChanged,
        &NoteLayerItem::curveBaseTickChanged,
        &NoteLayerItem::curveEndTickChanged,
        &NoteLayerItem::expressionChanged,
        &NoteLayerItem::curveStepChanged}) {
        connect(this, signal, this, [this, signal] {
            if (signal == &NoteLayerItem::scaleInsetChanged && m_drawingKind != "scale") { return; }
            const bool notes = m_drawingKind == "notes" || m_drawingKind == "velocity";
            const bool rows = m_drawingKind == "notes" || m_drawingKind == "keyboard";
            if ((signal == &NoteLayerItem::rowHeightChanged || signal == &NoteLayerItem::collapsedChanged) && !rows) { return; }
            if ((signal == &NoteLayerItem::stepTicksChanged || signal == &NoteLayerItem::phaseTickChanged) && m_drawingKind != "notes" && m_drawingKind != "ruler") { return; }
            if ((signal == &NoteLayerItem::hoverPitchChanged || signal == &NoteLayerItem::pressedPitchChanged || signal == &NoteLayerItem::darkChanged) && m_drawingKind != "keyboard") { return; }
            if ((signal == &NoteLayerItem::clipColorsChanged || signal == &NoteLayerItem::clipAccentChanged || signal == &NoteLayerItem::noteLabelsChanged) && !notes) { return; }
            if ((signal == &NoteLayerItem::curveMinChanged || signal == &NoteLayerItem::curveMaxChanged || signal == &NoteLayerItem::curveNeutralChanged || signal == &NoteLayerItem::curveBaseTickChanged || signal == &NoteLayerItem::curveEndTickChanged || signal == &NoteLayerItem::expressionChanged || signal == &NoteLayerItem::curveStepChanged || signal == &NoteLayerItem::selectedPointIdsChanged) && m_drawingKind != "curve") { return; }
            if (notes && (signal == &NoteLayerItem::clipColorsChanged || signal == &NoteLayerItem::clipAccentChanged || signal == &NoteLayerItem::noteLabelsChanged)) { repaintNotes(); return; }
            requestPaint();
        });
    }
}
void NoteLayerItem::setCollapsePitches(const QList<int>& pitches) {
    if (m_collapsePitches == pitches) { return; }
    m_collapsePitches = pitches;
    if (m_drawingKind == "notes" || m_drawingKind == "keyboard") { requestPaint(); }
}
void NoteLayerItem::setCurvePoints(const QVariantList& points) {
    m_curvePoints.clear(); m_curvePoints.reserve(static_cast<std::size_t>(points.size()));
    for (const auto& value : points) {
        const auto p = value.toMap();
        m_curvePoints.push_back({p.value("id").toString(),p.value("tick").toDouble(),p.value("value").toDouble()});
    }
    requestPaint();
}
void NoteLayerItem::requestPaint() { m_dirty = true; polish(); update(); }
void NoteLayerItem::setController(PianoRollController* controller) {
    if (m_controller == controller) { return; }
    if (m_controller) { disconnect(m_controller, nullptr, this, nullptr); }
    m_controller = controller;
    if (controller) {
        connect(controller, &PianoRollController::notesChanged, this, &NoteLayerItem::invalidateNotes);
        connect(controller, &PianoRollController::clipChanged, this, &NoteLayerItem::invalidateClip);
        connect(controller, &PianoRollController::toolChanged, this, &NoteLayerItem::repaintNotes);
        connect(controller, &PianoRollController::noteDragChanged, this, &NoteLayerItem::invalidateOverlay);
        connect(controller, &QObject::destroyed, this, [this] { m_controller = nullptr; invalidateNotes(); invalidateClip(); requestPaint(); });
    }
    invalidateNotes(); invalidateClip(); requestPaint(); emit controllerChanged();
}
void NoteLayerItem::invalidateClip() {
    const ClipViewKey key = m_controller ? ClipViewKey{m_controller->valid(),m_controller->windowFromTick(),
        m_controller->windowToTick(),m_controller->gridStepTicks("beat"),m_controller->gridStepTicks("bar"),
        m_controller->timelineMsToTick(0)} : ClipViewKey{};
    if (m_clipViewKey == key) { return; }
    const bool validityChanged = m_clipViewKey.valid != key.valid;
    m_clipViewKey = key;
    if (validityChanged && m_drawingKind == "curve") { requestPaint(); }
    if (m_drawingKind == "notes" || m_drawingKind == "ruler") { requestPaint(); }
}
void NoteLayerItem::invalidateNotes() {
    m_indexDirty = true;
    m_snapshotNotesDirty = true;
    repaintNotes();
}
void NoteLayerItem::repaintNotes() {
    if (m_drawingKind == "notes" || m_drawingKind == "velocity") { m_notesDirty = true; polish(); update(); }
}
void NoteLayerItem::invalidateOverlay() {
    if (m_drawingKind == "notes" || m_drawingKind == "velocity") { m_overlayDirty = true; polish(); update(); }
}
void NoteLayerItem::prepareText(const QString& value) {
    if (m_text.contains(value)) { return; }
    const QFontMetricsF metrics(m_labelFont);
    const QFontMetrics pixels(m_labelFont);
    const double advance = metrics.horizontalAdvance(value);
    QImage image(QSize(static_cast<int>(std::ceil(advance+2)),pixels.height()+2)*m_rasterDpr,QImage::Format_ARGB32_Premultiplied);
    image.setDevicePixelRatio(m_rasterDpr); image.fill(Qt::transparent);
    { QPainter painter(&image); painter.setRenderHint(QPainter::TextAntialiasing); painter.setFont(m_labelFont); painter.setPen(Qt::white); painter.drawText(QPointF(0,1+pixels.ascent()),value); }
    m_text.insert(value,{std::move(image),advance,metrics.height()});
}
void NoteLayerItem::updatePolish() {
    Q_ASSERT(QThread::currentThread() == thread());
    m_valid = m_controller && m_controller->valid();
    if (m_snapshotNotesDirty) {
        m_renderNotes = m_valid ? m_controller->noteStorage() : nullptr;
        m_snapshotNotesDirty = false;
    }
    if (m_drawingKind == "notes" || m_drawingKind == "velocity") { rebuildIndex(); }
    m_toolNotes = m_controller ? m_controller->toolNotes() : std::vector<nt::MidiNote>{};
    const auto hidden = m_controller ? m_controller->toolHiddenIds() : QStringList{};
    m_toolHidden = QSet<QString>(hidden.begin(), hidden.end());
    m_dragging = m_controller && m_controller->noteDragActive();
    m_dragIds = m_dragging ? m_controller->noteDragIds() : QStringList{};
    m_dragValues.clear(); m_dragRows.clear();
    for (const auto& id : m_dragIds) {
        m_dragValues.insert(id,m_controller->previewNote(id));
        m_dragRows.insert(id,m_controller->noteDragRow(id));
    }
    const qreal dpr = window() ? window()->effectiveDevicePixelRatio() : 1;
    if (m_rasterFont != m_labelFont || m_rasterDpr != dpr) { m_text.clear(); m_rasterFont = m_labelFont; m_rasterDpr = dpr; }
    if (m_drawingKind == "keyboard" || (m_drawingKind == "notes" && m_noteLabels)) {
        for (int pitch = 0; pitch < 128; ++pitch) { prepareText(pitchName(pitch)); }
    }
    if (m_drawingKind == "scale") { prepareText("127"); prepareText("64"); prepareText("0"); }
    if (m_drawingKind == "ruler" && m_clipViewKey.bar > 0 && m_pxPerTick > 0) {
        const double buffer = std::min(width(),128.0)/m_pxPerTick;
        const double from = std::max(m_scrollTick-buffer,m_clipViewKey.zero);
        const double first = m_phaseTick + std::ceil((from-m_phaseTick)/m_clipViewKey.bar)*m_clipViewKey.bar;
        QSet<QString> visibleLabels;
        for (int i = 0; i < 6144; ++i) {
            const double tick = first+i*m_clipViewKey.bar;
            if (tick > m_scrollTick+(width()/m_pxPerTick)+buffer) { break; }
            const auto label = QString::number(static_cast<int>(std::round((tick-m_phaseTick)/m_clipViewKey.bar))+1);
            visibleLabels.insert(label); prepareText(label);
        }
        for (auto it = m_text.begin(); it != m_text.end();) {
            if (!visibleLabels.contains(it.key())) { it = m_text.erase(it); } else { ++it; }
        }
    }
}
void NoteLayerItem::geometryChange(const QRectF& geometry, const QRectF& oldGeometry) {
    QQuickItem::geometryChange(geometry, oldGeometry);
    if (geometry.size() != oldGeometry.size()) { requestPaint(); }
}

void NoteLayerItem::rebuildIndex() {
    if (!m_controller) { return; }
    const auto& notes = m_controller->typedNotes();
    if (m_indexDirty) {
        for (auto& row : m_index) { row.clear(); }
        for (std::size_t i = 0; i < notes.size(); ++i) {
            const auto& n = notes[i];
            if (n.pitch >= 0 && n.pitch < 128) { m_index[static_cast<std::size_t>(n.pitch)].push_back({n.startTick, n.startTick + n.durationTick, 0, static_cast<int>(i)}); }
        }
        for (auto& row : m_index) {
            std::sort(row.begin(), row.end(), [](const auto& a, const auto& b) { return a.start < b.start; });
            // Store subtree maxima in the implicit balanced tree. A long early note
            // must not force a backward scan through every later offscreen note.
            const auto build = [&](auto&& self, std::size_t begin, std::size_t end) -> double {
                if (begin == end) { return 0; }
                const auto middle = begin + (end - begin) / 2;
                row[middle].maxEnd = std::max({row[middle].end, self(self, begin, middle), self(self, middle + 1, end)});
                return row[middle].maxEnd;
            };
            build(build, 0, row.size());
        }
        m_indexDirty = false;
    }
}
std::vector<int> NoteLayerItem::visibleRows(double from, double to, int lowPitch, int highPitch, bool onsetsOnly) const {
    std::vector<int> hits;
    for (int pitch = std::max(0, lowPitch); pitch <= std::min(127, highPitch); ++pitch) {
        const auto& row = m_index[static_cast<std::size_t>(pitch)];
        if (onsetsOnly) {
            auto it = std::lower_bound(row.begin(), row.end(), from, [this](const Interval& note, double tick) {
                m_intervalVisitCount.fetch_add(1, std::memory_order_relaxed);
                return note.start < tick;
            });
            for (; it != row.end() && it->start <= to; ++it) {
                m_intervalVisitCount.fetch_add(1, std::memory_order_relaxed);
                hits.push_back(it->row);
            }
            continue;
        }
        const auto query = [&](auto&& self, std::size_t begin, std::size_t end) -> void {
            if (begin == end) { return; }
            const auto middle = begin + (end - begin) / 2;
            const auto& interval = row[middle];
            m_intervalVisitCount.fetch_add(1, std::memory_order_relaxed);
            if (interval.maxEnd < from) { return; }
            self(self, begin, middle);
            if (interval.start > to) { return; }
            if (interval.end >= from) { hits.push_back(interval.row); }
            self(self, middle + 1, end);
        };
        query(query, 0, row.size());
    }
    std::sort(hits.begin(), hits.end());
    return hits;
}

QStringList NoteLayerItem::notesInRect(double from, double to, int pitchA, int pitchB) {
    if (!m_controller) { return {}; }
    rebuildIndex();
    const double lo = std::min(from,to), hi = std::max(from,to);
    const auto& notes = m_controller->typedNotes();
    const auto hits = visibleRows(lo, hi, std::min(pitchA, pitchB), std::max(pitchA, pitchB));
    QStringList result;
    for (const auto row : hits) { result.append(notes[static_cast<std::size_t>(row)].id); }
    return result;
}

QVariantMap NoteLayerItem::noteNear(double x, double radius) {
    if (!m_controller || m_pxPerTick <= 0) { return {}; }
    rebuildIndex();
    const double tick = m_scrollTick + x / m_pxPerTick;
    const auto rows = visibleRows(tick - radius / m_pxPerTick, tick + radius / m_pxPerTick, 0, 127, true);
    const auto& notes = m_controller->typedNotes();
    int best = -1;
    for (auto it = rows.rbegin(); it != rows.rend(); ++it) {
        const auto& note = notes[static_cast<std::size_t>(*it)];
        const double distance = std::abs((note.startTick - tick) * m_pxPerTick);
        if (distance < radius) { radius = distance; best = *it; }
    }
    return m_controller->noteAtRow(best);
}

int NoteLayerItem::hitNote(double x, double y) {
    if (!m_controller || m_pxPerTick <= 0 || m_rowHeight <= 0) { return 0; }
    const auto& notes = m_controller->typedNotes();
    rebuildIndex();
    const int offset = static_cast<int>(std::floor(y / m_rowHeight));
    const int row = offset + m_collapseTopRow;
    const int pitch = !m_collapsed ? m_topPitch - offset : m_collapsePitches.value(row, -1);
    if (pitch < 0 || pitch > 127) { return 0; }
    const double tick = m_scrollTick + x / m_pxPerTick;
    const auto hiddenIds = m_controller->toolHiddenIds();
    const QSet<QString> hidden(hiddenIds.begin(), hiddenIds.end());
    int hit = -1;
    for (const int row : visibleRows(tick - 1 / m_pxPerTick, tick, pitch, pitch)) {
        const auto& n = notes[static_cast<std::size_t>(row)];
        if (hidden.contains(n.id)) { continue; }
        if (tick < n.startTick + std::max(1 / m_pxPerTick, n.durationTick)) { hit = std::max(hit, row); }
    }
    if (hit < 0) { return 0; }
    const auto& n = notes[static_cast<std::size_t>(hit)];
    const double w = std::max(1.0, n.durationTick * m_pxPerTick);
    return hit * 2 + 1 + (x >= (n.startTick - m_scrollTick) * m_pxPerTick + w - std::min(8.0, w / 2) ? 1 : 0);
}

QSGNode* NoteLayerItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    std::unique_ptr<NoteRoot> root(static_cast<NoteRoot*>(old));
    if (!window() || width() <= 0 || height() <= 0 || m_pxPerTick <= 0 || m_rowHeight <= 0) { return nullptr; }
    if (root && root->kind != m_drawingKind) { root.reset(); }
    if (!root) { root = std::make_unique<NoteRoot>(); root->kind = m_drawingKind; m_dirty = true; }
    const bool horizontal = m_drawingKind != "keyboard" && m_drawingKind != "scale";
    const bool vertical = m_drawingKind == "notes" || m_drawingKind == "keyboard";
    const double span = width() / m_pxPerTick;
    const int rows = static_cast<int>(std::ceil(height() / m_rowHeight));
    const bool collapsed = m_collapsed;
    const bool outsideX = horizontal && (m_scrollTick < root->tick || m_scrollTick + span > root->tick + root->span);
    const bool outsideY = vertical && (collapsed
        ? m_collapseTopRow < root->row || m_collapseTopRow + rows > root->row + root->rows
        : m_topPitch > root->pitch || m_topPitch - rows < root->pitch - root->rows);
    if (outsideX || outsideY || m_dirty) {
        constexpr double horizontalBufferPx = 128;
        constexpr int pitchBufferRows = 4;
        const double buffer = std::min(width(),horizontalBufferPx) / m_pxPerTick;
        root->tick = horizontal ? m_scrollTick - buffer : 0;
        root->span = horizontal ? span + 2*buffer : span;
        root->pitch = m_topPitch + (vertical ? pitchBufferRows : 0);
        root->row = m_collapseTopRow - (vertical ? pitchBufferRows : 0);
        root->rows = vertical ? rows + 2*pitchBufferRows : rows;
        m_dirty = true;
    }
    const double w = horizontal ? root->span * m_pxPerTick : width();
    const double h = vertical ? root->rows * m_rowHeight : height();
    QMatrix4x4 matrix;
    matrix.translate(horizontal ? static_cast<float>(std::round((root->tick - m_scrollTick) * m_pxPerTick)) : 0,
                     vertical ? static_cast<float>((collapsed ? root->row - m_collapseTopRow : m_topPitch - root->pitch) * m_rowHeight) : 0);
    if (matrix != root->matrix()) { root->setMatrix(matrix); }
    const bool software = window()->rendererInterface()->graphicsApi() == QSGRendererInterface::Software;
    const QSize size(static_cast<int>(std::ceil(w)), static_cast<int>(std::ceil(h)));
    const auto xOf = [&](double tick) { return (tick - root->tick) * m_pxPerTick; };
    const auto yOf = [&](int pitch) {
        return (collapsed ? (m_collapsePitches.contains(pitch) ? m_collapsePitches.indexOf(pitch) - root->row : -2) : root->pitch - pitch) * m_rowHeight;
    };
    const auto pitchOf = [&](int row) { return collapsed ? m_collapsePitches.value(row + root->row, -1) : root->pitch - row; };
    const auto text = [&](Drawing& draw, const QString& value, double x, double middle, const QColor& color, bool right = false) {
        const auto it = m_text.constFind(value);
        if (it != m_text.cend()) { draw.text(it->image,it->advance,x,middle,color,right); }
    };
    const auto gridLines = [&](Drawing& draw, double step, const QColor& color, double y, double length, bool timelineOnly = false) {
        if (step <= 0 || step * m_pxPerTick < m_margin) { return; }
        const double from = timelineOnly ? std::max(root->tick,m_clipViewKey.zero) : root->tick;
        const double to = root->tick + root->span;
        const double first = m_phaseTick + std::ceil((from-m_phaseTick)/step)*step;
        for (int count = 0; count < 6144; ++count) {
            const double tick = first + count*step;
            if (tick > to) { break; }
            draw.rect(std::round(xOf(tick)), y, 1, length, color);
        }
    };
    const bool valid = m_valid;
    const bool dragging = m_dragging;
    if (dragging != root->dragging) { m_notesDirty = true; root->dragging = dragging; }
    const auto dragIds = m_dragIds;
    const QSet<QString> dragged(dragIds.begin(), dragIds.end());
    const QSet<QString> selected(m_selectedIds.begin(), m_selectedIds.end());
    if (m_dirty || (m_notesDirty && (m_drawingKind == "notes" || m_drawingKind == "velocity"))) { m_contentBuildCount.fetch_add(1,std::memory_order_relaxed); }
    if (m_dirty) {
        Drawing draw(QRectF(QPointF(),size), window()->effectiveDevicePixelRatio(), software);
        draw.rect(0,0,w,h,m_drawingKind == "notes" ? m_background : m_panelColor);
        if (m_drawingKind == "notes" && valid) {
            for (int row = 0; row < root->rows + 1; ++row) {
                const int pitch = pitchOf(row);
                if (pitch < 0 || pitch > 127) { continue; }
                const double y = row * m_rowHeight;
                if (blackKey(pitch)) { draw.rect(0,y,w,m_rowHeight,m_selectedColor); }
                draw.rect(0,y+m_rowHeight-1,w,1,pitch % 12 == 0 ? alpha(m_borderStrong,0.45) : m_borderSubtle);
            }
            const double beat = m_clipViewKey.beat, bar = m_clipViewKey.bar;
            if (m_stepTicks < beat) { gridLines(draw,m_stepTicks,m_borderSubtle,0,h); }
            gridLines(draw,beat,alpha(m_borderStrong,0.3),0,h,true);
            gridLines(draw,bar,alpha(m_borderStrong,0.75),0,h,true);
            const double left = xOf(m_clipViewKey.from), right = xOf(m_clipViewKey.to);
            if (left > 0) { draw.rect(0,0,std::min(w,left),h,alpha(m_scrim,0.5)); }
            if (right < w) { draw.rect(std::max(0.0,right),0,w-std::max(0.0,right),h,alpha(m_scrim,0.5)); }
        } else if (m_drawingKind == "ruler" && valid && m_clipViewKey.bar > 0) {
            const double bar = m_clipViewKey.bar;
            const int every = std::max(1,static_cast<int>(std::ceil(m_labelMinWidth / std::max(1.0,bar*m_pxPerTick))));
            const double from = std::max(root->tick,m_clipViewKey.zero);
            const double first = m_phaseTick + std::ceil((from-m_phaseTick)/bar)*bar;
            for (int count = 0; count < 6144; ++count) {
                const double tick = first + count*bar;
                if (tick > root->tick+root->span) { break; }
                const double x = std::round(xOf(tick));
                const int index = static_cast<int>(std::round((tick-m_phaseTick)/bar));
                draw.rect(x,h/2,1,h/2,m_borderStrong);
                if (index % every == 0) { text(draw,QString::number(index+1),x+m_margin,h/2,m_textSecondary); }
            }
            draw.rect(0,h-1,w,1,m_borderSubtle);
        } else if (m_drawingKind == "keyboard") {
            const QColor ivory = m_dark ? m_textPrimary : m_panelColor;
            const QColor ebony = m_dark ? m_background : m_textPrimary;
            const QColor ink = m_dark ? m_background : m_textSecondary;
            const auto tint = [&](int pitch) { return pitch == m_pressedPitch ? 0.75 : pitch == m_hoverPitch ? 0.4 : 0; };
            draw.rect(0,0,w,h,collapsed ? m_panelColor : ivory);
            if (collapsed) {
                for (int row = 0; row < root->rows + 1; ++row) {
                    const int pitch = pitchOf(row);
                    if (pitch < 0) { continue; }
                    const double y = row * m_rowHeight; const bool black = blackKey(pitch);
                    draw.rect(0,y,w,m_rowHeight,black ? ebony : ivory);
                    draw.rect(0,y,w,m_rowHeight,alpha(m_accent,tint(pitch)));
                    draw.rect(0,y+m_rowHeight-1,w,1,m_borderStrong);
                    text(draw,pitchName(pitch),w-m_margin,y+m_rowHeight/2,black ? m_textSecondary : ink,true);
                }
            } else {
                const int low = std::max(0,root->pitch-root->rows-1);
                const double whiteHeight = 12*m_rowHeight/7;
                constexpr std::array semitones{0,2,4,5,7,9,11};
                for (int c = (low/12)*12; c <= root->pitch; c += 12) {
                    const double base = (root->pitch-c+1)*m_rowHeight;
                    for (int k = 0; k < 7; ++k) {
                        const double bottom = base-k*whiteHeight;
                        draw.rect(0,bottom-whiteHeight,w,whiteHeight,alpha(m_accent,tint(c+semitones[static_cast<std::size_t>(k)])));
                        draw.rect(0,std::round(bottom)-1,w,1,alpha(m_borderStrong,k==0 ? 0.9 : 0.55));
                    }
                    if (c <= 127) { text(draw,pitchName(c),w-m_margin,base-whiteHeight/2,tint(c)>0.5 ? m_textOnAccent : ink,true); }
                }
                const double bw = std::round(w*0.6);
                for (int pitch = low; pitch <= std::min(127,root->pitch); ++pitch) {
                    if (!blackKey(pitch)) { continue; }
                    const double y = yOf(pitch);
                    draw.rect(bw,y+1,m_micro,m_rowHeight-1,alpha(m_scrim,0.25));
                    draw.rect(0,y,bw,m_rowHeight,ebony);
                    draw.rect(0,y+m_rowHeight/2,bw-m_micro,m_rowHeight/2-1,m_dark ? m_borderControl : m_textSecondary);
                    draw.rect(bw-m_micro,y+1,m_micro,m_rowHeight-2,alpha(m_borderStrong,0.5));
                    draw.rect(0,y,bw,m_rowHeight,alpha(m_accent,tint(pitch)));
                }
            }
            draw.rect(w-1,0,1,h,m_borderStrong);
        } else if (m_drawingKind == "velocity" || m_drawingKind == "scale") {
            draw.rect(0,0,w,1,m_borderSubtle);
            const double base = h-m_margin, usable = base-m_margin;
            if (m_drawingKind == "scale") {
                draw.rect(w-1,0,1,h,m_borderSubtle);
                const double labelHeight = m_text.value("127").height;
                text(draw,"127",w-m_scaleInset,std::round(base-usable)+labelHeight/2,m_textSecondary,true);
                text(draw,"64",w-m_scaleInset,std::round(base-usable*64/127),m_textSecondary,true);
                text(draw,"0",w-m_scaleInset,std::round(base)-labelHeight/2,m_textSecondary,true);
            } else { for (int q = 0; q < 4; ++q) { draw.rect(0,std::round(base-usable*q/4),w,1,m_borderSubtle); } }
        } else if (m_drawingKind == "curve" && valid && m_curveMax > m_curveMin) {
            draw.rect(0,0,w,1,m_borderSubtle);
            const auto valueY = [&](double value) { return m_margin + (m_curveMax-std::clamp(value,m_curveMin,m_curveMax))/(m_curveMax-m_curveMin)*(h-2*m_margin); };
            const double neutral = std::round(valueY(m_curveNeutral));
            draw.rect(0,neutral,w,1,m_borderSubtle);
            const double from = m_expression ? xOf(m_curveBaseTick) : 0;
            const double to = m_expression ? xOf(m_curveEndTick) : w;
            if (m_expression && m_curveEndTick > m_curveBaseTick) { draw.rect(from,0,std::max(1.0,to-from),h,alpha(m_accent,0.15)); }
            const auto pixel = [&](const CurvePoint& p) { return QPointF(xOf(m_curveBaseTick+p.tick),valueY(p.value)); };
            if (!m_curvePoints.empty()) {
                auto previous = pixel(m_curvePoints.front());
                std::vector<QPointF> line;
                if (m_expression) { line.push_back({from,neutral}); line.push_back({previous.x(),neutral}); }
                line.push_back(previous);
                for (std::size_t i = 1; i < m_curvePoints.size(); ++i) {
                    const auto p = pixel(m_curvePoints[i]);
                    if (m_curveStep && !m_expression) { line.push_back({p.x(),previous.y()}); }
                    line.push_back(p); previous = p;
                }
                line.push_back({std::max(to,previous.x()),previous.y()});
                draw.polyline(line,m_accent);
            }
            for (const auto& value : m_curvePoints) {
                const auto p = pixel(value);
                draw.rect(std::round(p.x()-m_pointSize/2),std::round(p.y()-m_pointSize/2),m_pointSize,m_pointSize,
                          m_selectedPointIds.contains(value.id) ? m_accentSecondary : m_accent);
            }
        }
        replaceLayer(*root,root->background,draw.node(*window()));
    }
    const auto drawNotes = [&](bool overlay) {
        QRectF bounds(QPointF(),size);
        if (overlay && !m_marqueeVisible) {
            QRectF moving;
            for (const auto& id : dragIds) {
                const auto preview = m_dragValues.value(id);
                const QRectF rect(xOf(preview.startTick)-m_margin-2, m_drawingKind == "velocity" ? 0 : yOf(preview.pitch),
                                  std::max(1.0,preview.durationTick*m_pxPerTick)+2*m_margin+4,
                                  m_drawingKind == "velocity" ? h : m_rowHeight);
                moving = moving.united(rect);
            }
            bounds = moving.intersected(bounds).toAlignedRect();
        }
        // An empty overlay needs no texture on the software fallback.
        if (overlay && bounds.isEmpty()) { return std::make_unique<LayerNode>(); }
        Drawing draw(bounds,window()->effectiveDevicePixelRatio(),software);
        std::vector<nt::MidiNote> preview;
        const auto* list = valid && m_renderNotes ? m_renderNotes.get() : &preview;
        const auto note = [&](const nt::MidiNote& original, const QString& id, bool useOverlay) {
            m_noteVisitCount.fetch_add(1, std::memory_order_relaxed);
            double tick = original.startTick, duration = original.durationTick;
            int pitch = original.pitch, velocity = original.velocity;
            if (useOverlay) { const auto p = m_dragValues.value(id); tick=p.startTick; duration=p.durationTick; pitch=p.pitch; velocity=p.velocity; }
            const bool chosen = selected.contains(id);
            const bool muted = original.raw.value("muted").toBool();
            const QColor rgb = m_clipColors ? m_clipAccent : velocityColor(velocity);
            const double x = xOf(tick), y = yOf(pitch), width = std::max(1.0,duration*m_pxPerTick);
            if (m_drawingKind == "velocity") {
                const double sx = std::round(x)+1, base = h-m_margin, usable=base-m_margin;
                if (sx < -m_margin || sx > w+m_margin) { return; }
                const double sy = base-usable*velocity/127;
                const QColor color = mix(rgb,Qt::white,chosen ? 0.35 : 0);
                const double opacity = muted ? 0.4 : 1;
                draw.rect(sx-1,sy,m_micro,base-sy,alpha(color,opacity));
                draw.circle(sx,sy,m_margin,alpha(chosen ? m_textPrimary : color,opacity));
                if (chosen) { draw.circle(sx,sy,m_margin+m_micro/2,alpha(color,opacity),std::max(0.0,m_margin-m_micro/2)); }
                return;
            }
            if (x > w || x+width < 0 || y > h || y+m_rowHeight < 0) { return; }
            const QColor fill = mix(rgb,Qt::white,chosen ? 0.55 : 0);
            const QColor edge = chosen ? m_textPrimary : mix(rgb,Qt::black,0.4);
            const double top=std::round(y)+1, nh=std::max(1.0,std::round(m_rowHeight)-2);
            const double nx=std::round(x), nw=std::max(1.0,std::round(width)-1), radius=std::min({m_micro,nw/2,nh/2});
            if (muted) {
                draw.rect(nx,top,nw,nh,alpha(fill,0.15));
                const QColor outline=alpha(chosen ? m_textPrimary : fill,0.7);
                draw.rect(nx,top,nw,1,outline); draw.rect(nx,top+nh-1,nw,1,outline);
                draw.rect(nx,top+1,1,nh-2,outline); draw.rect(nx+nw-1,top+1,1,nh-2,outline);
            } else {
                draw.rounded(nx,top,nw,nh,radius,edge);
                draw.rounded(nx+1,top+1,nw-2,nh-2,std::max(0.0,radius-1),fill);
                double lineX=nx+2;
                if (m_noteLabels && nh >= 2*m_margin && nw >= m_labelMinWidth) {
                    const auto name=pitchName(pitch);
                    text(draw,name,nx+m_margin,top+nh/2,mix(rgb,Qt::black,0.75));
                    lineX=nx+2*m_margin+m_text.value(name).advance;
                }
                const double length=nx+nw-2-lineX;
                if (length >= 2 && nh >= 5) { draw.rect(lineX,top+std::floor(nh/2),std::max(1.0,std::round(length*velocity/127)),1,mix(rgb,Qt::black,0.55)); }
            }
            const auto bend=original.raw.value("expression").toObject().value("pitch").toArray();
            if (!bend.isEmpty() && width>2) {
                const double middle=y+m_rowHeight/2;
                const auto first=bend.first().toObject();
                std::vector<QPointF> line{{x,middle},{x+first.value("tick").toDouble()*m_pxPerTick,middle}};
                for (const auto& entry : bend) {
                    const auto p=entry.toObject();
                    line.push_back({x+p.value("tick").toDouble()*m_pxPerTick,std::clamp(middle-p.value("value").toDouble()*m_rowHeight,y+1,y+m_rowHeight-1)});
                }
                line.push_back({x+width,line.back().y()});
                draw.polyline(line,m_textPrimary);
            }
        };
        if (m_drawingKind == "notes" || m_drawingKind == "velocity") {
            if (overlay) {
                for (const auto& id : dragIds) {
                    const int row = m_dragRows.value(id,-1);
                    if (row >= 0 && static_cast<std::size_t>(row) < list->size() && selected.contains(id)) {
                        note((*list)[static_cast<std::size_t>(row)],id,true);
                    }
                }
            } else {
                // Query only the buffered viewport. Velocity uses every pitch but the same time index.
                std::vector<int> visible;
                if (valid && m_renderNotes) {
                    if (m_drawingKind == "velocity") {
                        visible = visibleRows(root->tick - m_margin / m_pxPerTick, root->tick + root->span + m_margin / m_pxPerTick, 0, 127, true);
                    } else if (collapsed) {
                        for (int row = 0; row <= root->rows; ++row) {
                            const int pitch = pitchOf(row);
                            const auto hits = visibleRows(root->tick - 1 / m_pxPerTick, root->tick + root->span, pitch, pitch);
                            visible.insert(visible.end(), hits.begin(), hits.end());
                        }
                        std::sort(visible.begin(), visible.end());
                    } else {
                        visible = visibleRows(root->tick - 1 / m_pxPerTick, root->tick + root->span, root->pitch - root->rows, root->pitch);
                    }
                }
                // Velocity stems draw selected notes last, reusing the visible query.
                for (int pass = 0; pass < (m_drawingKind == "velocity" ? 2 : 1); ++pass) {
                    for (const int row : visible) {
                        const auto& n = (*list)[static_cast<std::size_t>(row)];
                        if (m_drawingKind == "velocity" && selected.contains(n.id) != (pass == 1)) { continue; }
                        if (!m_toolHidden.contains(n.id) && (!dragged.contains(n.id) || !selected.contains(n.id))) { note(n,n.id,false); }
                    }
                }
            }
            if (!overlay) { for (const auto& n : m_toolNotes) { note(n, n.id, false); } }
            if (overlay && m_marqueeVisible && m_drawingKind == "notes") {
                const double x1=xOf(m_marquee.left()), x2=xOf(m_marquee.right());
                const double y1=yOf(static_cast<int>(std::max(m_marquee.top(),m_marquee.bottom())));
                const double y2=yOf(static_cast<int>(std::min(m_marquee.top(),m_marquee.bottom())))+m_rowHeight;
                const double left=std::min(x1,x2), mw=std::abs(x2-x1);
                draw.rect(left,y1,mw,y2-y1,alpha(m_accentOutline,0.3));
                draw.rect(left,y1,mw+1,1,m_accent); draw.rect(left,y2,mw+1,1,m_accent);
                draw.rect(left,y1,1,y2-y1+1,m_accent); draw.rect(left+mw,y1,1,y2-y1+1,m_accent);
            }
        }
        return draw.node(*window());
    };
    if (m_drawingKind == "notes" || m_drawingKind == "velocity") {
        if (m_dirty || m_notesDirty) { replaceLayer(*root,root->notes,drawNotes(false)); }
        if (m_dirty || m_notesDirty || m_overlayDirty) { m_overlayBuildCount.fetch_add(1,std::memory_order_relaxed); replaceLayer(*root,root->overlay,drawNotes(true)); }
    }
    m_dirty=false; m_notesDirty=false; m_overlayDirty=false;
    return root.release();
}
