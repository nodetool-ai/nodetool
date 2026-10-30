#pragma once
#include "document/Schema.h"
#include <memory>
namespace nodetool::game {
class SpatialWorld {
public:
  virtual ~SpatialWorld() = default;
  virtual void step(const Json &intents) = 0;
  virtual void command(const Json &command) = 0;
  virtual void reconcile(const Json &entities) = 0;
  virtual Json entities() const = 0;
  virtual Json contacts() const = 0;
  virtual Json query(const Json &command) const = 0;
  virtual Json snapshot() const = 0;
  virtual void restore(const Json &saved) = 0;
};
std::unique_ptr<SpatialWorld> makeSpatialWorld(const Json &entities,
    const std::string &dimension, const Json &gravity = Json{{"x", 0}, {"y", 0}},
    double tickRate = 60);
}
