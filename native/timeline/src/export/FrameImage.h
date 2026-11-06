#pragma once
#include <QImage>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

// Shows a frame from FrameCapture, aspect-fit, with nothing drawn around it.
class FrameImage : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QImage image READ image WRITE setImage NOTIFY imageChanged)
    Q_PROPERTY(bool stretch READ stretch WRITE setStretch NOTIFY stretchChanged)
public:
    explicit FrameImage(QQuickItem* parent = nullptr);
    QImage image() const { return m_image; }
    void setImage(const QImage& image);
    // Fills the item, for an image whose axes are not a picture's, such as a scope.
    bool stretch() const { return m_stretch; }
    void setStretch(bool stretch);
signals:
    void imageChanged();
    void stretchChanged();
protected:
    QSGNode* updatePaintNode(QSGNode* node, UpdatePaintNodeData*) override;
private:
    QImage m_image;
    bool m_imageChanged = false;
    bool m_stretch = false;
};
