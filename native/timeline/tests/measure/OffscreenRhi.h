#pragma once
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <rhi/qrhi.h>
#include <memory>

// UI thread only. The render control owns QRhi. Its target owns every GPU
// resource and releases them before invalidating the control. No native window.
class OffscreenRhi final {
public:
    OffscreenRhi(QQuickRenderControl& control, QQuickWindow& window)
        : m_control(control), m_window(window) {}
    OffscreenRhi(const OffscreenRhi&) = delete;
    OffscreenRhi& operator=(const OffscreenRhi&) = delete;
    OffscreenRhi(OffscreenRhi&&) = delete;
    OffscreenRhi& operator=(OffscreenRhi&&) = delete;
    ~OffscreenRhi() {
        m_window.setRenderTarget(QQuickRenderTarget());
        m_target.reset();
        m_pass.reset();
        m_depth.reset();
        m_texture.reset();
        if (m_initialized) { m_control.invalidate(); }
    }
    bool initialize(const QSize& size) {
        if (!m_control.initialize()) { return false; }
        m_initialized = true;
        auto* rhi = m_control.rhi();
        if (!rhi || rhi->backend() == QRhi::Null) { return false; }
        m_texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        m_depth.reset(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
        if (!m_texture || !m_depth || !m_texture->create() || !m_depth->create()) { return false; }
        QRhiTextureRenderTargetDescription description{QRhiColorAttachment(m_texture.get())};
        description.setDepthStencilBuffer(m_depth.get());
        m_target.reset(rhi->newTextureRenderTarget(description));
        if (!m_target) { return false; }
        m_pass.reset(m_target->newCompatibleRenderPassDescriptor());
        if (!m_pass) { return false; }
        m_target->setRenderPassDescriptor(m_pass.get());
        if (!m_target->create()) { return false; }
        m_window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(m_target.get()));
        return true;
    }
    void render() {
        m_control.polishItems();
        m_control.beginFrame();
        m_control.sync();
        m_control.render();
        m_control.endFrame();
    }
    void finish() {
        if (auto* rhi = m_control.rhi()) { rhi->finish(); }
    }

private:
    QQuickRenderControl& m_control;
    QQuickWindow& m_window;
    bool m_initialized = false;
    std::unique_ptr<QRhiTexture> m_texture;
    std::unique_ptr<QRhiRenderBuffer> m_depth;
    std::unique_ptr<QRhiTextureRenderTarget> m_target;
    std::unique_ptr<QRhiRenderPassDescriptor> m_pass;
};
