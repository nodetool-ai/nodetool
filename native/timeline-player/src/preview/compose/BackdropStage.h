#pragma once
#include <cstdint>
#include <functional>
#include <memory>
#include <vector>

class QJsonObject;
class QRhiTextureRenderTarget;
namespace nt {
struct EffectContext;
struct LayerFrame;
struct SceneAdjustment;
// A stage that replaces the composited backdrop below an adjustment layer.
// Render thread only: a renderer creates and uses its own stages.
class BackdropStage {
public:
    virtual ~BackdropStage() = default;
    virtual bool applies(const QJsonObject& ext) const = 0;
    // Full-surface premultiplied input, read-only and distinct from output.
    // Write the complete replacement in framebuffer orientation. Retire every
    // GPU resource through the context until its last use.
    virtual bool render(const EffectContext&, const LayerFrame& accumulation, QRhiTextureRenderTarget& output,
                        const SceneAdjustment&) = 0;
};
using BackdropStageToken = std::uint64_t;
using BackdropStageFactory = std::function<std::unique_ptr<BackdropStage>()>;
// Thread-safe (the registry's mutex).
BackdropStageToken registerBackdropStage(BackdropStageFactory factory);
void unregisterBackdropStage(BackdropStageToken token);
// Each renderer owns a snapshot, in registration order, taken at QRhi initialization.
std::vector<std::unique_ptr<BackdropStage>> registeredBackdropStages();
}
