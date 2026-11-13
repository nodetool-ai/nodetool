#pragma once

// The GUI-thread end of a stream of shared GPU frames: a FrameRing that a
// producer fills on its own thread and a GpuPreviewItem drains on the
// render thread.

#include "host/gpu_share.h"

#include <QObject>
#include <QSize>
#include <QString>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>

#include <memory>

namespace nt::preview {

// Thread affinity: GUI thread only, except notifyFrame() and reportError(),
// which any thread may call (they post to the GUI thread).
class GpuFrameSource : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("GpuFrameSource is the base of frame producers")
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    Q_PROPERTY(QSize requestedSize READ requestedSize NOTIFY requestedSizeChanged)

public:
    // `parent` is the QObject parent, which owns the source when set.
    explicit GpuFrameSource(int slotCount, QObject* parent = nullptr);
    ~GpuFrameSource() override;

    // Shared with the producer thread and the scene graph node, which end
    // in no fixed order.
    const std::shared_ptr<gr::host::gpu::FrameRing>& ring() const { return m_ring; }

    QString error() const { return m_error; }
    // The size, in physical pixels, the attached item draws at.
    QSize requestedSize() const { return m_requestedSize; }
    // Called by the item when its geometry or the screen's pixel ratio changes.
    void setRequestedSize(const QSize& pixels);

    // The ring's counters (ShareStats) as a map, plus the average and
    // maximum latency and wait in milliseconds.
    Q_INVOKABLE QVariantMap stats() const;

    // Any thread: a new frame was published / the producer failed.
    void notifyFrame();
    void reportError(const QString& message);

signals:
    void frameReady();
    void errorChanged();
    void requestedSizeChanged();

protected:
    void setError(const QString& message);

private:
    std::shared_ptr<gr::host::gpu::FrameRing> m_ring;
    QString m_error;
    QSize m_requestedSize;
};

}  // namespace nt::preview
