#pragma once
#include "document/Schema.h"
#include <cstdint>
#include <memory>

namespace nodetool::game {
class ParticlePresentation3D {
public:
  explicit ParticlePresentation3D(std::uint32_t seed = 1);
  ~ParticlePresentation3D();
  void step(const Json &frame, const Json &emissions);
  Json frame() const;
  Json snapshot() const;
  void restore(const Json &saved);

private:
  struct State;
  std::unique_ptr<State> state_;
};
} // namespace nodetool::game
