#pragma once
#include "model/TimelineModel.h"
#include "preview/PreviewCompositor.h"
#include "preview/layers/LayerRegistry.h"
#include "preview/hw/HwWindow.h"
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QThread>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>

namespace nt::test {
class PaintSource final : public LayerSource {
    QImage m_image;
    std::unique_ptr<QRhiTexture> m_texture;
public:
    explicit PaintSource(QImage image) : m_image(std::move(image)) {}
    QSize frameSize() const override { return m_image.size(); }
    LayerFrame frameAt(const FrameContext& ctx, double) override {
        if (!m_texture) {
            m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA8, m_image.size()));
            if (!m_texture->create()) { return {}; }
            ctx.updates->uploadTexture(m_texture.get(), m_image);
        }
        LayerFrame result;
        result.format = LayerFrame::Format::Rgba8Premultiplied;
        result.planes[0] = m_texture.get();
        result.size = m_image.size();
        return result;
    }
};
class Still {
    QQuickRenderControl m_control;
    QQuickWindow m_window{&m_control};
    std::unique_ptr<QRhiTexture> m_texture;
    std::unique_ptr<QRhiRenderBuffer> m_depth;
    std::unique_ptr<QRhiTextureRenderTarget> m_target;
    std::unique_ptr<QRhiRenderPassDescriptor> m_pass;
    PreviewCompositor* m_compositor = nullptr;
public:
    ~Still() { delete m_compositor; }
    bool initialize(TimelineModel& model) {
        hw::prepareWindow(&m_window);
        const QSize size(model.canvasWidth(), model.canvasHeight());
        m_window.resize(size);
        m_compositor = new PreviewCompositor(m_window.contentItem());
        m_compositor->setTimeline(&model);
        m_compositor->setSize(size);
        m_compositor->setCollectFrameStats(true);
        if (!m_control.initialize()) { return false; }
        auto* rhi = m_control.rhi();
        m_texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        m_depth.reset(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
        if (!m_texture->create() || !m_depth->create()) { return false; }
        QRhiTextureRenderTargetDescription desc{QRhiColorAttachment(m_texture.get())};
        desc.setDepthStencilBuffer(m_depth.get());
        m_target.reset(rhi->newTextureRenderTarget(desc));
        m_pass.reset(m_target->newCompatibleRenderPassDescriptor());
        m_target->setRenderPassDescriptor(m_pass.get());
        if (!m_target->create()) { return false; }
        m_window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(m_target.get()));
        return true;
    }
    void setClock(PlaybackClock* clock) { m_compositor->setClock(clock); }
    QImage capture(int timeoutMs = 0) {
        QElapsedTimer timeout;
        timeout.start();
        m_compositor->requestCapture();
        for (int i = 0; i < 12 || timeout.elapsed() < timeoutMs; ++i) {
            m_compositor->update();
            QCoreApplication::processEvents();
            m_control.polishItems(); m_control.beginFrame(); m_control.sync(); m_control.render(); m_control.endFrame();
            if (m_compositor->captureReady()) { return m_compositor->takeCapture(); }
            if (timeoutMs > 0) { QThread::msleep(1); }
        }
        return {};
    }
    const std::vector<FrameStat>& stats() const { return m_compositor->frameStats(); }
};
}
