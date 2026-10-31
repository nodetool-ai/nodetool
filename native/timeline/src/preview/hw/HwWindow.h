#pragma once

// The window side of the hardware decode seam (D15, M6): the graphics API
// and the device a hardware decoder can share.
//   macOS    Metal, chosen by Qt; nothing to do.
//   Windows  D3D11. prepareWindow() creates the ID3D11Device with
//            D3D11_CREATE_DEVICE_VIDEO_SUPPORT, which FFmpeg's D3D11VA needs,
//            and hands it to Qt Quick, so decoder and renderer share it.
//   Linux    Vulkan when hardware decode is wanted: selectGraphicsApi()
//            picks it unless QSG_RHI_BACKEND says otherwise, and
//            prepareWindow() gives the window a Vulkan instance and asks for
//            the DMA-BUF import extensions (VulkanInterop.h).
// Software decode works on every QRhi backend.

class QQuickWindow;

namespace nt::hw {

// Before the first window. `hardwareDecode`: the decode mode is hw or auto.
void selectGraphicsApi(bool hardwareDecode);
// Before the window's scene graph initializes (show(), or
// QQuickRenderControl::initialize()).
void prepareWindow(QQuickWindow* window);

}  // namespace nt::hw
