#include "PreviewNode.h"

#include "GpuPreviewItem.h"

#include <QQuickWindow>
#include <QSGMaterialShader>
#include <QSGTexture>

#include <algorithm>
#include <cstring>

namespace nt::preview {
namespace {

namespace gpu = gr::host::gpu;

// Thread affinity: render thread only.
class PresentShader final : public QSGMaterialShader {
public:
    PresentShader() {
        setShaderFileName(VertexStage, QStringLiteral(":/nodetool/gpupreview/shaders/present.vert.qsb"));
        setShaderFileName(FragmentStage, QStringLiteral(":/nodetool/gpupreview/shaders/present.frag.qsb"));
    }

    bool updateUniformData(RenderState& state, QSGMaterial* newMaterial, QSGMaterial*) override {
        const auto* material = static_cast<PresentMaterial*>(newMaterial);
        QByteArray* buffer = state.uniformData();
        // std140: mat4 at 0, float at 64, ints at 68 and 72.
        if (state.isMatrixDirty()) {
            const QMatrix4x4 matrix = state.combinedMatrix();
            std::memcpy(buffer->data(), matrix.constData(), 64);
        }
        const float opacity = state.opacity();
        std::memcpy(buffer->data() + 64, &opacity, 4);
        const qint32 straight = material->straightAlpha ? 1 : 0;
        const qint32 linear = material->linearLight ? 1 : 0;
        std::memcpy(buffer->data() + 68, &straight, 4);
        std::memcpy(buffer->data() + 72, &linear, 4);
        return true;
    }

    void updateSampledImage(RenderState& state, int binding, QSGTexture** texture, QSGMaterial* newMaterial,
                            QSGMaterial*) override {
        if (binding != 1) return;
        auto* material = static_cast<PresentMaterial*>(newMaterial);
        if (material->texture) material->texture->commitTextureOperations(state.rhi(), state.resourceUpdateBatch());
        *texture = material->texture;
    }
};

}  // namespace

PresentMaterial::PresentMaterial() { setFlag(Blending); }

QSGMaterialType* PresentMaterial::type() const {
    static QSGMaterialType type;  // an immutable identity tag, as Qt's materials use
    return &type;
}

QSGMaterialShader* PresentMaterial::createShader(QSGRendererInterface::RenderMode) const {
    // Qt Quick takes ownership of the shader (QSGMaterial::createShader contract).
    return std::make_unique<PresentShader>().release();
}

int PresentMaterial::compare(const QSGMaterial* other) const {
    const auto* o = static_cast<const PresentMaterial*>(other);
    if (texture != o->texture) return texture < o->texture ? -1 : 1;
    if (straightAlpha != o->straightAlpha) return straightAlpha ? 1 : -1;
    if (linearLight != o->linearLight) return linearLight ? 1 : -1;
    return 0;
}

PreviewNode::PreviewNode(QQuickWindow* window, std::shared_ptr<gpu::FrameRing> ring)
    : m_window(window), m_ring(std::move(ring)), m_geometry(QSGGeometry::defaultAttributes_TexturedPoint2D(), 4) {
    m_geometry.setDrawingMode(QSGGeometry::DrawTriangleStrip);
    setGeometry(&m_geometry);
    setMaterial(&m_material);
    m_importer = TextureImporter::create(window, &m_unavailable);
}

PreviewNode::~PreviewNode() {
    // The window's frames are done with the textures: the importer gives
    // them back, and the ring frees every slot this consumer held.
    m_material.texture = nullptr;
    if (m_importer) m_importer->shutdown();
    m_importer.reset();
    m_ring->consumerReset();
}

SyncResult PreviewNode::sync(const Options& options) {
    SyncResult result;
    if (!m_importer) {
        result.error = m_unavailable;
        return result;
    }

    // Releases that finished on the GPU: their slots go back to the producer.
    for (std::size_t slot : m_importer->collect()) m_ring->retire(slot);

    if (std::optional<gpu::FrameRing::Frame> frame = m_ring->present()) {
        QString error;
        QSGTexture* texture = m_importer->acquire(*frame, &error);
        if (!texture) {
            // The frame cannot be shown. Its slot returns to the producer
            // and the previous frame stays on screen.
            m_ring->reject(frame->slot);
            result.error = error;
            result.hasFrame = m_current.has_value();
            if (m_current) {
                const gpu::ShareDescriptor& d = m_current->texture->descriptor();
                result.frameSize = QSize(int(d.width), int(d.height));
                updateGeometry(options);
            }
            result.pollAgain = m_importer->pending();
            return result;
        }
        // Every frame that drew the previous texture has been submitted
        // (the last one ended before this sync began), so its release is
        // ordered after them on the queue.
        if (m_current) m_importer->release(m_current->slot);
        m_current = std::move(frame);
        m_material.texture = texture;
        result.newFrame = true;

        std::vector<std::uint64_t> live;
        for (std::size_t i = 0; i < m_ring->capacity(); ++i) {
            if (auto shared = m_ring->texture(i)) live.push_back(shared->id());
        }
        m_importer->prune(live);
    }

    if (m_current) {
        const gpu::ShareDescriptor& d = m_current->texture->descriptor();
        result.hasFrame = true;
        result.frameSize = QSize(int(d.width), int(d.height));
        m_material.straightAlpha = !d.premultiplied;
        const bool isFloat = d.format == gpu::ShareFormat::Rgba16Float;
        m_material.linearLight = options.colorEncoding == GpuPreviewItem::Linear ||
                                 (options.colorEncoding == GpuPreviewItem::Auto && isFloat);
        m_material.texture->setFiltering(QSGTexture::Linear);
        updateGeometry(options);
    }
    markDirty(DirtyMaterial | DirtyGeometry);
    result.pollAgain = m_importer->pending();
    return result;
}

void PreviewNode::updateGeometry(const Options& options) {
    const gpu::ShareDescriptor& d = m_current->texture->descriptor();
    QRectF target = options.bounds;
    QRectF source(0, 0, 1, 1);
    const qreal frameAspect = qreal(d.width) / qreal(d.height);
    const qreal boundsAspect = target.height() > 0 ? target.width() / target.height() : frameAspect;
    if (options.fillMode == GpuPreviewItem::PreserveAspectFit) {
        if (boundsAspect > frameAspect) {
            const qreal width = target.height() * frameAspect;
            target = QRectF(target.x() + (target.width() - width) / 2, target.y(), width, target.height());
        } else {
            const qreal height = target.width() / frameAspect;
            target = QRectF(target.x(), target.y() + (target.height() - height) / 2, target.width(), height);
        }
    } else if (options.fillMode == GpuPreviewItem::PreserveAspectCrop) {
        if (boundsAspect > frameAspect) {
            const qreal visible = frameAspect / boundsAspect;
            source = QRectF(0, (1 - visible) / 2, 1, visible);
        } else {
            const qreal visible = boundsAspect / frameAspect;
            source = QRectF((1 - visible) / 2, 0, visible, 1);
        }
    }
    // A wgpu texture has its origin at the top left, as Qt Quick has.
    if (options.mirrorVertically) source = QRectF(source.x(), source.bottom(), source.width(), -source.height());
    QSGGeometry::updateTexturedRectGeometry(&m_geometry, target, source);
}

}  // namespace nt::preview
