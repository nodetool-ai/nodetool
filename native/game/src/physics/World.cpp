#include "World.h"

#include <Jolt/Jolt.h>

#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyLock.h>
#include <Jolt/Physics/Character/CharacterVirtual.h>
#include <Jolt/Physics/Collision/CastResult.h>
#include <Jolt/Physics/Collision/ContactListener.h>
#include <Jolt/Physics/Collision/RayCast.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/MeshShape.h>
#include <Jolt/Physics/Collision/Shape/CapsuleShape.h>
#include <Jolt/Physics/Collision/Shape/SphereShape.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/Physics/StateRecorderImpl.h>
#include <Jolt/RegisterTypes.h>
#include <cmath>
#include <map>
#include <mutex>
#include <set>
namespace nodetool::game {
namespace {
class Broad final : public JPH::BroadPhaseLayerInterface {
public:
  JPH::uint GetNumBroadPhaseLayers() const override { return 1; }
  JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer) const override {
    return JPH::BroadPhaseLayer(0);
  }
};
class BroadFilter final : public JPH::ObjectVsBroadPhaseLayerFilter {
public:
  bool ShouldCollide(JPH::ObjectLayer, JPH::BroadPhaseLayer) const override {
    return true;
  }
};
class PairFilter final : public JPH::ObjectLayerPairFilter {
public:
  bool ShouldCollide(JPH::ObjectLayer a, JPH::ObjectLayer b) const override {
    return ((a & 65535U) & (1U << (b >> 16U))) != 0 &&
           ((b & 65535U) & (1U << (a >> 16U))) != 0;
  }
};
JPH::ObjectLayer layer(const Json &collider) {
  const auto group = collider.value("layer", 0U),
             mask = collider.value("mask", 65535U);
  if (group > 15 || mask > 65535) {
    throw Error("validation_error", "Invalid collision layer or mask");
  }
  return (group << 16U) | mask;
}
JPH::Vec3 vec(const Json &x) {
  for (const auto &value : x) {
    const auto n = value.get<double>();
    if (!std::isfinite(n) || std::abs(n) > 1000000.) {
      throw Error("validation_error",
                  "Physics vector exceeds finite world bounds");
    }
  }
  return JPH::Vec3(x.at(0).get<float>(), x.at(1).get<float>(),
                   x.at(2).get<float>());
}
Json jsonVec(JPH::Vec3Arg v) {
  return Json::array({v.GetX(), v.GetY(), v.GetZ()});
}
Json jsonPos(JPH::RVec3Arg v) {
  return Json::array({v.GetX(), v.GetY(), v.GetZ()});
}
std::string encode(const std::string &s) {
  static constexpr char hex[] = "0123456789abcdef";
  std::string out;
  out.reserve(s.size() * 2);
  for (unsigned char c : s) {
    out.push_back(hex[c >> 4]);
    out.push_back(hex[c & 15]);
  }
  return out;
}
std::string decode(const std::string &s) {
  if (s.size() % 2 || s.size() > 32 * 1024 * 1024) {
    throw Error("snapshot_error", "Invalid physics bytes");
  }
  std::string out;
  out.reserve(s.size() / 2);
  auto digit = [](char c) {
    if (c >= '0' && c <= '9') {
      return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
      return c - 'a' + 10;
    }
    throw Error("snapshot_error", "Invalid physics bytes");
  };
  for (std::size_t i = 0; i < s.size(); i += 2) {
    out.push_back(char(digit(s[i]) * 16 + digit(s[i + 1])));
  }
  return out;
}
struct JoltRuntime {
  std::unique_ptr<JPH::Factory> factory;
  JoltRuntime() {
    JPH::RegisterDefaultAllocator();
    factory = std::make_unique<JPH::Factory>();
    JPH::Factory::sInstance = factory.get();
    JPH::RegisterTypes();
  }
  ~JoltRuntime() {
    JPH::UnregisterTypes();
    JPH::Factory::sInstance = nullptr;
  }
};
void init() {
  static JoltRuntime runtime;
  (void)runtime;
}
#ifdef __EMSCRIPTEN__
JPH::TempAllocatorImpl &browserScratch() {
  // Browser dispatch is synchronous and single-threaded, including all worlds.
  static JPH::TempAllocatorImpl allocator{64 * 1024 * 1024};
  return allocator;
}
#endif

} // namespace
struct PhysicsWorld::Impl : JPH::ContactListener {
  Broad broad;
  BroadFilter broadFilter;
  PairFilter pairFilter;
  JPH::PhysicsSystem world;
#ifdef __EMSCRIPTEN__
  JPH::TempAllocatorImpl &allocator = browserScratch();
#else
  JPH::TempAllocatorImpl allocator{64 * 1024 * 1024};
#endif
  JPH::JobSystemSingleThreaded jobs{JPH::cMaxPhysicsJobs};
  Json authored;
  std::map<JPH::uint32, std::string> names;
  std::map<std::pair<JPH::uint32, JPH::uint32>, bool> activeContacts;
  void OnContactAdded(const JPH::Body &a, const JPH::Body &b,
                      const JPH::ContactManifold &,
                      JPH::ContactSettings &) override {
    activeContacts[{std::min(a.GetID().GetIndexAndSequenceNumber(),
                             b.GetID().GetIndexAndSequenceNumber()),
                    std::max(a.GetID().GetIndexAndSequenceNumber(),
                             b.GetID().GetIndexAndSequenceNumber())}] =
        a.IsSensor() || b.IsSensor();
  }
  void OnContactPersisted(const JPH::Body &a, const JPH::Body &b,
                          const JPH::ContactManifold &m,
                          JPH::ContactSettings &settings) override {
    OnContactAdded(a, b, m, settings);
  }
  void OnContactRemoved(const JPH::SubShapeIDPair &pair) override {
    const auto a = pair.GetBody1ID().GetIndexAndSequenceNumber(),
               b = pair.GetBody2ID().GetIndexAndSequenceNumber();
    activeContacts.erase({std::min(a, b), std::max(a, b)});
  }
  std::map<std::string, JPH::BodyID> bodies;
  std::map<std::string, JPH::Ref<JPH::CharacterVirtual>> characters;
  Json restoredIds;
  std::uint32_t nextCharacterId = 1;
  explicit Impl(const Json &entities, Json ids = Json::object())
      : authored(entities), restoredIds(std::move(ids)) {
    init();
    world.SetContactListener(this);
    world.Init(20000, 0, 40000, 20000, broad, broadFilter, pairFilter);
    for (const auto &e : entities) {
      add(e);
    }
  }
  void add(const Json &e) {
    const auto id = e.at("id").get<std::string>();
    if (!e.contains("collider") && !e.contains("character")) {
      return;
    }
    if (e.contains("body") && e.contains("character")) {
      throw Error("validation_error",
                  "Character and body cannot own the same transform");
    }
    for (const auto &value : e.at("transform").at("scale")) {
      if (value.get<double>() != 1.) {
        throw Error("validation_error", "Physics scale must be identity");
      }
    }
    const auto c = e.value("collider", Json::object());
    const auto shape = c.value("shape", std::string("capsule"));
    JPH::RefConst<JPH::Shape> geometry;
    if (shape == "mesh") {
      if (e.contains("character") ||
          e.value("body", Json::object())
                  .value("type", std::string("static")) != "static") {
        throw Error("validation_error", "Triangle mesh requires a static body");
      }
      const auto &vertices = c.at("vertices");
      const auto &indices = c.at("indices");
      if (indices.size() % 3) {
        throw Error("validation_error", "Mesh indices require triangles");
      }
      JPH::TriangleList triangles;
      triangles.reserve(indices.size() / 3);
      for (std::size_t i = 0; i < indices.size(); i += 3) {
        for (int j = 0; j < 3; ++j) {
          if (indices[i + j].get<std::size_t>() >= vertices.size()) {
            throw Error("validation_error", "Mesh index out of range");
          }
        }
        triangles.emplace_back(
            vec(vertices[indices[i].get<std::size_t>()]),
            vec(vertices[indices[i + 1].get<std::size_t>()]),
            vec(vertices[indices[i + 2].get<std::size_t>()]));
      }
      auto result = JPH::MeshShapeSettings(triangles).Create();
      if (result.HasError()) {
        throw Error("validation_error",
                    "Invalid prepared mesh: " + std::string(result.GetError()));
      }
      geometry = result.Get();
    } else if (shape == "box") {
      const auto half = vec(c.value("halfExtents", Json::array({.5, .5, .5})));
      const auto minimum = std::min({half.GetX(), half.GetY(), half.GetZ()});
      if (minimum < .0001F) {
        throw Error("validation_error",
                    "Box extents must be at least .0001 meters");
      }
      geometry = new JPH::BoxShape(half, std::min(.05F, minimum * .5F));
    } else if (shape == "sphere") {
      const auto radius = c.value("radius", .5F);
      if (radius < .0001F) {
        throw Error("validation_error", "Sphere radius too small");
      }
      geometry = new JPH::SphereShape(radius);
    } else {
      const auto radius = c.value("radius", .5F),
                 height = c.value("halfHeight", .5F);
      if (radius < .0001F || height < .0001F) {
        throw Error("validation_error", "Capsule dimensions too small");
      }
      geometry = new JPH::CapsuleShape(height, radius);
    }
    const auto p = vec(e.at("transform").at("position"));
    const auto r = e.at("transform").at("rotation");
    JPH::Quat q(r[0].get<float>(), r[1].get<float>(), r[2].get<float>(),
                r[3].get<float>());
    if (e.contains("character")) {
      JPH::CharacterVirtualSettings settings;
      settings.mShape = geometry;
      settings.mID = JPH::CharacterID(nextCharacterId++);
      settings.mMaxSlopeAngle =
          e["character"].value("maxSlopeDegrees", 45.F) * JPH::JPH_PI / 180.F;
      characters[id] =
          new JPH::CharacterVirtual(&settings, JPH::RVec3(p), q, &world);
      characters[id]->SetLinearVelocity(
          vec(e.value("velocity", Json::array({0, 0, 0}))));
    } else {
      const auto b = e.value("body", Json::object());
      const auto type = b.value("type", std::string("static"));
      const auto motion = type == "dynamic"     ? JPH::EMotionType::Dynamic
                          : type == "kinematic" ? JPH::EMotionType::Kinematic
                                                : JPH::EMotionType::Static;
      JPH::BodyCreationSettings settings(geometry, JPH::RVec3(p), q, motion,
                                         layer(c));
      settings.mIsSensor = c.value("sensor", false);
      if (motion == JPH::EMotionType::Dynamic) {
        settings.mOverrideMassProperties =
            JPH::EOverrideMassProperties::CalculateInertia;
        settings.mMassPropertiesOverride.mMass = b.value("mass", 1.F);
      }
      settings.mLinearVelocity =
          vec(e.value("velocity", b.value("velocity", Json::array({0, 0, 0}))));
      if (restoredIds.contains(id)) {
        const JPH::BodyID assigned(restoredIds.at(id).get<JPH::uint32>());
        if (!world.GetBodyInterface().CreateBodyWithID(assigned, settings)) {
          throw Error("snapshot_error", "Invalid body identity");
        }
        bodies[id] = assigned;
        world.GetBodyInterface().AddBody(assigned, JPH::EActivation::Activate);
      } else {
        bodies[id] = world.GetBodyInterface().CreateAndAddBody(
            settings, JPH::EActivation::Activate);
      }
      if (bodies[id].IsInvalid()) {
        throw Error("resource_limit", "Physics body capacity reached");
      }
      names[bodies[id].GetIndexAndSequenceNumber()] = id;
    }
  }
  ~Impl() {
    characters.clear();
    auto &bi = world.GetBodyInterface();
    for (const auto &[id, body] : bodies) {
      (void)id;
      bi.RemoveBody(body);
      bi.DestroyBody(body);
    }
  }
};
PhysicsWorld::PhysicsWorld(const Json &e)
    : impl_((init(), std::make_unique<Impl>(e).release())) {}
