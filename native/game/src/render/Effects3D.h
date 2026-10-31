#pragma once
#include "document/Schema.h"
#include <QMatrix4x4>
#include <QSize>
#include <QVector3D>
#include <QVector4D>
#include <memory>
#include <rhi/qrhi.h>
#include <string>
#include <vector>
namespace nodetool::game {
struct ParticleCamera3D {
  QMatrix4x4 viewProjection, view;
  QVector3D right, up, position;
  QSize pixelSize;
  QRhiTexture *linearDepth = nullptr;
  QRhiSampler *depthSampler = nullptr;
  QVector4D fogColor, fogSettings;
  std::vector<float> transparentDepths;
};
struct ParticleBatch3D {
  int first = 0, count = 0;
  float depth = 0;
  bool additive = false;
  std::string id;
};
struct MeshParticleVertex3D {
  float x, y, z, nx, ny, nz, r, g, b, a;
};
struct MeshParticleBatch3D {
  std::vector<MeshParticleVertex3D> vertices;
  float depth = 0;
  bool additive = false, unlit = false;
  std::string id;
};
struct ParticleVertex3D {
  float x, y, z, u, v, r, g, b, a, softness;
};
class Effects3D {
public:
  Effects3D();
  ~Effects3D();
  void prepareGeometry(const Json &frame, const ParticleCamera3D &camera);
  void prepare(QRhi *rhi, QRhiResourceUpdateBatch *updates,
               QRhiRenderPassDescriptor *pass, const Json &frame,
               const ParticleCamera3D &camera);
  const std::vector<ParticleBatch3D> &batches() const;
  const std::vector<MeshParticleBatch3D> &meshBatches() const;
  const std::vector<ParticleVertex3D> &quadVertices() const;
  void drawBatch(QRhiCommandBuffer *commands, std::size_t index) const;
  std::size_t vertexBytes() const;

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
