#pragma once
#include "document/Document.h"
#include "physics/SpatialWorld.h"
#include "scripts/ScriptHost.h"
#include "presentation/Particles3D.h"
#include <array>
#include <map>
#include <memory>
#include <set>
#include <string_view>
namespace nodetool::game {
class Session {
public:
  static std::string_view buildIdentity() noexcept;
  explicit Session(Json document, std::uint32_t seed = 1);
  Json step(const Json &input = Json::object());
  Json inspect() const;
  Json frame() const;
  std::uint64_t generation() const;
  void recordTimings(bool enabled) noexcept { recordTimings_ = enabled; }
  const Json &timings() const noexcept { return timings_; }
  Json snapshot() const;
  bool irrecoverable() const noexcept { return irrecoverable_; }
  void restore(const Json &saved);
  void reload(Json document);

private:
  Json document_, entities_, states_ = Json::object(), timers_ = Json::object(),
                             started_ = Json::object();
  Json music_ = Json::array();
  Json hostRequests_ = Json::array();
  Json uiOverrides_ = Json::object();
  std::unique_ptr<ParticlePresentation3D> particlePresentation_;
  Json events_ = Json::array(), presentation_ = Json::array(),
       contacts_ = Json::array(), queries_ = Json::array(),
       previousInput_ = Json::object(), removed_ = Json::array();
  std::string sceneId_;
  std::uint64_t tick_ = 0, generation_ = 1;
  std::uint32_t rng_ = 1;
  std::uint32_t seed_ = 1;
  std::set<std::string> usedIds_;
  double score_ = 0;
  bool faulted_ = false;
  bool irrecoverable_ = false;
  std::unique_ptr<SpatialWorld> physics_;
  ScriptHost scripts_;
  std::array<std::uint8_t, 32> snapshotKey_;
  std::string documentDigest_, manifestDigest_;
  Json logs_ = Json::array();
  Json cameraState_ = Json::object();
  Json scriptCamera_ = Json::object();
  bool recordTimings_ = false;
  Json timings_ = Json::object();
  std::map<std::string, Json> sources_;
  Json authoredOrderSeed_ = Json::object();
  std::string authoredOrderSceneId_;
  void adopt(Session &candidate) noexcept;
  void requireRecoverable() const;
  void createSpatialWorld();
  void openScene(const std::string &id);
  void cacheAuthoredOrder(const std::string &sceneId, const Json &entities);
  void restoreUnchecked(const Json &saved);
  Json captureCheckpoint() const;
  Json baseFrame() const;
  Json resolveCamera(bool aim = false) const;
  Json invoke(const Json &entity, const Json &behavior, const Json &input,
              const ScriptWorld &world, const Json &lifecycle);
};
} // namespace nodetool::game
