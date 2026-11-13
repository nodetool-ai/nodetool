#pragma once

// Window setup for texture sharing.

class QQuickWindow;

namespace nt::preview {

// Prepares `window` to take shared textures. Call it before the window is
// shown: Qt creates its graphics device at the first expose and enables
// only what was asked for by then. On Vulkan this adds the device extension
// that imports memory (VK_KHR_external_memory_fd) to the window's graphics
// configuration, keeping the ones already set. Other graphics APIs need no
// setup. GUI thread only.
void prepareWindow(QQuickWindow* window);

}  // namespace nt::preview
