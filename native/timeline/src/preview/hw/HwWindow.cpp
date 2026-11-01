#include "preview/hw/HwWindow.h"

#include "preview/hw/HwInterop.h"

#include <QQuickGraphicsConfiguration>
#include <QQuickGraphicsDevice>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QtGlobal>

// A Vulkan scene graph (Linux CI on lavapipe with QSG_RHI_BACKEND=vulkan,
// or the VAAPI path) needs a QVulkanInstance on the window before
// QQuickRenderControl::initialize() or show(). Wherever the Vulkan headers
// exist, prepareWindow() attaches one when the scene graph uses Vulkan.
#if __has_include(<vulkan/vulkan.h>)
#define NT_WINDOW_VULKAN 1
#include <QVulkanInstance>
#endif

#if NT_HW_D3D11VA
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <d3d11.h>
#endif

namespace nt::hw {

namespace {
#if NT_WINDOW_VULKAN
bool usesVulkan() {
    return QQuickWindow::graphicsApi() == QSGRendererInterface::Vulkan ||
           qEnvironmentVariable("QSG_RHI_BACKEND") == QLatin1String("vulkan");
}

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

// Returns true when the window renders with Vulkan (an instance is attached).
bool attachVulkan(QQuickWindow* window) {
    if (!usesVulkan()) return false;
    if (QVulkanInstance* inst = sharedInstance()) window->setVulkanInstance(inst);
    return true;
}
#else
bool attachVulkan(QQuickWindow*) {
    return false;
}
#endif
}  // namespace

#if NT_HW_VAAPI

void selectGraphicsApi(bool hardwareDecode) {
    if (hardwareDecode && qEnvironmentVariableIsEmpty("QSG_RHI_BACKEND")) {
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
    }
}

void prepareWindow(QQuickWindow* window) {
    if (!attachVulkan(window)) return;
    QQuickGraphicsConfiguration config = window->graphicsConfiguration();
    config.setDeviceExtensions(VulkanInterop::requiredDeviceExtensions());
    window->setGraphicsConfiguration(config);
}

#elif NT_HW_D3D11VA

void selectGraphicsApi(bool) {}

void prepareWindow(QQuickWindow* window) {
    if (attachVulkan(window)) return;
    if (QQuickWindow::graphicsApi() != QSGRendererInterface::Direct3D11) return;
    if (qEnvironmentVariableIntValue("QSG_RHI_PREFER_SOFTWARE_RENDERER") != 0) return;
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

void prepareWindow(QQuickWindow* window) {
    attachVulkan(window);
}

#endif

}  // namespace nt::hw
