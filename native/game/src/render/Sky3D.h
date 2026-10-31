#pragma once
#include "document/Schema.h"
#include <QMatrix4x4>
#include <QSize>
#include <QVector3D>
#include <memory>
class QRhi;
class QRhiCommandBuffer;
class QRhiTexture;
class QRhiSampler;
class QRhiRenderPassDescriptor;
class QRhiResourceUpdateBatch;
namespace nodetool::game {
struct SkyCamera3D {
  QMatrix4x4 inverseViewProjection;
  QVector3D cameraPosition;
  QSize pixelSize;
  float far = 10000;
};
QVector3D proceduralSkyRadiance3D(const Json &sky, QVector3D sunDirection,
                                  QVector3D direction);
class Sky3D {
public:
  Sky3D();
  ~Sky3D();
  void prepare(QRhi *rhi, QRhiCommandBuffer *commands, const Json &environment,
               QVector3D sunDirection);
  void prepareBackground(QRhiResourceUpdateBatch *updates,
                         QRhiRenderPassDescriptor *pass,
                         const SkyCamera3D &camera);
  void drawBackground(QRhiCommandBuffer *commands);
  QRhiTexture *cubeTexture() const;
  QRhiTexture *environmentTexture() const;
  QRhiSampler *sampler() const;
  float intensity() const;
  void reset();
  Json report() const;

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
