#include "GpuFrameSource.h"

#include <QMetaObject>

namespace nt::preview {

GpuFrameSource::GpuFrameSource(int slotCount, QObject* parent)
    : QObject(parent), m_ring(std::make_shared<gr::host::gpu::FrameRing>(std::size_t(slotCount))) {}

GpuFrameSource::~GpuFrameSource() { m_ring->close(); }

void GpuFrameSource::setRequestedSize(const QSize& pixels) {
    if (pixels == m_requestedSize) return;
    m_requestedSize = pixels;
    emit requestedSizeChanged();
}

QVariantMap GpuFrameSource::stats() const {
    const gr::host::gpu::ShareStats s = m_ring->stats();
    auto ms = [](std::uint64_t nanos, std::uint64_t count) { return count ? double(nanos) / double(count) / 1e6 : 0.0; };
    return {
        {QStringLiteral("gpuToCpuTransfers"), qulonglong(s.gpuToCpuTransfers)},
        {QStringLiteral("gpuToGpuCopies"), qulonglong(s.gpuToGpuCopies)},
        {QStringLiteral("resourcesCreated"), qulonglong(s.resourcesCreated)},
        {QStringLiteral("resourcesRetired"), qulonglong(s.resourcesRetired)},
        {QStringLiteral("framesPublished"), qulonglong(s.framesPublished)},
        {QStringLiteral("framesPresented"), qulonglong(s.framesPresented)},
        {QStringLiteral("framesDropped"), qulonglong(s.framesDropped)},
        {QStringLiteral("framesReplaced"), qulonglong(s.framesReplaced)},
        {QStringLiteral("framesReused"), qulonglong(s.framesReused)},
        {QStringLiteral("ownershipFailures"), qulonglong(s.ownershipFailures)},
        {QStringLiteral("syncWaitMsAverage"), ms(s.syncWaitNanosTotal, s.framesPublished)},
        {QStringLiteral("syncWaitMsMax"), ms(s.syncWaitNanosMax, 1)},
        {QStringLiteral("latencyMsAverage"), ms(s.latencyNanosTotal, s.framesPresented)},
        {QStringLiteral("latencyMsMax"), ms(s.latencyNanosMax, 1)},
    };
}

void GpuFrameSource::notifyFrame() {
    // The context object makes Qt drop the call when the source is gone.
    QMetaObject::invokeMethod(this, &GpuFrameSource::frameReady, Qt::QueuedConnection);
}

void GpuFrameSource::reportError(const QString& message) {
    QMetaObject::invokeMethod(this, [this, message] { setError(message); }, Qt::QueuedConnection);
}

void GpuFrameSource::setError(const QString& message) {
    if (message == m_error) return;
    m_error = message;
    emit errorChanged();
}

}  // namespace nt::preview
