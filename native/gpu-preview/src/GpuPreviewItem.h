#pragma once

// A Qt Quick item that shows the frames of a GpuFrameSource. The frames are
// GPU textures of the wgpu compute engine, sampled by the scene graph
// without a readback or an upload. The item is ordinary scene graph
// content: it takes part in stacking, clipping, opacity and transforms, and
// other items draw over it.

#include "GpuFrameSource.h"

#include <QPointer>
#include <QQuickItem>
#include <QtQml/qqmlregistration.h>

namespace nt::preview {

// Thread affinity: GUI thread only. updatePaintNode() runs on the render
// thread while the GUI thread is blocked, as Qt Quick guarantees.
class GpuPreviewItem : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(nt::preview::GpuFrameSource* source READ source WRITE setSource NOTIFY sourceChanged)
    Q_PROPERTY(FillMode fillMode READ fillMode WRITE setFillMode NOTIFY fillModeChanged)
    Q_PROPERTY(bool mirrorVertically READ mirrorVertically WRITE setMirrorVertically NOTIFY mirrorVerticallyChanged)
    Q_PROPERTY(ColorEncoding colorEncoding READ colorEncoding WRITE setColorEncoding NOTIFY colorEncodingChanged)
    Q_PROPERTY(Status status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString statusText READ statusText NOTIFY statusChanged)
    Q_PROPERTY(QSize frameSize READ frameSize NOTIFY frameSizeChanged)
    Q_PROPERTY(qulonglong framesShown READ framesShown NOTIFY frameShown)

public:
    enum FillMode { Stretch, PreserveAspectFit, PreserveAspectCrop };
    Q_ENUM(FillMode)
    // How the texture's color values are encoded. Auto: rgba8unorm is
    // sRGB-encoded, rgba16float is linear light.
    enum ColorEncoding { Auto, Srgb, Linear };
    Q_ENUM(ColorEncoding)
    // Empty: no frame yet. Ready: a frame is shown. Unavailable: the window
    // or the device cannot share textures. Error: a frame failed.
    enum Status { Empty, Ready, Unavailable, Error };
    Q_ENUM(Status)

    // `parent` is the visual and QObject parent, which owns the item.
    explicit GpuPreviewItem(QQuickItem* parent = nullptr);
    ~GpuPreviewItem() override;

    GpuFrameSource* source() const { return m_source; }
    void setSource(GpuFrameSource* source);
    FillMode fillMode() const { return m_fillMode; }
    void setFillMode(FillMode mode);
    bool mirrorVertically() const { return m_mirrorVertically; }
    void setMirrorVertically(bool mirror);
    ColorEncoding colorEncoding() const { return m_colorEncoding; }
    void setColorEncoding(ColorEncoding encoding);
    Status status() const { return m_status; }
    QString statusText() const { return m_statusText; }
    QSize frameSize() const { return m_frameSize; }
    qulonglong framesShown() const { return m_framesShown; }

signals:
    void sourceChanged();
    void fillModeChanged();
    void mirrorVerticallyChanged();
    void colorEncodingChanged();
    void statusChanged();
    void frameSizeChanged();
    void frameShown();

protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData*) override;
    void geometryChange(const QRectF& newGeometry, const QRectF& oldGeometry) override;
    void itemChange(ItemChange change, const ItemChangeData& data) override;

private:
    // What one updatePaintNode() found, sent to the GUI thread by value.
    struct SyncReport {
        bool hasFrame = false;
        bool newFrame = false;
        bool pollAgain = false;
        bool unavailable = false;
        QSize frameSize;
        QString error;
    };

    void updateRequestedSize();
    void applySync(const SyncReport& report);

    QPointer<GpuFrameSource> m_source;
    FillMode m_fillMode = PreserveAspectFit;
    bool m_mirrorVertically = false;
    ColorEncoding m_colorEncoding = Auto;
    Status m_status = Empty;
    QString m_statusText;
    QSize m_frameSize;
    qulonglong m_framesShown = 0;
};

}  // namespace nt::preview
