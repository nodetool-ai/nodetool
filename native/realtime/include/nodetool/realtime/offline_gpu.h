#pragma once
#include "render.h"
#include <cstddef>

namespace nt::realtime {
// Host-owned prepare values, consumed before activation. No external GPU handles.
struct OfflineGpuOptions {
    bool softwareAdapter = true;
    std::size_t textureBudget = 512ull * 1024 * 1024;
    unsigned maxBindGroups = 32768;
};
struct OfflineFrameResult {
    bool accepted = false;
    bool presented = false;
    bool readbackQueued = false;
};
// Provisional offline M1 only (RT-F44 exception). One host thread owns the private
// instance/device, schedule, textures and callbacks from prepare through teardown.
// No sharing, live activation, background preparation or borrowed GPU handles.
class OfflineGpu {
    struct Storage;
public:
    explicit OfflineGpu(std::unique_ptr<Storage> storage);
    ~OfflineGpu();
    OfflineGpu(const OfflineGpu&) = delete;
    OfflineGpu& operator=(const OfflineGpu&) = delete;
    struct Prepared;
    // Catalog is the format-1 export of graph-runner/guest/host/gpu-catalog.mjs.
    // Synchronous pipelines and error scopes run only here, before activation.
    static Prepared prepare(const Plan& plan, const Registry& registry, std::string_view catalog, OfflineGpuOptions options = {});
    // Upload exact prepared slot bytes on the same owner thread between frames.
    // RGBA8 or IEEE half RGBA, already in the declared alpha/color convention.
    bool uploadSlot(unsigned slot, std::span<const std::byte> bytes) noexcept;
    OfflineFrameResult render(const RenderFrameInput& input, bool readback = false) noexcept;
    // One nonblocking device poll. Call between offline frames, never in a live loop.
    bool poll() noexcept;
    // Copy the oldest completed readback into caller storage, excluding row padding.
    // Returns false for no ready result, insufficient space or failed GPU state.
    bool takeReadback(std::span<std::byte> bytes, std::uint64_t& frame) noexcept;
    std::size_t readbackBytes() const noexcept;
    bool healthy() const noexcept;
private:
    std::unique_ptr<Storage> storage_;
};
struct OfflineGpu::Prepared { std::unique_ptr<OfflineGpu> gpu; std::optional<Diagnostic> error; };
}
