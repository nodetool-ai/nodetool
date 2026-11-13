#include "GpuPreviewItem.h"

#include "PreviewNode.h"

#include <QQuickWindow>

namespace nt::preview {

GpuPreviewItem::GpuPreviewItem(QQuickItem* parent) : QQuickItem(parent) { setFlag(ItemHasContents, true); }

GpuPreviewItem::~GpuPreviewItem() = default;

void GpuPreviewItem::setSource(GpuFrameSource* source) {
    if (source == m_source) return;
    if (m_source) disconnect(m_source, nullptr, this, nullptr);
    m_source = source;
    if (m_source) {
        // Both ends live on the GUI thread; the connection dies with either.
        connect(m_source, &GpuFrameSource::frameReady, this, &QQuickItem::update);
        updateRequestedSize();
    }
    emit sourceChanged();
    update();
}

void GpuPreviewItem::setFillMode(FillMode mode) {
    if (mode == m_fillMode) return;
    m_fillMode = mode;
    emit fillModeChanged();
    update();
}

void GpuPreviewItem::setMirrorVertically(bool mirror) {
    if (mirror == m_mirrorVertically) return;
    m_mirrorVertically = mirror;
    emit mirrorVerticallyChanged();
    update();
}

void GpuPreviewItem::setColorEncoding(ColorEncoding encoding) {
    if (encoding == m_colorEncoding) return;
    m_colorEncoding = encoding;
    emit colorEncodingChanged();
    update();
}

void GpuPreviewItem::geometryChange(const QRectF& newGeometry, const QRectF& oldGeometry) {
    QQuickItem::geometryChange(newGeometry, oldGeometry);
    updateRequestedSize();
    update();
}

void GpuPreviewItem::itemChange(ItemChange change, const ItemChangeData& data) {
    QQuickItem::itemChange(change, data);
    if (change == ItemDevicePixelRatioHasChanged || change == ItemSceneChange) updateRequestedSize();
}

void GpuPreviewItem::updateRequestedSize() {
    if (!m_source) return;
    const qreal ratio = window() ? window()->effectiveDevicePixelRatio() : 1.0;
    m_source->setRequestedSize(QSize(qRound(width() * ratio), qRound(height() * ratio)));
}

QSGNode* GpuPreviewItem::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    // The scene graph owns `old` and whatever this returns. Taking it into a
    // unique_ptr here frees it on every path that does not return it.
    std::unique_ptr<PreviewNode> node(static_cast<PreviewNode*>(old));
    SyncReport report;
    if (m_source && width() > 0 && height() > 0) {
        if (!node || node->ring() != m_source->ring()) {
            node = std::make_unique<PreviewNode>(window(), m_source->ring());
        }
        PreviewNode::Options options;
        options.bounds = boundingRect();
        options.fillMode = m_fillMode;
        options.mirrorVertically = m_mirrorVertically;
        options.colorEncoding = m_colorEncoding;
        const SyncResult result = node->sync(options);
        report.hasFrame = result.hasFrame;
        report.newFrame = result.newFrame;
        report.pollAgain = result.pollAgain;
        report.frameSize = result.frameSize;
        report.error = result.error;
        report.unavailable = !result.error.isEmpty() && node->imports() == 0 && !result.hasFrame;
    }
    // The result crosses to the GUI thread as a queued call that carries it
    // by value. Qt drops the call if the item is gone by then.
    QMetaObject::invokeMethod(this, [this, report] { applySync(report); }, Qt::QueuedConnection);
    if (!report.hasFrame) return nullptr;  // nothing to draw: the node and its imports go
    return node.release();
}

void GpuPreviewItem::applySync(const SyncReport& report) {
    Status status = Empty;
    QString text;
    if (!report.error.isEmpty()) {
        status = report.unavailable ? Unavailable : Error;
        text = report.error;
    } else if (report.hasFrame) {
        status = Ready;
    }
    if (status != m_status || text != m_statusText) {
        m_status = status;
        m_statusText = text;
        emit statusChanged();
    }
    if (report.hasFrame && report.frameSize != m_frameSize) {
        m_frameSize = report.frameSize;
        emit frameSizeChanged();
    }
    if (report.newFrame) {
        ++m_framesShown;
        emit frameShown();
    }
    // Ownership transfers are still in flight: look again next frame so
    // their slots return to the producer.
    if (report.pollAgain) update();
}

}  // namespace nt::preview
