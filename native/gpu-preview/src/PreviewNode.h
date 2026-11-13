#pragma once

// The scene graph node of a GpuPreviewItem: a textured quad that draws the
// newest frame of a FrameRing, and the consumer side of the ring's protocol.

#include "TextureImporter.h"

#include <QRectF>
#include <QSGGeometryNode>
#include <QSGMaterial>
#include <QSize>
#include <QString>

#include <memory>
#include <optional>

class QQuickWindow;

namespace nt::preview {

// Thread affinity: render thread only. The material lives in the scene
// graph with its node.
class PresentMaterial final : public QSGMaterial {
public:
    PresentMaterial();
    QSGMaterialType* type() const override;
    QSGMaterialShader* createShader(QSGRendererInterface::RenderMode) const override;
    int compare(const QSGMaterial* other) const override;

    // Borrowed from the importer, which keeps it alive while it is drawn.
    QSGTexture* texture = nullptr;
    bool straightAlpha = false;
    bool linearLight = false;
};

// What one sync() tells the item. Written on the render thread while the
// GUI thread is blocked.
struct SyncResult {
    bool hasFrame = false;
    bool newFrame = false;
    bool pollAgain = false;  // transfers are in flight: sync again soon
    QSize frameSize;
    QString error;           // set when sharing is unavailable or failed
};

// Thread affinity: render thread only, including the destructor, which
// returns every texture to the producer.
class PreviewNode final : public QSGGeometryNode {
public:
    // `ring` is shared with the producer, which runs on its own thread and
    // may outlive or be outlived by the node.
    PreviewNode(QQuickWindow* window, std::shared_ptr<gr::host::gpu::FrameRing> ring);
    ~PreviewNode() override;

    struct Options {
        QRectF bounds;
        int fillMode = 0;  // GpuPreviewItem::FillMode
        bool mirrorVertically = false;
        int colorEncoding = 0;  // GpuPreviewItem::ColorEncoding
    };

    const std::shared_ptr<gr::host::gpu::FrameRing>& ring() const { return m_ring; }
    SyncResult sync(const Options& options);
    int imports() const { return m_importer ? m_importer->imports() : 0; }

private:
    void updateGeometry(const Options& options);

    QQuickWindow* m_window;  // the node's window, which outlives it
    std::shared_ptr<gr::host::gpu::FrameRing> m_ring;
    std::unique_ptr<TextureImporter> m_importer;
    QString m_unavailable;  // why there is no importer
    QSGGeometry m_geometry;
    PresentMaterial m_material;
    std::optional<gr::host::gpu::FrameRing::Frame> m_current;
};

}  // namespace nt::preview
