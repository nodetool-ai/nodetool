#include "Session.h"
#include "JsonSave.h"
#include "VisualHierarchy3D.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS(int, nativeGameEntropy, (unsigned char *destination, int length), {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) { return 0; }
  try { globalThis.crypto.getRandomValues(HEAPU8.subarray(destination, destination + length)); return 1; }
  catch (_) { return 0; }
});
#endif
#include "assets/PreparedAssets.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <random>
#include <set>
namespace nodetool::game {
namespace {
constexpr const char *Build =
    "native-cpp-1-jolt5.3.0-layer32-quickjs2025-09-13-snapshot1-camera1-presentation1";
using Vector3 = std::array<double, 3>;
using Quaternion = std::array<double, 4>;
Quaternion multiply(const Quaternion &a, const Quaternion &b) {
  return {a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]};
}
Vector3 rotate(const Quaternion &q, const Vector3 &p) {
  const auto r = multiply(multiply(q, {p[0], p[1], p[2], 0}), {-q[0], -q[1], -q[2], q[3]});
  return {r[0], r[1], r[2]};
}
std::string key(const Json &e, const Json &b) {
  return e.at("id").get<std::string>() + "/" + b.at("id").get<std::string>();
}
std::string digest(const std::string &text) {
  return assetDigest(std::vector<std::uint8_t>(text.begin(), text.end()));
}
void canonicalNumbers(Json &value) {
  if (value.is_number_float()) {
    const auto number = value.get<double>();
    if (number == 0) {
      value = 0;
    } else if (std::floor(number) == number &&
               std::abs(number) <= 9007199254740991.) {
      value = static_cast<std::int64_t>(number);
    }
  } else if (value.is_structured()) {
    for (auto &child : value) {
      canonicalNumbers(child);
    }
  }
}
std::string authenticate(const std::array<std::uint8_t, 32> &key,
                         const Json &data) {
  std::vector<std::uint8_t> inner(64, 0x36), outer(64, 0x5c);
  for (std::size_t i = 0; i < key.size(); ++i) {
    inner[i] ^= key[i];
    outer[i] ^= key[i];
  }
  auto canonical = data;
  canonicalNumbers(canonical);
  auto text = canonical.dump();
  inner.insert(inner.end(), text.begin(), text.end());
  const auto hash = assetDigest(inner);
  for (std::size_t i = 0; i < hash.size(); i += 2) {
    outer.push_back(
        static_cast<std::uint8_t>(std::stoul(hash.substr(i, 2), nullptr, 16)));
  }
  return assetDigest(outer);
}
std::string contactIdentity(const Json &contact) {
  const auto a = contact.at("a").get<std::string>();
  const auto b = contact.at("b").get<std::string>();
  return Json::array({std::min(a, b), std::max(a, b), contact.value("sensor", false)}).dump();
}
Json authoredEntity(Json entity) {
  for (const auto* field : {"velocity", "grounded", "touching", "runtimeAge", "spawnTick", "animation", "animationTick", "visualOverride"}) { entity.erase(field); }
  if (entity.contains("gameplay")) { entity["gameplay"].erase("health"); }
  return entity;
}
void finiteTree(const Json &value, std::size_t depth = 0) {
  if (depth > 64) {
    throw Error("snapshot_error", "Snapshot nesting exceeds limit");
  }
  if (value.is_number_float() && !std::isfinite(value.get<double>())) {
    throw Error("snapshot_error", "Nonfinite snapshot value");
  }
  if (value.is_structured()) {
    for (const auto &item : value) {
      finiteTree(item, depth + 1);
    }
  }
}
} // namespace
std::string_view Session::buildIdentity() noexcept { return Build; }
Session::Session(Json document, std::uint32_t seed)
    : document_(validateDocument(std::move(document))), rng_(seed),
      seed_(seed) {
#ifdef __EMSCRIPTEN__
  if (!nativeGameEntropy(snapshotKey_.data(), static_cast<int>(snapshotKey_.size()))) {
    throw Error("unavailable_capability", "Secure snapshot entropy is unavailable");
  }
#else
  std::random_device random;
  for (auto &value : snapshotKey_) { value = static_cast<std::uint8_t>(random()); }
#endif
  documentDigest_ = digest(document_.dump());
  manifestDigest_ = digest(document_.at("assets").dump());
  const auto camera = document_.value("camera", Json::object());
  if (camera.value("kind", std::string{}) == "firstPerson") {
    cameraState_ = {{"yaw", camera.at("yaw")}, {"pitch", camera.at("pitch")}};
  }
  for (const auto &s : document_["scripts"]) {
    scripts_.validateSource(s.at("source"), s.at("id"));
    auto source = s;
    const auto text = s.at("source").get<std::string>();
    source["digest"] =
        assetDigest(std::vector<std::uint8_t>(text.begin(), text.end()));
    sources_[s.at("id").get<std::string>()] = source;
  }
  openScene(document_.at("initialSceneId"));
  if (document_.at("dimension") == "3d") { particlePresentation_ = std::make_unique<ParticlePresentation3D>(seed_); particlePresentation_->step(frame(), Json::array()); }
}
void Session::requireRecoverable() const {
  if (irrecoverable_) { throw Error("session_faulted", "Session recovery failed; create a new session"); }
}
void Session::createSpatialWorld() {
  Json gravity = document_.value("gravity", Json{{"x", 0}, {"y", -9.81}});
  for (const auto &scene : document_.at("scenes")) {
    if (scene.at("id") == sceneId_) { gravity = scene.value("gravity", gravity); break; }
  }
  physics_ = makeSpatialWorld(entities_, document_.value("dimension", std::string("3d")),
                             gravity, document_.value("tickRate", 60.));
}
void Session::openScene(const std::string &id) {
  sceneId_ = id;
  uiOverrides_ = Json::object();
  entities_ = resolvePrefabs(document_, id);
  if (entities_.is_object() && entities_.contains("entities")) {
    entities_ = entities_["entities"];
  }
  std::sort(
      entities_.begin(), entities_.end(),
      [](const Json &a, const Json &b) { return a.at("id") < b.at("id"); });
  for (const auto &e : entities_) {
    usedIds_.insert(e.at("id").get<std::string>());
  }
  createSpatialWorld();
  states_ = Json::object();
  timers_ = Json::object();
  started_ = Json::object();
  contacts_ = Json::array();
  queries_ = Json::array();
  removed_ = Json::array();
}
Json Session::invoke(const Json &e, const Json &b, const Json &input,
                     const ScriptWorld &world, const Json &lifecycle) {
  const auto id = key(e, b);
  const auto source = sources_.find(b.at("scriptId").get<std::string>());
  if (source == sources_.end()) {
    throw Error("script_error", "Missing script");
  }
  Json call{{"dimension", document_.value("dimension", std::string("3d"))},
            {"camera", scriptCamera_},
            {"entityId", e.at("id")},
            {"behaviorId", b.at("id")},
            {"scriptId", b.at("scriptId")},
            {"source", source->second.at("source")},
            {"sourceDigest", source->second.at("digest")},
            {"tick", tick_},
            {"state", states_.value(id, Json::object())},
            {"props", b.value("props", Json::object())},
            {"events",
             [&] {
               Json routed = Json::array();
               for (const auto &event : events_) {
                 if (!event.contains("entityId") ||
                     event.at("entityId") == e.at("id")) {
                   routed.push_back(event);
                 }
               }
               return routed;
             }()},
            {"queryResults",
             [&] {
               Json results = Json::array();
               for (const auto &q : queries_) {
                 if (q.value("ownerId", std::string{}) ==
                     e.at("id").get<std::string>()) {
                   results.push_back(q);
                 }
               }
               return results;
             }()},
            {"lifecycle", lifecycle},
            {"rngState", rng_},
            {"timers", timers_.value(id, Json::array())},
            {"input", input},
            {"limits",
             {{"maxCommands", b.value("maxCommands", 128)},
              {"maxTickMs", b.value("maxTickMs", 20)},
              {"maxStateBytes", b.value("maxStateBytes", 65536)},
              {"maxTimers", b.value("maxTimers", 32)}}}};
  auto result = scripts_.invoke(call, world);
  for (const auto &log : result.value("logs", Json::array())) {
    if (logs_.size() >= 256) {
      throw Error("resource_limit", "Tick log limit exceeded");
    }
    logs_.push_back({{"entityId", e.at("id")},
                     {"behaviorId", b.at("id")},
                     {"tick", tick_},
                     {"message", log}});
  }
  states_[id] = result.value("state", Json::object());
  timers_[id] = result.value("timers", Json::array());
  rng_ = result.value("rngState", rng_);
  started_[id] = true;
  return result;
}
Json Session::step(const Json &input) {
  requireRecoverable();
  using Clock = std::chrono::steady_clock;
  const auto timingStart = recordTimings_ ? Clock::now() : Clock::time_point{};
  auto phaseStart = timingStart;
  const auto measure = [&](const char *name) {
    if (recordTimings_) {
      const auto now = Clock::now();
      timings_[name] =
          std::chrono::duration<double, std::milli>(now - phaseStart).count();
      phaseStart = now;
    }
  };
  if (recordTimings_) {
    timings_ = Json::object();
  }

  if (faulted_) {
    throw Error("session_faulted", "Session requires restore or restart");
  }
  if (!input.is_object() || input.dump().size() > 65536) {
    throw Error("validation_error", "Input must be bounded object");
  }
  if (input.contains("move")) {
    const auto &move = input.at("move");
    const bool twoDimensional = document_.at("dimension") == "2d";
    const auto validNumber = [](const Json &value) { return value.is_number() && std::isfinite(value.get<double>()) && std::abs(value.get<double>()) <= 1000000.; };
    bool valid = twoDimensional ? move.is_object() && move.size() == 2 && move.contains("x") && move.contains("y") && validNumber(move.at("x")) && validNumber(move.at("y"))
                                : move.is_array() && move.size() == 3 && std::all_of(move.begin(), move.end(), validNumber);
    if (!valid) { throw Error("validation_error", twoDimensional ? "2D input.move must be an {x,y} object with finite bounded numbers" : "3D input.move must be a three-number tuple with finite bounded numbers", "input.move"); }
  }
  if (input.contains("jump") && !input.at("jump").is_boolean()) { throw Error("validation_error", "input.jump must be boolean", "input.jump"); }
  if (input.contains("look")) {
    const auto &look = input.at("look");
    if (!look.is_object() || look.size() != 2 || !look.contains("x") || !look.contains("y")) { throw Error("validation_error", "input.look must be an {x,y} object", "input.look"); }
    for (const auto &value : look) {
      if (!value.is_number() || !std::isfinite(value.get<double>()) || std::abs(value.get<double>()) > 1000000.) { throw Error("validation_error", "input.look must contain finite bounded numbers", "input.look"); }
    }
  }
  finiteTree(input);
  if (input.contains("loaded")) { validateLoadedSaves(input.at("loaded")); }
  measure("inputMs");
  const auto checkpoint = snapshot();
  measure("checkpointMs");
  try {
    checkCancellation();
    if (!cameraState_.empty()) {
      const auto &camera = document_.at("camera");
      const auto look = input.value("look", Json{{"x", 0}, {"y", 0}});
      const double yaw = cameraState_.at("yaw").get<double>() - look.at("x").get<double>() * camera.at("sensitivity").get<double>();
      cameraState_["yaw"] = std::remainder(yaw, 2 * std::acos(-1.));
      cameraState_["pitch"] = std::clamp(cameraState_.at("pitch").get<double>() - look.at("y").get<double>() * camera.at("sensitivity").get<double>(), camera.at("minPitch").get<double>(), camera.at("maxPitch").get<double>());
    }
    scriptCamera_ = resolveCamera(true);
    logs_ = Json::array();
    hostRequests_ = Json::array();
    const ScriptWorld scriptWorld(entities_);
    const auto scriptDeadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(200);
    Json commands = Json::array(), intents = Json::object();
    std::map<std::string, Json> contactIndex;
    for (const auto &event : events_) {
      for (const auto *field : {"a", "b"}) {
        if (event.contains(field)) {
          auto id = event.at(field).get<std::string>();
          if (!contactIndex.contains(id)) {
            contactIndex[id] = Json::array();
          }
          contactIndex[id].push_back(event);
        }
      }
    }
    for (const auto &e : entities_) {
      if (e.contains("character") || (document_.at("dimension") == "2d" && e.contains("body2d"))) {
        auto in = input;
        in["jump"] =
            input.value("jump", false) && !previousInput_.value("jump", false);
        intents[e.at("id").get<std::string>()] = in;
      }
    }
    for (const auto &e : removed_) {
      for (const auto &b : e.value("behaviors", Json::array())) {
        checkCancellation();
        if (std::chrono::steady_clock::now() > scriptDeadline) {
          throw Error("SCRIPT_LIMIT", "Total script phase budget exceeded");
        }
        auto result = invoke(e, b, input, scriptWorld, {{"destroy", true}});
        for (auto c : result.value("commands", Json::array())) {
          if (!c.contains("entityId") &&
              c.value("kind", std::string{}) != "emit" &&
              c.value("kind", std::string{}) != "save" && c.value("kind", std::string{}) != "load") {
            c["entityId"] = e.at("id");
          }
          commands.push_back(c);
        }
        states_.erase(key(e, b));
        timers_.erase(key(e, b));
        started_.erase(key(e, b));
        if (commands.size() > 4096) {
          throw Error("resource_limit", "Tick command limit exceeded");
        }
      }
    }
    removed_ = Json::array();
    for (const auto &e : entities_) {
      for (const auto &b : e.value("behaviors", Json::array())) {
        checkCancellation();
        if (std::chrono::steady_clock::now() > scriptDeadline) {
          throw Error("SCRIPT_LIMIT", "Total script phase budget exceeded");
        }
        const bool started = started_.value(key(e, b), false);
        auto result = invoke(
            e, b, input, scriptWorld,
            {{"start", !started},
             {"started", started},
             {"sceneEnter", !started},
             {"contacts", contactIndex.contains(e.at("id").get<std::string>())
                              ? contactIndex.at(e.at("id").get<std::string>())
                              : Json::array()}});
        for (auto c : result.value("commands", Json::array())) {
          if (!c.contains("entityId") &&
              c.value("kind", std::string{}) != "emit" &&
              c.value("kind", std::string{}) != "save" && c.value("kind", std::string{}) != "load") {
            c["entityId"] = e.at("id");
          }
          commands.push_back(c);
        }
        if (commands.size() > 4096) {
          throw Error("resource_limit", "Tick command limit exceeded");
        }
      }
    }
    const bool leavingScene = std::any_of(commands.begin(), commands.end(), [](const Json &command) { return command.at("kind") == "transition"; });
    if (leavingScene) {
      for (const auto &e : entities_) {
        for (const auto &b : e.value("behaviors", Json::array())) {
          checkCancellation();
          if (std::chrono::steady_clock::now() > scriptDeadline) {
            throw Error("SCRIPT_LIMIT", "Total script phase budget exceeded");
          }
          const auto result = invoke(e, b, input, scriptWorld, {{"destroy", true}});
          for (auto command : result.value("commands", Json::array())) {
            const auto kind = command.value("kind", std::string{});
            if (!command.contains("entityId") && kind != "emit" && kind != "save" && kind != "load") { command["entityId"] = e.at("id"); }
            commands.push_back(std::move(command));
          }
          if (commands.size() > 4096) { throw Error("resource_limit", "Tick command limit exceeded"); }
        }
      }
    }
    if (std::chrono::steady_clock::now() > scriptDeadline) {
      throw Error("SCRIPT_LIMIT", "Total script phase budget exceeded");
    }
    measure("scriptsMs");
    Json structural = Json::array(), newQueries = Json::array(),
         nextEvents = Json::array();
    presentation_ = Json::array();
    std::string transition;
    for (const auto &c : commands) {
      const auto kind = c.at("kind").get<std::string>();
      const auto id = c.value("entityId", std::string{});
      if (kind == "save" || kind == "load") {
        if (hostRequests_.size() >= 4) { throw Error("resource_limit", "At most four save requests per tick"); }
        validateSaveSlot(c.at("scope"), c.at("slot"));
        if (kind == "save") { validateSaveData(c.at("data")); }
        auto request = c;
        request["tick"] = tick_ + 1;
        request["sequence"] = hostRequests_.size();
        hostRequests_.push_back(std::move(request));
      } else if (kind == "ui") {
        const auto widgetId = c.at("id").get<std::string>();
        const Json *widget = nullptr;
        if (document_.contains("ui")) { for (const auto &node : document_.at("ui").at("nodes")) { if (node.at("id") == widgetId) { widget = &node; break; } } }
        if (!widget) { throw Error("command_error", "Unknown UI widget", "ui/" + widgetId); }
        for (const auto *field : {"text", "value", "max", "visible"}) {
          if (!c.contains(field)) { continue; }
          if ((std::string(field) == "text" && widget->at("kind") != "text") || ((std::string(field) == "value" || std::string(field) == "max") && widget->at("kind") != "bar")) { throw Error("command_error", "UI override does not match widget kind", "ui/" + widgetId); }
          uiOverrides_[widgetId][field] = c.at(field);
        }
      } else if (kind == "emitParticles") {
        auto event = c;
        event["presentationType"] = "emitter"; event["kind"] = "particles";
        event["generation"] = generation_; event["tick"] = tick_ + 1;
        event["id"] = std::to_string(tick_ + 1) + ":" + std::to_string(presentation_.size());
        presentation_.push_back(std::move(event));
      } else if (kind == "move") {
        if (!intents.contains(id)) {
          throw Error("command_error", "Movement target is not a character");
        }
        intents[id] = {{"move", c.at("direction")},
                       {"jump", c.value("jump", false)}};
      } else if (kind == "setPosition" || kind == "setVelocity" ||
                 kind == "applyImpulse") {
        physics_->command(c);
      } else if (kind == "playAnimation" || kind == "setVisual") {
        auto entity = std::find_if(entities_.begin(), entities_.end(), [&](const Json &v) { return v.at("id") == id; });
        if (entity == entities_.end()) { throw Error("command_error", "Unknown visual entity"); }
        if (document_.at("dimension") == "3d") {
          if (kind != "setVisual" || entity->contains("body") || entity->contains("collider") || entity->contains("character")) { throw Error("command_error", "3D visual rotation requires a nonphysical entity"); }
          const auto rotation = c.at("rotation").get<Quaternion>(); double norm = 0;
          for (const auto value : rotation) { norm += value * value; }
          if (std::abs(norm - 1.) > .0001) { throw Error("command_error", "Visual rotation quaternion must be normalized"); }
          (*entity)["visualOverride"]["rotation"] = rotation;
          continue;
        }
        if (!entity->contains("sprite")) { throw Error("command_error", "Unknown sprite entity"); }
        if (kind == "playAnimation") {
          const auto clip = c.at("clip").get<std::string>();
          if (!entity->contains("animator") || !entity->at("animator").value("clips", Json::object()).contains(clip)) { throw Error("command_error", "Unknown animation clip"); }
          (*entity)["animation"] = clip;
          (*entity)["animationTick"] = tick_ + 1;
        } else {
          for (auto property = c.at("visual").begin(); property != c.at("visual").end(); ++property) { (*entity)["visualOverride"][property.key()] = property.value(); }
        }
      } else if (kind == "spawn" || kind == "despawn") {
        structural.push_back(c);
      } else if (kind == "score") {
        score_ += c.at("amount").get<double>();
      } else if (kind == "health") {
        auto e = std::find_if(entities_.begin(), entities_.end(),
                              [&](const Json &v) { return v.at("id") == id; });
        if (e == entities_.end()) {
          throw Error("command_error", "Unknown health entity");
        }
        (*e)["gameplay"]["health"] =
            e->value("gameplay", Json::object()).value("health", 100.) +
            c.at("amount").get<double>();
      } else if (kind == "emit") {
        nextEvents.push_back(c);
      } else if (kind == "transition") {
        transition = c.at("sceneId");
      } else if (kind == "query") {
        newQueries.push_back(c);
      } else if (kind == "audio" || kind == "stopAudio" ||
                 kind == "particles") {
        Json p = c;
        p["presentationType"] = kind == "stopAudio" ? "audio" : kind;
        p["kind"] = kind == "audio"       ? "play"
                    : kind == "stopAudio" ? "stop"
                                          : "emit";
        p["generation"] = generation_;
        p["tick"] = tick_ + 1;
        p["id"] = c.value("id", std::to_string(tick_ + 1) + ":" +
                                    std::to_string(presentation_.size()));
        if (kind == "audio") {
          p["bus"] = c.value("bus", std::string("sfx"));
        }
        if (kind == "audio" && c.value("music", false)) {
          p["startTick"] = tick_ + 1;
          music_.erase(std::remove_if(music_.begin(), music_.end(),
                                      [&](const Json &m) {
                                        return m.at("id") == p.at("id");
                                      }),
                       music_.end());
          if (music_.size() >= 128) {
            throw Error("resource_limit", "Continuing music limit exceeded");
          }
          music_.push_back(p);
        }
        if (kind == "stopAudio") {
          music_.erase(std::remove_if(music_.begin(), music_.end(),
                                      [&](const Json &m) {
                                        return m.at("id") == c.at("voiceId");
                                      }),
                       music_.end());
        }
        presentation_.push_back(p);
      } else {
        throw Error("command_error", "Unsupported command: " + kind);
      }
    }
    measure("commandsMs");
    physics_->step(intents);
    measure("physicsMs");
    auto spatial = physics_->entities();
    std::map<std::string, const Json *> spatialIndex;
    for (const auto &s : spatial) {
      spatialIndex[s.at("id").get<std::string>()] = &s;
    }
    for (auto &e : entities_) {
      auto found = spatialIndex.find(e.at("id").get<std::string>());
      if (found != spatialIndex.end()) {
        const auto &s = *found->second;
        e["transform"] = s.at("transform");
        if (s.contains("velocity")) {
          e["velocity"] = s.at("velocity");
        }
        if (s.contains("touching")) { e["touching"] = s.at("touching"); }
        if (s.contains("grounded")) {
          e["grounded"] = s.at("grounded");
        }
      }
    }
    measure("spatialSyncMs");
    auto touching = physics_->contacts();
    std::set<std::string> previousContacts, currentContacts;
    std::set<std::string> touchingEntities;
    for (const auto &contact : contacts_) {
      previousContacts.insert(contactIdentity(contact));
    }
    for (const auto &contact : touching) {
      currentContacts.insert(contactIdentity(contact));
      touchingEntities.insert(contact.at("a").get<std::string>());
      touchingEntities.insert(contact.at("b").get<std::string>());
      auto event = contact;
      event["phase"] =
          previousContacts.contains(contactIdentity(contact)) ? "stay" : "enter";
      nextEvents.push_back(event);
    }
    for (const auto &contact : contacts_) {
      if (!currentContacts.contains(contactIdentity(contact))) {
        auto event = contact;
        event["phase"] = "exit";
        nextEvents.push_back(event);
      }
    }
    contacts_ = touching;
    queries_ = Json::array();
    for (const auto &q : newQueries) {
      auto result = physics_->query(q);
      result["ownerId"] = q.at("entityId");
      queries_.push_back(result);
    }
    for (auto &e : entities_) {
      auto g = e.value("gameplay", Json::object());
      if (g.contains("lifetimeTicks")) {
        const auto age = e.value("runtimeAge", 0ULL) + 1;
        e["runtimeAge"] = age;
        if (age >= g.at("lifetimeTicks").get<std::uint64_t>()) {
          structural.push_back({{"kind", "despawn"}, {"entityId", e.at("id")}});
        }
      }
      if (g.value("collectible", false) &&
          touchingEntities.contains(e.at("id").get<std::string>())) {
        score_ += g.value("scoreValue", 0.);
        structural.push_back({{"kind", "despawn"}, {"entityId", e.at("id")}});
        nextEvents.push_back({{"kind", "collected"}, {"entityId", e.at("id")}});
      }
    }
    if (!structural.empty()) {
      for (const auto &c : structural) {
        if (c.at("kind") == "despawn") {
          auto e = std::find_if(
              entities_.begin(), entities_.end(),
              [&](const Json &v) { return v.at("id") == c.at("entityId"); });
          if (e != entities_.end()) {
            removed_.push_back(*e);
            entities_.erase(e);
          }
        } else {
          auto e = c.at("entity");
          if (usedIds_.contains(e.at("id").get<std::string>()) ||
              std::any_of(
                  entities_.begin(), entities_.end(),
                  [&](const Json &v) { return v.at("id") == e.at("id"); })) {
            throw Error("command_error", "Spawn id already exists");
          }
          auto candidate = document_;
          candidate.erase("healthEntityId");
          for (auto &scene : candidate["scenes"]) {
            if (scene.at("id") == sceneId_) {
              scene["entities"] = Json::array();
              for (const auto &live : entities_) { scene["entities"].push_back(authoredEntity(live)); }
              scene["entities"].push_back(e);
            }
          }
          const auto expanded =
              resolvePrefabs(validateDocument(candidate), sceneId_);
          for (const auto &created : expanded) {
            const auto id = created.at("id").get<std::string>();
            const auto live = std::find_if(entities_.begin(), entities_.end(), [&](const Json &value) { return value.at("id") == id; });
            if (live != entities_.end()) { continue; }
            if (usedIds_.contains(id)) {
              throw Error("command_error", "Spawn id was already used in this session");
            }
            usedIds_.insert(id);
            auto spawned = created;
            spawned["spawnTick"] = tick_ + 1;
            entities_.push_back(std::move(spawned));
          }
        }
      }
      std::sort(
          entities_.begin(), entities_.end(),
          [](const Json &a, const Json &b) { return a.at("id") < b.at("id"); });
      physics_->reconcile(entities_);
    }
    if (!transition.empty()) {
      if (std::none_of(
              document_["scenes"].begin(), document_["scenes"].end(),
              [&](const Json &s) { return s.at("id") == transition; })) {
        throw Error("command_error", "Unknown target scene");
      }
      openScene(transition);
      ++generation_;
      nextEvents.push_back({{"kind", "sceneEnter"}, {"sceneId", transition}});
      presentation_ = Json::array();
    }
    checkCancellation();
    std::stable_sort(
        nextEvents.begin(), nextEvents.end(),
        [](const Json &a, const Json &b) { return a.dump() < b.dump(); });
    if (nextEvents.size() > 4096) {
      throw Error("resource_limit", "Tick event limit exceeded");
    }
    events_ = nextEvents;
    previousInput_ = input;
    ++tick_;
    for (auto &request : hostRequests_) { request["generation"] = generation_; }
    measure("gameplayMs");
    auto presentation = baseFrame();
    if (particlePresentation_) { particlePresentation_->step(presentation, presentation_); presentation["particles"] = particlePresentation_->frame(); }
    measure("presentationMs");
    if (recordTimings_) {
      timings_["totalMs"] =
          std::chrono::duration<double, std::milli>(Clock::now() - timingStart)
              .count();
    }
    return presentation;
  } catch (...) {
    try {
      const CancellationRecoveryScope recovery;
      restoreUnchecked(checkpoint);
    } catch (...) {
      faulted_ = true;
      irrecoverable_ = true;
      throw Error("session_faulted", "Tick rollback failed");
    }
    faulted_ = true;
    throw;
  }
}
Json Session::resolveCamera(bool aim) const {
  if (document_.at("dimension") == "2d") { return Json::object(); }
  for (const auto &scene : document_.at("scenes")) {
    if (scene.at("id") == sceneId_ && scene.contains("activeCameraId")) {
      auto resolved = resolveVisualHierarchy3D(entities_, Json::object(), scene.at("activeCameraId").get<std::string>()).camera;
      if (aim) {
        const auto position = resolved.at("position").get<Vector3>(), target = resolved.at("target").get<Vector3>();
        Vector3 forward; double lengthSquared = 0;
        for (std::size_t axis = 0; axis < 3; ++axis) { forward[axis] = target[axis] - position[axis]; lengthSquared += forward[axis] * forward[axis]; }
        for (auto &axis : forward) { axis /= std::sqrt(lengthSquared); }
        resolved["forward"] = forward; resolved["yaw"] = std::atan2(-forward[0], -forward[2]); resolved["pitch"] = std::asin(std::clamp(forward[1], -1., 1.));
      }
      return resolved;
    }
  }
  const auto definition = document_.value("camera", Json::object());
  auto result = definition;
  double yaw = 0, pitch = 0;
  Vector3 forward{0, 0, -1};
  if (definition.value("kind", std::string{}) == "firstPerson") {
    const auto targetId = definition.at("targetId").get<std::string>();
    std::map<std::string, const Json *> byId;
    for (const auto &entity : entities_) { byId.emplace(entity.at("id").get<std::string>(), &entity); }
    if (!byId.contains(targetId)) { throw Error("validation_error", "First-person camera target is unavailable", "/camera/targetId"); }
    const Json *target = byId.at(targetId);
    Vector3 position = target->at("transform").at("position").get<Vector3>();
    while (target->contains("parentId")) {
      target = byId.at(target->at("parentId").get<std::string>());
      const auto &transform = target->at("transform");
      const auto scale = transform.at("scale").get<Vector3>();
      for (std::size_t axis = 0; axis < 3; ++axis) { position[axis] *= scale[axis]; }
      position = rotate(transform.at("rotation").get<Quaternion>(), position);
      for (std::size_t axis = 0; axis < 3; ++axis) { position[axis] += transform.at("position")[axis].get<double>(); }
    }
    for (std::size_t axis = 0; axis < 3; ++axis) { position[axis] += definition.at("offset")[axis].get<double>(); }
    yaw = cameraState_.at("yaw");
    pitch = cameraState_.at("pitch");
    forward = {-std::sin(yaw) * std::cos(pitch), std::sin(pitch), -std::cos(yaw) * std::cos(pitch)};
    Vector3 destination = position;
    for (std::size_t axis = 0; axis < 3; ++axis) { destination[axis] += forward[axis]; }
    result = {{"position", position}, {"target", destination}, {"fov", definition.at("fov")}, {"near", definition.at("near")}, {"far", definition.at("far")}};
  } else if (aim) {
    const auto position = definition.value("position", Json::array({6, 5, 8})).get<Vector3>();
    const auto destination = definition.value("target", Json::array({0, 0, 0})).get<Vector3>();
    double lengthSquared = 0;
    for (std::size_t axis = 0; axis < 3; ++axis) { forward[axis] = destination[axis] - position[axis]; lengthSquared += forward[axis] * forward[axis]; }
    if (lengthSquared > 0) { for (auto &axis : forward) { axis /= std::sqrt(lengthSquared); } }
    else { forward = {0, 0, -1}; }
    yaw = std::atan2(-forward[0], -forward[2]);
    pitch = std::asin(std::clamp(forward[1], -1., 1.));
    result = {{"position", position}, {"target", destination}, {"fov", definition.value("fov", 60.)}, {"near", definition.value("near", .05)}, {"far", definition.value("far", 10000.)}};
  }
  if (aim) { result["yaw"] = yaw; result["pitch"] = pitch; result["forward"] = forward; }
  return result;
}
Json Session::frame() const {
  requireRecoverable();
  auto result = baseFrame();
  if (particlePresentation_) { result["particles"] = particlePresentation_->frame(); }
  return result;
}
Json Session::baseFrame() const {
  double health = 100;
  const auto healthTarget = document_.value("healthEntityId", std::string{});
  for (const auto &e : entities_) {
    if (e.contains("character") || (document_.at("dimension") == "2d" &&
        (!healthTarget.empty() ? e.at("id") == healthTarget : e.contains("body2d")))) {
      health = e.value("gameplay", Json::object()).value("health", 100.);
      break;
    }
  }
  Json lighting = document_.value("lighting", Json::object());
  Json backgrounds = document_.value("backgrounds", Json::array());
  for (const auto &scene : document_.at("scenes")) {
    if (scene.at("id") == sceneId_) {
      lighting = scene.value("lighting", lighting);
      backgrounds = scene.value("backgrounds", backgrounds);
      break;
    }
  }
  auto shownEntities = entities_;
  Json authoredOrder = Json::object(), worldTransforms = Json::object();
  if (document_.at("dimension") == "2d") {
    std::size_t order = 128;
    for (const auto &entity : resolvePrefabs(document_, sceneId_)) { authoredOrder[entity.at("id").get<std::string>()] = order++; }
    std::map<std::string, const Json *> definitions;
    for (const auto &entity : entities_) {
      const auto id = entity.at("id").get<std::string>();
      definitions.emplace(id, &entity);
      if (!authoredOrder.contains(id)) { authoredOrder[id] = order++; }
    }
    for (const auto &entity : entities_) {
      std::vector<std::string> chain;
      std::string id = entity.at("id");
      while (!id.empty() && !worldTransforms.contains(id)) {
        if (chain.size() > definitions.size() || !definitions.contains(id)) { throw Error("render", "Invalid 2D parent hierarchy"); }
        chain.push_back(id);
        id = definitions.at(id)->value("parentId", std::string{});
      }
      while (!chain.empty()) {
        const auto current = chain.back(); chain.pop_back();
        const auto &definition = *definitions.at(current);
        auto local = definition.at("transform");
        const auto parent = definition.value("parentId", std::string{});
        if (!parent.empty()) {
          const auto &p = worldTransforms.at(parent);
          const double angle = p.value("rotation", 0.), x = local.value("x", 0.) * p.value("scaleX", 1.), y = local.value("y", 0.) * p.value("scaleY", 1.);
          local["x"] = p.value("x", 0.) + std::cos(angle) * x - std::sin(angle) * y;
          local["y"] = p.value("y", 0.) + std::sin(angle) * x + std::cos(angle) * y;
          local["rotation"] = angle + local.value("rotation", 0.);
          local["scaleX"] = p.value("scaleX", 1.) * local.value("scaleX", 1.);
          local["scaleY"] = p.value("scaleY", 1.) * local.value("scaleY", 1.);
        }
        worldTransforms[current] = std::move(local);
      }
    }
  }
  std::string activeCameraId;
  if (document_.at("dimension") == "3d") { for (const auto &scene : document_.at("scenes")) { if (scene.at("id") == sceneId_) { activeCameraId = scene.value("activeCameraId", std::string{}); break; } } }
  auto camera = activeCameraId.empty() ? resolveCamera() : Json::object();
  if (document_.at("dimension") == "3d") {
    for (auto &entity : shownEntities) {
      if (entity.contains("animator3d") && entity.contains("visual")) {
        const auto &animator = entity.at("animator3d");
        const auto clip = animator.at("clips").at(animator.at("initialClip").get<std::string>()).get<std::string>();
        entity["visual"]["animation"] = std::stoul(clip.substr(5));
        entity["visual"]["animationTime"] = static_cast<double>(tick_ - std::min(tick_, entity.value("spawnTick", std::uint64_t{0}))) / 60. * animator.at("playbackRate").get<double>();
        entity["visual"]["animationLoop"] = animator.at("loop");
      }
    }
    auto resolved = resolveVisualHierarchy3D(shownEntities, camera, activeCameraId);
    shownEntities = std::move(resolved.entities); worldTransforms = std::move(resolved.worldTransforms); camera = std::move(resolved.camera);
  }
  if (document_.at("dimension") == "2d") {
    camera = document_.value("camera2d", Json{{"width", 16}, {"height", 9}, {"zoom", 1}});
    camera["x"] = 0;
    camera["y"] = 0;
    bool selectedCamera = false;
    for (auto &entity : shownEntities) {
      if (entity.contains("animator") && entity.contains("sprite")) {
        const auto &definition = entity.at("animator");
        const auto &animator = entity.contains("animation") ? definition.at("clips").at(entity.at("animation").get<std::string>()) : definition;
        const auto age = tick_ - std::min(tick_, entity.value("animationTick", entity.value("spawnTick", std::uint64_t{0})));
        const auto index = age / animator.at("ticksPerFrame").get<std::uint64_t>();
        const auto &frames = animator.at("frames");
        entity["sprite"]["frame"] = frames[animator.value("loop", true) ? index % frames.size() : std::min<std::uint64_t>(index, frames.size() - 1)];
      }
      if (entity.contains("sprite")) {
        if (entity.at("sprite").contains("faceMotion") && entity.contains("velocity")) {
          const auto velocity = entity.at("velocity").value("x", 0.);
          const bool facesLeft = entity.at("sprite").at("faceMotion") == "left";
          if (velocity != 0) { entity["sprite"]["flipX"] = (velocity < 0) != facesLeft || entity.at("sprite").value("flipX", false); }
        }
        const auto visual = entity.value("visualOverride", Json::object());
        for (auto property = visual.begin(); property != visual.end(); ++property) { entity["sprite"][property.key()] = property.value(); }
      }
      if (!selectedCamera && entity.contains("camera2d")) {
        selectedCamera = true;
        camera = entity.at("camera2d");
        camera["x"] = entity.at("transform").at("x");
        camera["y"] = entity.at("transform").at("y");
        std::map<std::string, const Json*> ancestors;
        for (const auto &candidate : entities_) { ancestors[candidate.at("id").get<std::string>()] = &candidate; }
        const Json* cursor = &entity;
        while (cursor->contains("parentId")) {
          cursor = ancestors.at(cursor->at("parentId").get<std::string>());
          camera["x"] = camera.at("x").get<double>() + cursor->at("transform").at("x").get<double>();
          camera["y"] = camera.at("y").get<double>() + cursor->at("transform").at("y").get<double>();
        }
      }
    }
  }
  Json result = {{"tick", tick_},
          {"generation", generation_},
          {"sceneId", sceneId_},
          {"dimension", document_.value("dimension", std::string("3d"))},
          {"entities", shownEntities},
          {"events", events_},
          {"presentationEvents", presentation_},
          {"hostRequests", hostRequests_},
          {"queryResults", queries_},
          {"music", music_},
          {"score", score_},
          {"health", health},
          {"logs", logs_},
          {"camera", camera},
          {"lighting", lighting},
          {"backgrounds", backgrounds},
          {"hud", document_.value("hud", Json::array())}};
  if (document_.at("dimension") == "3d") {
    result["particles"] = Json::array();
    Json order = Json::object(); std::size_t next = 0;
    for (const auto &entity : resolvePrefabs(document_, sceneId_)) { order[entity.at("id").get<std::string>()] = next++; }
    for (const auto &entity : entities_) { const auto id = entity.at("id").get<std::string>(); if (!order.contains(id)) { order[id] = next++; } }
    result["authoredOrder"] = order;
    result["worldTransforms"] = worldTransforms;
    for (const auto &scene : document_.at("scenes")) { if (scene.at("id") == sceneId_ && scene.contains("environment")) { result["environment"] = scene.at("environment"); break; } }
    if (document_.contains("presentation")) { result["presentation"] = document_.at("presentation"); }
    if (document_.contains("ui")) {
      auto nodes = document_.at("ui").at("nodes");
      for (auto &node : nodes) { const auto id = node.at("id").get<std::string>(); if (uiOverrides_.contains(id)) { for (auto field = uiOverrides_.at(id).begin(); field != uiOverrides_.at(id).end(); ++field) { node[field.key()] = field.value(); } } }
      result["ui"] = {{"safeArea", document_.at("ui").value("safeArea", true)}, {"focusNavigation", false}, {"nodes", nodes}};
    }
  }
  if (document_.at("dimension") == "2d") { result["authoredOrder"] = authoredOrder; result["worldTransforms"] = worldTransforms; }
  return result;
}
Json Session::inspect() const {
  requireRecoverable();
  auto result = frame();
  result["faulted"] = faulted_;
  return result;
}
Json Session::snapshot() const {
  requireRecoverable();
  Json result = {{"build", Build},        {"document", document_},
                 {"tick", tick_},         {"generation", generation_},
                 {"rngState", rng_},      {"sceneId", sceneId_},
                 {"entities", entities_}, {"states", states_},
                 {"timers", timers_},     {"started", started_},
                 {"events", events_},     {"contacts", contacts_},
                 {"queries", queries_},   {"previousInput", previousInput_},
                 {"removed", removed_},   {"music", music_},
                 {"score", score_},       {"seed", seed_},
                 {"usedIds", usedIds_},   {"physics", physics_->snapshot()},
                 {"cameraState", cameraState_}};
  result["uiOverrides"] = uiOverrides_;
  if (particlePresentation_) { result["particlePresentation"] = particlePresentation_->snapshot(); }
  result["documentDigest"] = documentDigest_;
  result["assetManifestDigest"] = manifestDigest_;
  result["restoreScope"] = "same-session";
  result["authentication"] = authenticate(snapshotKey_, result);
  return result;
}
void Session::restoreUnchecked(const Json &s) {
  seed_ = s.at("seed");
  usedIds_ = s.at("usedIds").get<std::set<std::string>>();
  sceneId_ = s.at("sceneId");
  entities_ = s.at("entities");
  createSpatialWorld();
  physics_->restore(s.at("physics"));
  tick_ = s.at("tick");
  generation_ = s.at("generation");
  rng_ = s.at("rngState");
  states_ = s.at("states");
  timers_ = s.at("timers");
  started_ = s.at("started");
  events_ = s.at("events");
  contacts_ = s.at("contacts");
  queries_ = s.at("queries");
  previousInput_ = s.at("previousInput");
  cameraState_ = s.at("cameraState");
  removed_ = s.at("removed");
  score_ = s.at("score");
  uiOverrides_ = s.at("uiOverrides");
  if (particlePresentation_) { particlePresentation_->restore(s.at("particlePresentation")); }
  music_ = s.at("music");
  presentation_ = Json::array();
  hostRequests_ = Json::array();
  logs_ = Json::array();
  faulted_ = false;
}
void Session::restore(const Json &s) {
  requireRecoverable();
  if (s.dump().size() > 16 * 1024 * 1024) {
    throw Error("snapshot_error", "Snapshot exceeds limit");
  }
  finiteTree(s);
  auto envelope = s;
  const auto tag = envelope.at("authentication");
  envelope.erase("authentication");
  if (tag != authenticate(snapshotKey_, envelope)) {
    throw Error("snapshot_error",
                "Snapshot authentication failed or belongs to another session");
  }
  if (s.at("build") != Build || s.at("document") != document_) {
    throw Error("snapshot_error", "Snapshot build or document mismatch");
  }
  Session candidate(document_);
  candidate.restoreUnchecked(s);
  checkCancellation();
  const auto nextGeneration = generation_ + 1;
  adopt(candidate);
  generation_ = nextGeneration;
}
void Session::reload(Json document) {
  requireRecoverable();
  Session candidate(std::move(document), seed_);
  checkCancellation();
  const auto nextGeneration = generation_ + 1;
  adopt(candidate);
  generation_ = nextGeneration;
}
void Session::adopt(Session &other) noexcept {
  music_.swap(other.music_);
  cameraState_.swap(other.cameraState_);
  documentDigest_.swap(other.documentDigest_);
  manifestDigest_.swap(other.manifestDigest_);
  logs_.swap(other.logs_);
  document_.swap(other.document_);
  entities_.swap(other.entities_);
  states_.swap(other.states_);
  timers_.swap(other.timers_);
  started_.swap(other.started_);
  events_.swap(other.events_);
  presentation_.swap(other.presentation_);
  hostRequests_.swap(other.hostRequests_);
  uiOverrides_.swap(other.uiOverrides_);
  particlePresentation_.swap(other.particlePresentation_);
  contacts_.swap(other.contacts_);
  queries_.swap(other.queries_);
  previousInput_.swap(other.previousInput_);
  removed_.swap(other.removed_);
  sceneId_.swap(other.sceneId_);
  physics_.swap(other.physics_);
  sources_.swap(other.sources_);
  usedIds_.swap(other.usedIds_);
  std::swap(seed_, other.seed_);
  std::swap(tick_, other.tick_);
  std::swap(generation_, other.generation_);
  std::swap(rng_, other.rng_);
  std::swap(score_, other.score_);
  std::swap(faulted_, other.faulted_);
}
} // namespace nodetool::game
