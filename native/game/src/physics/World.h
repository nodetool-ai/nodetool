#pragma once
#include "physics/SpatialWorld.h"
#include <memory>
namespace nodetool::game {
class PhysicsWorld final : public SpatialWorld {
public:
  explicit PhysicsWorld(const Json &entities);
  ~PhysicsWorld() override;
  PhysicsWorld(PhysicsWorld &&) noexcept;
  PhysicsWorld &operator=(PhysicsWorld &&) noexcept;
  void step(const Json &intents);
  void command(const Json &command);
  void reconcile(const Json &entities);
  Json entities() const;
  Json contacts() const;
  Json query(const Json &command) const;
  Json snapshot() const;
  void restore(const Json &saved);

private:
  struct Impl;
  struct ImplDeleter { void operator()(Impl *impl) const noexcept; };
  std::unique_ptr<Impl, ImplDeleter> impl_;
};
} // namespace nodetool::game
