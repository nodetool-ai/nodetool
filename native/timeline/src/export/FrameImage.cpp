#include "export/FrameImage.h"
#include <QQuickWindow>
#include <QSGImageNode>

FrameImage::FrameImage(QQuickItem* parent) : QQuickItem(parent) { setFlag(ItemHasContents); }
void FrameImage::setImage(const QImage& image) {
    if (m_image.cacheKey() == image.cacheKey()) return;
    m_image = image;
    m_imageChanged = true;
    setImplicitSize(image.width(), image.height());
    update();
    emit imageChanged();
}
void FrameImage::setStretch(bool stretch) {
    if (m_stretch == stretch) return;
    m_stretch = stretch;
    update();
    emit stretchChanged();
}
QSGNode* FrameImage::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    if (m_image.isNull() || width() <= 0 || height() <= 0) {
        // native-rules #2: naked delete of the previous QSGNode, scene graph owner not documented
        delete old;
        return nullptr;
    }
    auto* node = static_cast<QSGImageNode*>(old);
    if (!node) {
        node = window()->createImageNode();
        node->setOwnsTexture(true);
        node->setFiltering(QSGTexture::Linear);
        m_imageChanged = true;
    }
    if (m_imageChanged) {
        node->setTexture(window()->createTextureFromImage(m_image));
        m_imageChanged = false;
    }
    const QSizeF size = m_stretch ? boundingRect().size() : QSizeF(m_image.size()).scaled(boundingRect().size(), Qt::KeepAspectRatio);
    node->setRect(QRectF(QPointF((width() - size.width()) / 2, (height() - size.height()) / 2), size));
    node->setSourceRect(QRectF(QPointF(0, 0), QSizeF(m_image.size())));
    return node;
}
