#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include <QMatrix4x4>
#include <cstddef>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace nodetool::game {
struct DecalVertex3D {
  float x, y, z, nx, ny, nz, u, v;
};
struct DecalBatch3D {
  std::string entityId, assetId;
  float opacity = 1;
  int renderOrder = 0;
  std::size_t authoredOrder = 0;
  std::shared_ptr<const std::vector<DecalVertex3D>> vertices;
};
using DecalModels3D =
    std::map<std::string, std::shared_ptr<const PreparedModel>>;
using DecalTransforms3D = std::map<std::string, QMatrix4x4>;
struct DecalWork3D {
  std::size_t nodes = 0, sourceTriangles = 0, candidateTriangles = 0,
              outputVertices = 0;
};
inline constexpr DecalWork3D DecalLimits3D{4096, 200000, 4096, 196608};
inline constexpr std::size_t NativeDecalReceiverTriangleLimit3D = 200000;

// CPU projection cache. The host draws these world-space triangles with the
// scene's lit material, depth writes disabled and polygon offset (-2, -2).
class Decals3D {
public:
  Decals3D();
  ~Decals3D();
  Decals3D(const Decals3D &) = delete;
  Decals3D &operator=(const Decals3D &) = delete;
  const std::vector<DecalBatch3D> &
  prepare(const Json &frame, const std::shared_ptr<const DecalModels3D> &models,
          const DecalTransforms3D &worldTransforms,
          const Json *document = nullptr);
  std::size_t revision() const;
  std::size_t projectionBuilds() const;
  std::size_t aggregateChecks() const;
  DecalWork3D lastWork() const;
  const std::vector<std::string> &diagnostics() const;
  void clear();

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
