#pragma once

// The consumer side of texture sharing (graph-runner src/host/gpu_share.h)
// for one Qt Quick window: opens shared textures on the window's graphics
// device, takes and returns ownership of their content, and tells when the
// window's GPU has finished with a frame.
//
// One implementation exists per graphics API. create() verifies that the
// window's device can open textures of the producer's device and says why
// not. There is no fallback that copies pixels.

#include "host/gpu_share.h"

#include <QString>

#include <cstddef>
#include <memory>
#include <vector>

class QQuickWindow;
class QSGTexture;

namespace nt::preview {

// Thread affinity: render thread only (the scene graph's), including the
// destructor.
class TextureImporter {
public:
    virtual ~TextureImporter() = default;

    // Null with `reason` set when the window's graphics API or device
    // cannot take shared textures.
    static std::unique_ptr<TextureImporter> create(QQuickWindow* window, QString* reason);

    // Opens the frame's texture (once per texture, then cached) and takes
    // ownership of its content for sampling. The result belongs to the
    // importer and stays valid until release() of the same slot completes.
    // Null with `error` set on failure.
    virtual QSGTexture* acquire(const gr::host::gpu::FrameRing::Frame& frame, QString* error) = 0;

    // The scene graph no longer draws with the texture of `slot`: every
    // frame that sampled it has been submitted. Starts handing its content
    // back.
    virtual void release(std::size_t slot) = 0;

    // The slots whose release has completed on the GPU since the last call.
    // Never blocks.
    virtual std::vector<std::size_t> collect() = 0;

    // Whether releases are still in flight (the caller then polls again).
    virtual bool pending() const = 0;

    // Drops imports of textures that are no longer in `live`.
    virtual void prune(const std::vector<std::uint64_t>& live) = 0;

    // Returns every texture still held and frees all imports. May block
    // until the window's GPU is idle. Called before the node goes away.
    virtual void shutdown() = 0;

    // How many textures are imported now (tests, diagnostics).
    virtual int imports() const = 0;
};

#if NT_PREVIEW_VULKAN
std::unique_ptr<TextureImporter> createVulkanImporter(QQuickWindow* window, QString* reason);
#endif
#if NT_PREVIEW_METAL
std::unique_ptr<TextureImporter> createMetalImporter(QQuickWindow* window, QString* reason);
#endif

}  // namespace nt::preview
