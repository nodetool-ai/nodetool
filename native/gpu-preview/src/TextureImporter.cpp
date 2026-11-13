#include "TextureImporter.h"

#include <QQuickWindow>
#include <QSGRendererInterface>

namespace nt::preview {

std::unique_ptr<TextureImporter> TextureImporter::create(QQuickWindow* window, QString* reason) {
    const QSGRendererInterface* renderer = window->rendererInterface();
    const QSGRendererInterface::GraphicsApi api = renderer->graphicsApi();
    switch (api) {
    case QSGRendererInterface::Vulkan:
#if NT_PREVIEW_VULKAN
        return createVulkanImporter(window, reason);
#else
        *reason = QStringLiteral("this build has no Vulkan texture import");
        return nullptr;
#endif
    case QSGRendererInterface::Metal:
#if NT_PREVIEW_METAL
        return createMetalImporter(window, reason);
#else
        *reason = QStringLiteral("this build has no Metal texture import");
        return nullptr;
#endif
    case QSGRendererInterface::Direct3D12:
        *reason = QStringLiteral("Direct3D 12 texture sharing is not implemented");
        return nullptr;
    case QSGRendererInterface::Direct3D11:
        *reason = QStringLiteral("the window renders with Direct3D 11; texture sharing needs a Direct3D 12 "
                                 "window, and Direct3D 12 sharing is not implemented");
        return nullptr;
    case QSGRendererInterface::OpenGL:
        *reason = QStringLiteral("the window renders with OpenGL, which has no texture sharing here");
        return nullptr;
    case QSGRendererInterface::Software:
        *reason = QStringLiteral("the window renders in software and has no GPU device");
        return nullptr;
    default:
        *reason = QStringLiteral("the window's graphics API has no texture sharing");
        return nullptr;
    }
}

}  // namespace nt::preview
