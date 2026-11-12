#pragma once
#include "control.h"
#include <limits>

namespace nt::realtime {
inline constexpr unsigned NO_RENDER_TEXTURE = std::numeric_limits<unsigned>::max();
enum class RenderFormat { rgba8unorm, rgba16float };
enum class RenderColorSpace { linear, srgb, encodedSdr, data };
// Immutable prepare-thread descriptions, transferred with the schedule.
struct RenderTextureSpec {
    unsigned width = 0;
    unsigned height = 0;
    RenderFormat format = RenderFormat::rgba8unorm;
    bool operator==(const RenderTextureSpec&) const = default;
    std::size_t bytes() const noexcept;
};
struct RenderSlotSpec {
    std::string id;
    RenderTextureSpec texture;
    RenderColorSpace colorSpace = RenderColorSpace::linear;
    bool premultiplied = true;
};
struct RenderPassSpec {
    std::string node;
    std::string module;
    std::vector<std::string> inputs;
    unsigned uniformCount = 0;
    RenderTextureSpec output;
    RenderColorSpace colorSpace = RenderColorSpace::linear;
    bool retained = true;
};
struct RenderOptions {
    std::size_t textureBudget = 512ull * 1024 * 1024;
    // Other session textures, including a present target, share the budget.
    std::size_t reservedTextureBytes = 0;
};
// Render-thread snapshots. Textures use slot indices followed by pool indices.
// Versions must change whenever a slot's pixels or backing texture change.
struct RenderFrameInput {
    std::span<const ControlValue> registers;
    std::span<const std::uint64_t> slotVersions;
    bool running = false;
    bool targetChanged = false;
};
struct RenderCommand {
    unsigned pass = 0;
    unsigned output = NO_RENDER_TEXTURE;
    std::span<const unsigned> inputs;
    std::span<const ControlValue> uniforms;
};
struct RenderFramePlan {
    bool accepted = false;
    bool present = false;
    unsigned source = NO_RENDER_TEXTURE;
    std::size_t evictions = 0;
    std::span<const RenderCommand> commands;
};

// Prepared on the host, then exclusively owned by one render thread.
// Owns scheduling metadata and command storage, not GPU handles. A GPU backend
// must own textures matching textures(), pipelines matching passes(), and the
// target. Destroy this object only after the render thread stops accessing it.
class RenderSchedule {
    struct Storage;
public:
    explicit RenderSchedule(std::unique_ptr<Storage> storage);
    ~RenderSchedule();
    RenderSchedule(const RenderSchedule&) = delete;
    RenderSchedule& operator=(const RenderSchedule&) = delete;
    struct Prepared;
    static Prepared prepare(const Plan& plan, const Registry& registry, RenderOptions options = {});
    std::span<const RenderSlotSpec> slots() const noexcept;
    std::span<const RenderPassSpec> passes() const noexcept;
    // Slot textures first, then separate volatile and retained pools. Allocate
    // these once before activating the schedule. Retained pool cells use LRU.
    std::span<const RenderTextureSpec> textures() const noexcept;
    std::size_t textureBytes() const noexcept;
    RenderColorSpace presentationColorSpace() const noexcept;
    // No allocation, JSON, I/O or GPU calls. An accepted frame with present=true
    // must be completed before another frame. Returned spans last until then.
    RenderFramePlan beginFrame(const RenderFrameInput& input) noexcept;
    // success means the backend encoded/submitted every command and presented.
    // On failure all outputs are invalidated. GPU device loss still stops the host.
    void completeFrame(bool success) noexcept;
private:
    std::unique_ptr<Storage> storage_;
};
struct RenderSchedule::Prepared {
    std::unique_ptr<RenderSchedule> schedule;
    std::optional<Diagnostic> error;
};
}
