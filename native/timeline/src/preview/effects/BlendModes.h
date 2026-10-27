#pragma once
#include "preview/compose/ComposeRegistry.h"
#include <array>
#include <string_view>

namespace nt::effects {
// Index + 1 is the stable GPU ID from packages/gpu/src/blend/blendModes.ts.
inline constexpr std::array<std::string_view,12> blendModes{
    "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
    "color-burn", "hard-light", "soft-light", "difference", "exclusion", "add"
};

class BlendModeHandler final : public BlendHandler {
public:
    bool render(const EffectContext&, const LayerFrame& backdrop, const LayerFrame& layer,
                QRhiTextureRenderTarget& output, const std::string& mode, const QJsonObject&) override;
};
}
