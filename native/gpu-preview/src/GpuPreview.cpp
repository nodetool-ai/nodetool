#include "GpuPreview.h"

#include <QQuickGraphicsConfiguration>
#include <QQuickWindow>

namespace nt::preview {

void prepareWindow(QQuickWindow* window) {
    QQuickGraphicsConfiguration configuration = window->graphicsConfiguration();
    QByteArrayList extensions = configuration.deviceExtensions();
    const QByteArray name = QByteArrayLiteral("VK_KHR_external_memory_fd");
    if (!extensions.contains(name)) extensions.append(name);
    configuration.setDeviceExtensions(extensions);
    window->setGraphicsConfiguration(configuration);
}

}  // namespace nt::preview
