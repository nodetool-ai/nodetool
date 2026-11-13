// Metal import of shared textures into a Qt Quick window.
//
// wgpu and Qt each ask Metal for a device of the same GPU, and Metal hands
// out one MTLDevice object per GPU, so both runtimes hold the same device.
// create() checks that identity. A texture of that device is then valid in
// Qt's command buffers as it is: the consumer receives a retained
// id<MTLTexture>, and no memory is exported or copied.
//
// Metal has no layouts and no queue family ownership. What remains is
// ordering: the producer publishes a frame only after its command buffers
// completed (SharedTexture::publish), and release() learns when Qt's GPU
// work with a texture has completed by committing an empty command buffer
// on Qt's queue. A queue runs its command buffers in the order they were
// committed, so that buffer completes after every frame committed before it.
//
// Built and tested only by the macOS job of native-gpu-preview.yml. See the
// status table in native/gpu-preview/README.md.
#include "TextureImporter.h"

#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QSGTexture>
#include <private/qquickwindow_p.h>

#import <Metal/Metal.h>

#include <algorithm>
#include <atomic>
#include <map>
#include <memory>

namespace nt::preview {
namespace {

namespace gpu = gr::host::gpu;

MTLPixelFormat pixelFormat(gpu::ShareFormat format) {
    return format == gpu::ShareFormat::Rgba16Float ? MTLPixelFormatRGBA16Float : MTLPixelFormatRGBA8Unorm;
}

// Thread affinity: render thread only, except the completion flags, which
// Metal's completion handlers set from its own thread.
class MetalImporter final : public TextureImporter {
public:
    MetalImporter(QQuickWindow* window, id<MTLDevice> device, id<MTLCommandQueue> queue)
        : m_window(window), m_device(device), m_queue(queue) {}

    ~MetalImporter() override { shutdown(); }

    QSGTexture* acquire(const gpu::FrameRing::Frame& frame, QString* error) override {
        const gpu::ShareDescriptor& d = frame.texture->descriptor();
        if (d.backend != gpu::ShareBackend::Metal) {
            *error = QStringLiteral("the frame comes from a %1 device and the window renders with Metal")
                         .arg(QLatin1String(gpu::shareBackendName(d.backend)));
            return nullptr;
        }
        if (d.metalDeviceRegistryId != m_device.registryID) {
            *error = QStringLiteral("the compute device and the window use different GPUs, so their textures "
                                    "cannot be shared");
            return nullptr;
        }
        auto it = m_imports.find(frame.texture->id());
        if (it == m_imports.end()) {
            Import created;
            std::string openError;
            created.handle = frame.texture->open(openError);
            if (!created.handle.object()) {
                *error = QStringLiteral("cannot open the shared texture: %1").arg(QString::fromStdString(openError));
                return nullptr;
            }
            id<MTLTexture> texture = (__bridge id<MTLTexture>)created.handle.object();
            // The same device object, not only the same GPU: a texture is
            // usable only in command buffers of the device that made it.
            if (texture.device != m_device) {
                *error = QStringLiteral("the shared texture belongs to another MTLDevice than the window's");
                return nullptr;
            }
            if (texture.pixelFormat != pixelFormat(d.format)) {
                *error = QStringLiteral("the shared texture does not have the format its description names");
                return nullptr;
            }
            created.texture.reset(QQuickWindowPrivate::get(m_window)->createTextureFromNativeTexture(
                quint64(quintptr((__bridge void*)texture)), 0, uint(texture.pixelFormat),
                QSize(int(d.width), int(d.height)), QQuickWindow::TextureHasAlphaChannel));
            if (!created.texture) {
                *error = QStringLiteral("Qt could not wrap the shared Metal texture");
                return nullptr;
            }
            created.lease = frame.texture;
            it = m_imports.emplace(frame.texture->id(), std::move(created)).first;
        }
        Import& entry = it->second;
        if (entry.acquired) {
            *error = QStringLiteral("a shared texture was presented twice without a release");
            return nullptr;
        }
        entry.acquired = true;
        entry.slot = frame.slot;
        return entry.texture.get();
    }

    void release(std::size_t slot) override {
        for (auto& [id, entry] : m_imports) {
            if (!entry.acquired || entry.slot != slot) continue;
            entry.acquired = false;
            break;
        }
        // Completes after every frame Qt committed before now. The flag is
        // shared with Metal's completion handler, which may run after this
        // importer is gone.
        auto done = std::make_shared<std::atomic<bool>>(false);
        id<MTLCommandBuffer> marker = [m_queue commandBuffer];
        [marker addCompletedHandler:^(id<MTLCommandBuffer>) {
          done->store(true);
        }];
        [marker commit];
        m_pending.push_back({slot, std::move(done), marker});
    }

    std::vector<std::size_t> collect() override {
        std::vector<std::size_t> finished;
        for (auto it = m_pending.begin(); it != m_pending.end();) {
            if (!it->done->load()) {
                ++it;
                continue;
            }
            finished.push_back(it->slot);
            it = m_pending.erase(it);
        }
        return finished;
    }

    bool pending() const override { return !m_pending.empty(); }

    void prune(const std::vector<std::uint64_t>& live) override {
        if (!m_pending.empty()) return;  // a release may still cover an import
        for (auto it = m_imports.begin(); it != m_imports.end();) {
            if (it->second.acquired || std::find(live.begin(), live.end(), it->first) != live.end()) {
                ++it;
            } else {
                it = m_imports.erase(it);
            }
        }
    }

    void shutdown() override {
        // The window's frames are finished. Wait for the markers so no
        // command buffer of Qt's still samples a texture when the producer
        // gets it back.
        for (Pending& pending : m_pending) [pending.marker waitUntilCompleted];
        m_pending.clear();
        m_imports.clear();
    }

    int imports() const override { return int(m_imports.size()); }

private:
    struct Import {
        // Keeps the producer's allocation alive while Qt may sample it.
        // Shared with the producer's ring (gpu_share.h).
        std::shared_ptr<gpu::SharedTexture> lease;
        gpu::NativeShareHandle handle;  // the retained id<MTLTexture>
        std::unique_ptr<QSGTexture> texture;
        bool acquired = false;
        std::size_t slot = 0;
    };
    struct Pending {
        std::size_t slot;
        // Shared with the completion handler block (see release()).
        std::shared_ptr<std::atomic<bool>> done;
        id<MTLCommandBuffer> marker;
    };

    QQuickWindow* m_window;  // borrowed; outlives the scene graph nodes
    id<MTLDevice> m_device;
    id<MTLCommandQueue> m_queue;
    std::map<std::uint64_t, Import> m_imports;  // by SharedTexture::id()
    std::vector<Pending> m_pending;
};

}  // namespace

std::unique_ptr<TextureImporter> createMetalImporter(QQuickWindow* window, QString* reason) {
    QSGRendererInterface* renderer = window->rendererInterface();
    id<MTLDevice> device =
        (__bridge id<MTLDevice>)renderer->getResource(window, QSGRendererInterface::DeviceResource);
    id<MTLCommandQueue> queue =
        (__bridge id<MTLCommandQueue>)renderer->getResource(window, QSGRendererInterface::CommandQueueResource);
    if (!device || !queue) {
        *reason = QStringLiteral("the window's Metal device is not available yet");
        return nullptr;
    }
    return std::make_unique<MetalImporter>(window, device, queue);
}

}  // namespace nt::preview
