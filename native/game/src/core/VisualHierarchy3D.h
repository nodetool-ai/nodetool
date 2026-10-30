#pragma once
#include "document/Document.h"
#include <string_view>

namespace nodetool::game {
struct VisualHierarchy3D {
  Json entities;
  Json worldTransforms;
  Json camera;
};

VisualHierarchy3D resolveVisualHierarchy3D(const Json &entities,
                                         const Json &fallbackCamera,
                                         std::string_view activeCameraId = {});
} // namespace nodetool::game
