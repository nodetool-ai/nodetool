#pragma once
#include "physics/SpatialWorld.h"
#include <memory>
namespace nodetool::game {
class World2D final : public SpatialWorld {
public:
  explicit World2D(const Json &entities, Json gravity = {{"x", 0}, {"y", 0}},
                   double tickRate = 60);
  ~World2D() override;
  void step(const Json &intents) override;
  void command(const Json &command) override;
  void reconcile(const Json &entities) override;
  Json entities() const override;
  Json contacts() const override;
  Json query(const Json &command) const override;
  Json snapshot() const override;
  void restore(const Json &saved) override;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace nodetool::game
