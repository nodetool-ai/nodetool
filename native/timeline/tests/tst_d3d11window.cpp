#include "preview/hw/HwWindow.h"
#include "preview/hw/D3D11Interop.h"
#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"

#include <QGuiApplication>
#include <QQuickRenderControl>
#include <QQuickWindow>
#include <QTest>
#include <rhi/qrhi.h>
#include <rhi/qrhi_platform.h>

#include <d3d11.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <libavutil/hwcontext_d3d11va.h>
extern "C" {
#include <libavutil/hwcontext.h>
#include <libavutil/frame.h>
}

class TestD3D11Window : public QObject {
    Q_OBJECT

private slots:
    void cacheCopySurvivesSourceReuse() {
        AVBufferRef* deviceRaw = nullptr;
        if (av_hwdevice_ctx_create(&deviceRaw, AV_HWDEVICE_TYPE_D3D11VA, nullptr, nullptr, 0) < 0) {
            QSKIP("No D3D11 device for the GPU copy test");
        }
        const auto unref = [](AVBufferRef* ref) { av_buffer_unref(&ref); };
        std::unique_ptr<AVBufferRef, decltype(unref)> device(deviceRaw, unref);
        std::unique_ptr<AVBufferRef, decltype(unref)> pool(av_hwframe_ctx_alloc(device.get()), unref);
        QVERIFY(pool);
        auto* frames = reinterpret_cast<AVHWFramesContext*>(pool->data);
        frames->format = AV_PIX_FMT_D3D11;
        frames->sw_format = AV_PIX_FMT_NV12;
        frames->width = 64;
        frames->height = 32;
        frames->initial_pool_size = 1;
        static_cast<AVD3D11VAFramesContext*>(frames->hwctx)->BindFlags = D3D11_BIND_DECODER;
        QVERIFY(av_hwframe_ctx_init(pool.get()) >= 0);
        nt::hw::CacheFrame source(av_frame_alloc());
        QVERIFY(av_hwframe_get_buffer(pool.get(), source.get(), 0) >= 0);
        QVERIFY(!nt::hw::isCacheFrame(source.get()));
        nt::hw::CacheFrame pixels(av_frame_alloc());
        pixels->format = AV_PIX_FMT_NV12;
        pixels->width = 64;
        pixels->height = 32;
        QVERIFY(av_frame_get_buffer(pixels.get(), 32) >= 0);
        for (int y = 0; y < 32; ++y) memset(pixels->data[0] + y * pixels->linesize[0], 73, 64);
        for (int y = 0; y < 16; ++y) memset(pixels->data[1] + y * pixels->linesize[1], 128, 64);
        QVERIFY(av_hwframe_transfer_data(source.get(), pixels.get(), 0) >= 0);
        source->pts = 123;
        const int refs = av_buffer_get_ref_count(pool.get());
        auto copy = nt::hw::cacheCopy(source.get());
        QVERIFY(copy);
        QCOMPARE(av_buffer_get_ref_count(pool.get()), refs);
        QVERIFY(copy->data[0] != source->data[0]);
        QCOMPARE(copy->pts, int64_t(123));
        for (int y = 0; y < 32; ++y) memset(pixels->data[0] + y * pixels->linesize[0], 19, 64);
        QVERIFY(av_hwframe_transfer_data(source.get(), pixels.get(), 0) >= 0);
        source.reset();
        nt::hw::CacheFrame reused(av_frame_alloc());
        QVERIFY(av_hwframe_get_buffer(pool.get(), reused.get(), 0) >= 0);
        reused.reset();
        pool.reset();
        device.reset();
        nt::hw::CacheFrame readback(av_frame_alloc());
        QVERIFY(av_hwframe_transfer_data(readback.get(), copy.get(), 0) >= 0);
        for (int y = 0; y < 32; ++y) {
            for (int x = 0; x < 64; ++x) QCOMPARE(readback->data[0][y * readback->linesize[0] + x], uint8_t(73));
        }
        for (int y = 0; y < 16; ++y) {
            for (int x = 0; x < 64; ++x) QCOMPARE(readback->data[1][y * readback->linesize[1] + x], uint8_t(128));
        }
        QVERIFY(nt::hw::isCacheFrame(copy.get()));
        const size_t bytes = 64 * 32 * 3 / 2;
        nt::FrameCache cache(bytes * 2);
        auto first = std::make_shared<nt::DecodedFrame>();
        first->frame = copy.release();
        first->hardware = true;
        first->ptsSec = 1.0;
        auto second = std::make_shared<nt::DecodedFrame>();
        second->frame = nt::hw::cacheCopy(first->frame).release();
        QVERIFY(second->frame);
        second->hardware = true;
        second->ptsSec = 2.0;
        cache.insert("gpu", 1.0, first, bytes, -1.0);
        cache.insert("gpu", 2.0, second, bytes, 1.0);
        QCOMPARE(cache.lookup("gpu", 1.5), first);
        QCOMPARE(cache.bytes(), bytes * 2);
        nt::FrameCache::shared().insert("gpu", 1.0, first, bytes, -1.0);
        QQuickRenderControl control;
        QQuickWindow window(&control);
        nt::hw::prepareWindow(&window);
        QVERIFY(control.initialize());
        auto interop = nt::hw::D3D11Interop::create(control.rhi());
        QVERIFY(interop);
        QVERIFY(!nt::hw::cacheDeviceMatches(first->frame));
        QCOMPARE(nt::FrameCache::shared().bytes(), size_t(0));
        QVERIFY(!cache.lookup("gpu", 1.5));
        nt::FrameCache::shared().insert("stale", 1.0, first, bytes, -1.0);
        QCOMPARE(nt::FrameCache::shared().bytes(), size_t(0));
        std::weak_ptr<nt::DecodedFrame> held = first;
        first.reset();
        second.reset();
        cache.clear();
        QVERIFY(held.expired());
        QCOMPARE(cache.bytes(), size_t(0));
    }
    void softwarePreferenceSelectsSoftwareAdapter() {
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(64, 64);
        nt::hw::prepareWindow(&window);
        QVERIFY(control.initialize());
        QCOMPARE(control.rhi()->backend(), QRhi::D3D11);

        const auto* handles = static_cast<const QRhiD3D11NativeHandles*>(control.rhi()->nativeHandles());
        QVERIFY(handles);
        auto* device = static_cast<ID3D11Device*>(handles->dev);
        QVERIFY(device);
        Microsoft::WRL::ComPtr<IDXGIDevice> dxgiDevice;
        QVERIFY(SUCCEEDED(device->QueryInterface(IID_PPV_ARGS(&dxgiDevice))));
        Microsoft::WRL::ComPtr<IDXGIAdapter> adapter;
        QVERIFY(SUCCEEDED(dxgiDevice->GetAdapter(&adapter)));
        Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter1;
        QVERIFY(SUCCEEDED(adapter.As(&adapter1)));
        DXGI_ADAPTER_DESC1 description{};
        QVERIFY(SUCCEEDED(adapter1->GetDesc1(&description)));
        QVERIFY2(description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE,
                 qPrintable(QString::fromWCharArray(description.Description)));
    }
};

int main(int argc, char** argv) {
    qputenv("QSG_RHI_BACKEND", "d3d11");
    qputenv("QSG_RHI_PREFER_SOFTWARE_RENDERER", "1");
    QGuiApplication app(argc, argv);
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D11);
    TestD3D11Window test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_d3d11window.moc"
