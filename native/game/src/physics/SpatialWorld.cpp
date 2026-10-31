#include "SpatialWorld.h"
#include "World.h"
#include "World2D.h"
namespace nodetool::game {
std::unique_ptr<SpatialWorld> makeSpatialWorld(const Json &entities,
    const std::string &dimension, const Json &gravity, double tickRate) {
  if (dimension == "2d") {
    return std::make_unique<World2D>(entities, gravity, tickRate);
  }
  if (dimension == "3d") {
    return std::make_unique<PhysicsWorld>(entities);
  }
  throw Error("validation_error", "Unsupported spatial dimension");
}
}
