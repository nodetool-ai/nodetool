#include "export/OffscreenFrames.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/hw/HwWindow.h"
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <rhi/qrhi.h>
#include <algorithm>
#include <stdexcept>

namespace nt::exporting {
struct OffscreenFrames::Impl {
    PlaybackClock clock;
    QQuickRenderControl control;
    QQuickWindow window{&control};
    // Qt owns the compositor. It must die before the render target and QRhi.
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderBuffer> depth;
    std::unique_ptr<QRhiRenderPassDescriptor> pass;
    std::unique_ptr<QRhiTextureRenderTarget> target;
    PreviewCompositor* compositor = nullptr;
    void initialize(TimelineModel& model) {
        const QSize size(model.canvasWidth(), model.canvasHeight());
        nt::hw::prepareWindow(&window);
        window.resize(size);
        clock.setDurationMs(std::max(model.contentEndMs(), model.durationMs()) + 1000.0 / model.fps());
        compositor = new PreviewCompositor(window.contentItem());
        compositor->setTimeline(&model);
        compositor->setClock(&clock);
        compositor->setSize(size);
        if (!control.initialize()) {
            throw std::runtime_error("QQuickRenderControl could not create a QRhi for export");
        }
        auto* rhi = control.rhi();
        texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        depth.reset(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
        if (!texture->create() || !depth->create()) {
            throw std::runtime_error("Cannot allocate export render target");
        }
        QRhiTextureRenderTargetDescription description{QRhiColorAttachment(texture.get())};
        description.setDepthStencilBuffer(depth.get());
        target.reset(rhi->newTextureRenderTarget(description));
        pass.reset(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(pass.get());
        if (!target->create()) {
            throw std::runtime_error("Cannot create export render target");
        }
        window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.get()));
    }
    ~Impl() {
        // Destroy the item before the target, window and render control, in
        // that order. The render control owns the QRhi and must die last.
        delete compositor;
        window.setRenderTarget({});
    }
};
OffscreenFrames::OffscreenFrames(TimelineModel& model) : m_impl(std::make_unique<Impl>()) {
    m_impl->initialize(model);
}
OffscreenFrames::~OffscreenFrames() = default;
QImage OffscreenFrames::capture(qint64 index, double fps, const std::function<bool()>& cancelled) {
    auto& s = *m_impl;
    s.clock.seek(static_cast<double>(index) * 1000.0 / fps);
    s.compositor->requestCapture();
    QElapsedTimer timeout;
    timeout.start();
    while (!s.compositor->captureReady()) {
        if (cancelled()) return {};
        s.compositor->update();
        QCoreApplication::processEvents();
        s.control.polishItems();
        s.control.beginFrame();
        s.control.sync();
        s.control.render();
        s.control.endFrame();
        QCoreApplication::processEvents();
        if (!s.compositor->renderError().isEmpty()) {
            throw std::runtime_error(s.compositor->renderError().toStdString());
        }
        if (timeout.elapsed() > 15000) {
            throw std::runtime_error("No exact compositor frame within 15 seconds");
        }
    }
    return s.compositor->takeCapture().convertToFormat(QImage::Format_RGBA8888);
}
}
