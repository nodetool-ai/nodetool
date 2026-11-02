#pragma once
#include <QImage>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

// Shows a frame from FrameCapture, aspect-fit, with nothing drawn around it.
class FrameImage : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QImage image READ image WRITE setImage NOTIFY imageChanged)
public:
    explicit FrameImage(QQuickItem* parent = nullptr);
    QImage image() const { return m_image; }
    void setImage(const QImage& image);
signals:
    void imageChanged();
protected:
    QSGNode* updatePaintNode(QSGNode* node, UpdatePaintNodeData*) override;
private:
    QImage m_image;
    bool m_imageChanged = false;
};
