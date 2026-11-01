#include "preview/hw/HwWindow.h"

#include <QGuiApplication>
#include <QQuickRenderControl>
#include <QQuickWindow>
#include <QTest>
#include <rhi/qrhi.h>
#include <rhi/qrhi_platform.h>

#include <d3d11.h>
#include <dxgi.h>
#include <wrl/client.h>

class TestD3D11Window : public QObject {
    Q_OBJECT

private slots:
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
