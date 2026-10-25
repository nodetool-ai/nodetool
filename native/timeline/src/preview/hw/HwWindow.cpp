#include "preview/hw/HwWindow.h"

#include "preview/hw/HwInterop.h"

#include <QQuickGraphicsConfiguration>
#include <QQuickGraphicsDevice>
#include <QQuickWindow>
#include <QSGRendererInterface>

#if NT_HW_VAAPI
#include <QVulkanInstance>
#include <QtGlobal>
#endif

#if NT_HW_D3D11VA
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <d3d11.h>
#endif

namespace nt::hw {

#if NT_HW_VAAPI

namespace {
QVulkanInstance* sharedInstance() {
    static QVulkanInstance* instance = []() {
        auto* inst = new QVulkanInstance();  // lives for the process
        inst->setApiVersion(QVersionNumber(1, 1));
        inst->setExtensions(QQuickGraphicsConfiguration::preferredInstanceExtensions());
        if (!inst->create()) {
            delete inst;
            return static_cast<QVulkanInstance*>(nullptr);
        }
        return inst;
    }();
    return instance;
}
}  // namespace

void selectGraphicsApi(bool hardwareDecode) {
    if (hardwareDecode && qEnvironmentVariableIsEmpty("QSG_RHI_BACKEND")) {
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
    }
}

void prepareWindow(QQuickWindow* window) {
    if (QQuickWindow::graphicsApi() != QSGRendererInterface::Vulkan) return;
    if (QVulkanInstance* inst = sharedInstance()) window->setVulkanInstance(inst);
    QQuickGraphicsConfiguration config = window->graphicsConfiguration();
    config.setDeviceExtensions(VulkanInterop::requiredDeviceExtensions());
    window->setGraphicsConfiguration(config);
}

#elif NT_HW_D3D11VA

void selectGraphicsApi(bool) {}

void prepareWindow(QQuickWindow* window) {
    if (QQuickWindow::graphicsApi() != QSGRendererInterface::Direct3D11) return;
    ID3D11Device* device = nullptr;
    ID3D11DeviceContext* context = nullptr;
    const UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
    const HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags, nullptr, 0,
                                         D3D11_SDK_VERSION, &device, nullptr, &context);
    if (FAILED(hr)) return;  // Qt creates its own device; hardware decode then falls back
    // Qt Quick does not take ownership: the references live for the process.
    window->setGraphicsDevice(QQuickGraphicsDevice::fromDeviceAndContext(device, context));
}

#else

void selectGraphicsApi(bool) {}

void prepareWindow(QQuickWindow*) {}

#endif

}  // namespace nt::hw