void PhysicsWorld::ImplDeleter::operator()(Impl *impl) const noexcept { delete impl; }
PhysicsWorld::PhysicsWorld(PhysicsWorld &&) noexcept = default;
PhysicsWorld &PhysicsWorld::operator=(PhysicsWorld &&) noexcept = default;
void PhysicsWorld::reconcile(const Json &entities) {
  std::set<std::string> ids;
  for (const auto &e : entities) {
    ids.insert(e.at("id").get<std::string>());
  }
  auto &bi = impl_->world.GetBodyInterface();
  for (auto it = impl_->bodies.begin(); it != impl_->bodies.end();) {
    if (!ids.contains(it->first)) {
      impl_->names.erase(it->second.GetIndexAndSequenceNumber());
      bi.RemoveBody(it->second);
      bi.DestroyBody(it->second);
      it = impl_->bodies.erase(it);
    } else {
      ++it;
    }
  }
  for (auto it = impl_->characters.begin(); it != impl_->characters.end();) {
    if (!ids.contains(it->first)) {
      it = impl_->characters.erase(it);
    } else {
      ++it;
    }
  }
  for (const auto &e : entities) {
    const auto id = e.at("id").get<std::string>();
    if (!impl_->bodies.contains(id) && !impl_->characters.contains(id)) {
      impl_->add(e);
    }
  }
  impl_->authored = entities;
}
void PhysicsWorld::step(const Json &intents) {
  auto &x = *impl_;
  constexpr float dt = 1.F / 60.F;
  for (const auto &e : x.authored) {
    const auto id = e.at("id").get<std::string>();
    auto it = x.characters.find(id);
    if (it == x.characters.end()) {
      continue;
    }
    auto &c = *it->second;
    const auto in = intents.value(id, Json::object());
    auto move = vec(in.value("move", Json::array({0, 0, 0})));
    if (move.LengthSq() > 1) {
      move = move.Normalized();
    }
    auto velocity = c.GetLinearVelocity();
    const bool grounded =
        c.GetGroundState() == JPH::CharacterBase::EGroundState::OnGround;
    velocity.SetX(move.GetX() * e["character"].value("speed", 5.F));
    velocity.SetZ(move.GetZ() * e["character"].value("speed", 5.F));
    if (grounded) {
      velocity.SetY(c.GetGroundVelocity().GetY());
      if (in.value("jump", false)) {
        velocity.SetY(e["character"].value("jumpSpeed", 6.F));
      }
    } else {
      velocity += x.world.GetGravity() * dt;
    }
    c.SetLinearVelocity(velocity);
    JPH::CharacterVirtual::ExtendedUpdateSettings settings;
    settings.mWalkStairsStepUp =
        JPH::Vec3(0, e["character"].value("stepHeight", .3F), 0);
    c.ExtendedUpdate(dt, x.world.GetGravity(), settings,
                     x.world.GetDefaultBroadPhaseLayerFilter(
                         layer(e.value("collider", Json::object()))),
                     x.world.GetDefaultLayerFilter(
                         layer(e.value("collider", Json::object()))),
                     {}, {}, x.allocator);
  }
  checkCancellation();
  const auto status = x.world.Update(dt, 1, &x.allocator, &x.jobs);
  if (!x.allocator.IsEmpty()) {
    throw Error("physics_error", "Jolt step retained temporary allocations");
  }
  if (status != JPH::EPhysicsUpdateError::None) {
    throw Error("physics_error", "Jolt step capacity exceeded");
  }
}
void PhysicsWorld::command(const Json &command) {
  auto &x = *impl_;
  const auto id = command.at("entityId").get<std::string>();
  const auto kind = command.at("kind").get<std::string>();
  auto body = x.bodies.find(id);
  auto character = x.characters.find(id);
  if (body == x.bodies.end() && character == x.characters.end()) {
    throw Error("command_error", "Entity has no physics owner: " + id);
  }
  auto &bi = x.world.GetBodyInterface();
  if (body != x.bodies.end()) {
    const auto authored =
        std::find_if(x.authored.begin(), x.authored.end(),
                     [&](const Json &e) { return e.at("id") == id; });
    const auto type = authored->value("body", Json::object())
                          .value("type", std::string("static"));
    if ((kind == "setVelocity" && type == "static") ||
        (kind == "applyImpulse" && type != "dynamic")) {
      throw Error("command_error", "Command requires movable body");
    }
  }
  if (kind == "setPosition") {
    auto p = vec(command.at("position"));
    if (character != x.characters.end()) {
      character->second->SetPosition(JPH::RVec3(p));
    } else {
      bi.SetPosition(body->second, JPH::RVec3(p), JPH::EActivation::Activate);
    }
  } else if (kind == "setVelocity") {
    auto v = vec(command.at("velocity"));
    if (character != x.characters.end()) {
      character->second->SetLinearVelocity(v);
    } else {
      bi.SetLinearVelocity(body->second, v);
    }
  } else if (kind == "applyImpulse") {
    if (body == x.bodies.end()) {
      throw Error("command_error", "Cannot apply impulse to virtual character");
    }
    bi.AddImpulse(body->second, vec(command.at("impulse")));
  }
}
Json PhysicsWorld::entities() const {
  auto result = impl_->authored;
  for (auto &e : result) {
    const auto id = e.at("id").get<std::string>();
    auto b = impl_->bodies.find(id);
    auto c = impl_->characters.find(id);
    if (b != impl_->bodies.end()) {
      const auto &bi = impl_->world.GetBodyInterface();
      e["transform"]["position"] = jsonPos(bi.GetPosition(b->second));
      const auto q = bi.GetRotation(b->second);
      e["transform"]["rotation"] = {q.GetX(), q.GetY(), q.GetZ(), q.GetW()};
      e["velocity"] = jsonVec(bi.GetLinearVelocity(b->second));
    } else if (c != impl_->characters.end()) {
      e["transform"]["position"] = jsonPos(c->second->GetPosition());
      e["velocity"] = jsonVec(c->second->GetLinearVelocity());
      e["grounded"] = c->second->GetGroundState() ==
                      JPH::CharacterBase::EGroundState::OnGround;
    }
  }
  return result;
}
Json PhysicsWorld::contacts() const {
  std::map<std::pair<std::string, std::string>, bool> pairs;
  auto add = [&](const std::string &a, const std::string &b, bool sensor) {
    pairs[{std::min(a, b), std::max(a, b)}] = sensor;
  };
  for (const auto &[pair, sensor] : impl_->activeContacts) {
    auto a = impl_->names.find(pair.first), b = impl_->names.find(pair.second);
    if (a != impl_->names.end() && b != impl_->names.end()) {
      add(a->second, b->second, sensor);
    }
  }
  for (const auto &[id, character] : impl_->characters) {
    for (const auto &c : character->GetActiveContacts()) {
      auto b = impl_->names.find(c.mBodyB.GetIndexAndSequenceNumber());
      if (b != impl_->names.end() && (c.mHadCollision || c.mIsSensorB)) {
        add(id, b->second, c.mIsSensorB);
      }
    }
  }
  Json result = Json::array();
  for (const auto &[pair, sensor] : pairs) {
    result.push_back(
        {{"a", pair.first}, {"b", pair.second}, {"sensor", sensor}});
  }
  return result;
}
Json PhysicsWorld::query(const Json &command) const {
  const auto origin = vec(command.at("origin"));
  auto direction = vec(command.at("direction"));
  if (direction.LengthSq() < 1e-10F) {
    throw Error("command_error", "Ray direction must be nonzero");
  }
  direction = direction.Normalized() * command.value("maxDistance", 100.F);
  JPH::RayCastResult result;
  const bool hit = impl_->world.GetNarrowPhaseQuery().CastRay(
      JPH::RRayCast(JPH::RVec3(origin), direction), result);
  Json out{{"queryId", command.at("queryId")}, {"hit", hit}};
  if (hit) {
    for (const auto &[id, body] : impl_->bodies) {
      if (body == result.mBodyID) {
        out["entityId"] = id;
        break;
      }
    }
    out["fraction"] = result.mFraction;
    const auto position = origin + direction * result.mFraction;
    out["position"] = jsonVec(position);
    const JPH::BodyLockRead lock(impl_->world.GetBodyLockInterface(), result.mBodyID);
    if (!lock.Succeeded()) { throw Error("physics_error", "Ray hit body is unavailable"); }
    const auto normal = lock.GetBody().GetWorldSpaceSurfaceNormal(result.mSubShapeID2, JPH::RVec3(position));
    if (!std::isfinite(normal.GetX()) || !std::isfinite(normal.GetY()) || !std::isfinite(normal.GetZ()) || normal.LengthSq() < 1e-10F) { throw Error("physics_error", "Ray hit surface normal is invalid"); }
    out["normal"] = jsonVec(normal.Normalized());
  }
  return out;
}
Json PhysicsWorld::snapshot() const {
  JPH::StateRecorderImpl stream;
  impl_->world.SaveState(stream);
  Json characters = Json::object();
  for (const auto &[id, c] : impl_->characters) {
    JPH::StateRecorderImpl saved;
    c->SaveState(saved);
    characters[id] = encode(saved.GetData());
  }
  Json pairs = Json::array();
  for (const auto &[pair, sensor] : impl_->activeContacts) {
    pairs.push_back({pair.first, pair.second, sensor});
  }
  Json bodyIds = Json::object();
  for (const auto &[id, body] : impl_->bodies) {
    bodyIds[id] = body.GetIndexAndSequenceNumber();
  }
  return {{"bodyIds", bodyIds},
          {"nextCharacterId", impl_->nextCharacterId},
          {"world", encode(stream.GetData())},
          {"characters", characters},
          {"contacts", pairs}};
}
void PhysicsWorld::restore(const Json &saved) {
  impl_.reset(std::make_unique<Impl>(impl_->authored, saved.at("bodyIds")).release());
  impl_->nextCharacterId = saved.at("nextCharacterId");
  impl_->activeContacts.clear();
  for (const auto &c : saved.value("contacts", Json::array())) {
    impl_->activeContacts[{c.at(0).get<JPH::uint32>(),
                           c.at(1).get<JPH::uint32>()}] = c.at(2).get<bool>();
  }
  const auto bytes = decode(saved.at("world").get<std::string>());
  JPH::StateRecorderImpl stream;
  stream.WriteBytes(bytes.data(), bytes.size());
  stream.Rewind();
  if (!impl_->world.RestoreState(stream) || stream.IsFailed()) {
    throw Error("snapshot_error", "Invalid physics world state");
  }
  for (const auto &[id, c] : impl_->characters) {
    const auto data = decode(saved.at("characters").at(id).get<std::string>());
    JPH::StateRecorderImpl state;
    state.WriteBytes(data.data(), data.size());
    state.Rewind();
    c->RestoreState(state);
    if (state.IsFailed()) {
      throw Error("snapshot_error", "Invalid character state");
    }
  }
}
} // namespace nodetool::game
