#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include "render/Hud3D.h"
#include "render/Scene2D.h"
#include <map>
#include <memory>
#include <rhi/qrhi.h>

namespace nodetool::game {
using SceneModels3D =
    std::map<std::string, std::shared_ptr<const PreparedModel>>;
// Opt-in linear-HDR scene renderer. Simulation supplies committed world poses;
// all GPU caches and presentation targets live on the Qt render thread.
class Scene3D {
public:
  Scene3D();
  ~Scene3D();
  Json render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiRenderTarget *output,
              const Json &document, const Json &frame,
              const std::shared_ptr<const SceneModels3D> &models,
              const std::shared_ptr<const RenderImages> &images,
              const std::shared_ptr<const RenderFonts> &fonts);

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
