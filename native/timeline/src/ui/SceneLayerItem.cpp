#include "SceneLayerItem.h"
#include <QQuickWindow>
#include <QSGGeometryNode>
#include <QSGVertexColorMaterial>
#include <QSGImageNode>
#include <QSGTexture>
#include <QSGRendererInterface>
#include <QSGTransformNode>
#include <QPainter>
#include <QFontMetricsF>
#include <QThread>
#include <cmath>
#include <memory>

namespace {
// Render thread only. Children borrow textures and die before the RAII owners.
struct LayerNode : QSGNode {
    LayerNode() = default;
    LayerNode(const LayerNode&) = delete;
    LayerNode& operator=(const LayerNode&) = delete;
    LayerNode(LayerNode&&) = delete;
    LayerNode& operator=(LayerNode&&) = delete;
    std::vector<std::unique_ptr<QSGTexture>> textures;
    ~LayerNode() override {
        while (firstChild()) {
            auto child = std::unique_ptr<QSGNode>(firstChild());
            removeChildNode(child.get());
        }
    }
};
}
SceneLayerItem::SceneLayerItem(QQuickItem* parent) : QQuickItem(parent) { setFlag(ItemHasContents); setClip(true); }
void SceneLayerItem::itemChange(ItemChange change,const ItemChangeData& data) {
    QQuickItem::itemChange(change,data);
    if (change==ItemDevicePixelRatioHasChanged || change==ItemSceneChange) { requestPaint(); }
}
void SceneLayerItem::requestPaint() { polish(); update(); }
void SceneLayerItem::geometryChange(const QRectF& next, const QRectF& old) {
    QQuickItem::geometryChange(next, old);
    if (next.size() != old.size()) { requestPaint(); }
}
void SceneLayerItem::rect(const QRectF& r, const QColor& color) {
    if (r.width() <= 0 || r.height() <= 0 || !color.alpha()) { return; }
    for (const auto& p : {r.topLeft(),r.topRight(),r.bottomLeft(),r.topRight(),r.bottomRight(),r.bottomLeft()}) {
        m_vertices.push_back({float(p.x()),float(p.y()),color});
    }
}
void SceneLayerItem::line(QPointF a, QPointF b, const QColor& color, double thickness) {
    const auto d = b-a;
    const double length = std::hypot(d.x(),d.y());
    if (length <= 0) { return; }
    const QPointF n(-d.y()*thickness/(2*length),d.x()*thickness/(2*length));
    for (const auto& p : {a+n,b+n,a-n,b+n,b-n,a-n}) { m_vertices.push_back({float(p.x()),float(p.y()),color}); }
}
void SceneLayerItem::circle(QPointF center, double radius, const QColor& color) {
    constexpr double pi = 3.14159265358979323846;
    for (int i=0;i<20;++i) {
        for (const auto& p : {center,center+QPointF(std::cos(i*pi/10),std::sin(i*pi/10))*radius,
                             center+QPointF(std::cos((i+1)*pi/10),std::sin((i+1)*pi/10))*radius}) {
            m_vertices.push_back({float(p.x()),float(p.y()),color});
        }
    }
}
void SceneLayerItem::label(const QString& value, QPointF origin, const QFont& font, const QColor& color, bool vertical) {
    if (value.isEmpty()) { return; }
    const QString key=font.toString()+QChar(0)+value+QChar(0)+color.name(QColor::HexArgb);
    auto it=m_text.constFind(key);
    if (it==m_text.cend()) {
        const QFontMetricsF fm(font);
        QImage image(QSize(int(std::ceil(fm.horizontalAdvance(value)))+2,int(std::ceil(fm.height()))+2)*m_dpr,QImage::Format_ARGB32_Premultiplied);
        image.setDevicePixelRatio(m_dpr); image.fill(Qt::transparent);
        { QPainter painter(&image); painter.setFont(font); painter.setPen(color); painter.drawText(QPointF(0,1+fm.ascent()),value); }
        it=m_text.insert(key,image);
    }
    m_labels.push_back({*it,QRectF(origin,it->deviceIndependentSize()),vertical});
}
void SceneLayerItem::updatePolish() {
    Q_ASSERT(QThread::currentThread()==thread());
    const qreal dpr=window()?window()->effectiveDevicePixelRatio():1;
    if (dpr!=m_dpr) { m_dpr=dpr; m_text.clear(); }
    // Bound label cache even when the ruler visits a long sequence.
    if (m_text.size()>1024) { m_text.clear(); }
    m_vertices.clear(); m_labels.clear(); prepare(); m_dirty=true;
}
QSGNode* SceneLayerItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    std::unique_ptr<LayerNode> previous(static_cast<LayerNode*>(old));
    if (!window() || width()<=0 || height()<=0) { return nullptr; }
    if (previous && !m_dirty) { return previous.release(); }
    auto node=std::make_unique<LayerNode>();
    const auto appendImage=[&](const QImage& image,const QRectF& rect,bool vertical) {
        auto texture=std::unique_ptr<QSGTexture>(window()->createTextureFromImage(image));
        auto child=std::unique_ptr<QSGImageNode>(window()->createImageNode());
        if (!texture || !child) { return; }
        child->setTexture(texture.get());
        child->setRect(vertical?QRectF(QPointF(),rect.size()):rect);
        node->textures.push_back(std::move(texture));
        if (vertical) {
            auto transform=std::make_unique<QSGTransformNode>(); QMatrix4x4 matrix;
            matrix.translate(float(rect.x()),float(rect.y())); matrix.rotate(-90,0,0,1); transform->setMatrix(matrix);
            transform->appendChildNode(child.release()); node->appendChildNode(transform.release());
        } else { node->appendChildNode(child.release()); }
    };
    if (window()->rendererInterface()->graphicsApi()==QSGRendererInterface::Software) {
        // Qt's software renderer does not render custom geometry. As in
        // NoteLayerItem, the render thread owns this bounded fallback image.
        QImage image(QSize(int(std::ceil(width())),int(std::ceil(height())))*m_dpr,QImage::Format_ARGB32_Premultiplied);
        image.setDevicePixelRatio(m_dpr); image.fill(Qt::transparent);
        { QPainter painter(&image); painter.setPen(Qt::NoPen);
          for (std::size_t i=0;i+2<m_vertices.size();i+=3) {
              const auto& a=m_vertices[i]; const auto& b=m_vertices[i+1]; const auto& c=m_vertices[i+2];
              const QPointF points[]={{a.x,a.y},{b.x,b.y},{c.x,c.y}};
              painter.setBrush(a.color); painter.drawPolygon(points,3);
          }
        }
        appendImage(image,QRectF(QPointF(),image.deviceIndependentSize()),false);
    } else if (!m_vertices.empty()) {
        auto child=std::make_unique<QSGGeometryNode>();
        auto geometry=std::make_unique<QSGGeometry>(QSGGeometry::defaultAttributes_ColoredPoint2D(),int(m_vertices.size()));
        geometry->setDrawingMode(QSGGeometry::DrawTriangles);
        auto* data=geometry->vertexDataAsColoredPoint2D();
        for (std::size_t i=0;i<m_vertices.size();++i) {
            const auto& v=m_vertices[i]; const auto& c=v.color;
            data[i].set(v.x,v.y,uchar(std::lround(c.red()*c.alphaF())),uchar(std::lround(c.green()*c.alphaF())),uchar(std::lround(c.blue()*c.alphaF())),uchar(c.alpha()));
        }
        child->setGeometry(geometry.release()); child->setFlag(QSGNode::OwnsGeometry);
        child->setMaterial(std::make_unique<QSGVertexColorMaterial>().release()); child->setFlag(QSGNode::OwnsMaterial);
        node->appendChildNode(child.release());
    }
    for (const auto& text:m_labels) { appendImage(text.image,text.rect,text.vertical); }
    m_dirty=false;
    return node.release();
}
