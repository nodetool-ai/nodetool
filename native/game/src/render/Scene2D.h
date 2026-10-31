#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include <QImage>
#include <map>
#include <memory>
#include <rhi/qrhi.h>
namespace nodetool::game {
using RenderImages = std::map<std::string, QImage>;
RenderImages prepareImages(PreparedAssets &assets, const Json &manifest);
class Scene2D {
public:
  Scene2D();
  ~Scene2D();
  Json render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiRenderTarget *target,
              const Json &document, const Json &frame,
              const std::shared_ptr<const RenderImages> &images);

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
