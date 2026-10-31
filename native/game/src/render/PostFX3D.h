#pragma once
#include "document/Schema.h"
#include <QSize>
#include <memory>
class QRhi;
class QRhiCommandBuffer;
class QRhiTexture;
namespace nodetool::game {
/** Explicit environment path only. Input is linear RGBA16F; output is display RGBA8. */
class PostFX3D {
public:
  PostFX3D();
  ~PostFX3D();
  QRhiTexture *render(QRhi *rhi, QRhiCommandBuffer *cb, QRhiTexture *hdrInput,
                     QSize size, const Json &environment);
  void reset();
  [[nodiscard]] Json report() const;
private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
