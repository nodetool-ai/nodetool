#include "Particles3D.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <numbers>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace nodetool::game {
namespace {
constexpr std::size_t MaxParticles = 8192, MaxEmitters = 1024;
constexpr std::size_t MaxStateBytes = 8 * 1024 * 1024;
constexpr double SameTime = 1e-9, Seconds = 1. / 60;
using Vec = std::array<double, 3>;
using Quat = std::array<double, 4>;
using Particle = std::array<double, 14>;
constexpr Quat Identity = {0, 0, 0, 1};
struct Transform {
  Vec position{0, 0, 0};
  Quat rotation = Identity;
  Vec scale{1, 1, 1};
};
struct Emitter {
  std::string entityId, emitterId;
  Json definition;
  std::uint32_t random = 0;
  double time = 0, accumulator = 0;
  std::uint32_t pending = 0;
  bool attached = false, playing = true;
  Transform transform;
  std::vector<Particle> particles;
};
double next(std::uint32_t &state) {
  state += 0x6d2b79f5U;
  auto value = state;
  value = (value ^ (value >> 15)) * (value | 1U);
  value ^= value + (value ^ (value >> 7)) * (value | 61U);
  return double(value ^ (value >> 14)) / 4294967296.;
}
std::uint32_t seedOf(const std::string &entity, const std::string &emitter) {
  auto result = 0x811c9dc5U;
  const auto hash = [&](std::uint32_t code) {
    result = (result ^ code) * 0x01000193U;
  };
  // FNV hashes JavaScript UTF-16 code units, including the emitter separator.
  const auto text = entity + '\0' + emitter;
  for (std::size_t index = 0; index < text.size();) {
    const auto lead = static_cast<unsigned char>(text[index++]);
    std::uint32_t code = lead;
    int remaining = 0;
    if (lead >= 0xf0) {
      code = lead & 7U;
      remaining = 3;
    } else if (lead >= 0xe0) {
      code = lead & 15U;
      remaining = 2;
    } else if (lead >= 0xc0) {
      code = lead & 31U;
      remaining = 1;
    }
    while (remaining-- > 0 && index < text.size()) {
      code = (code << 6) | (static_cast<unsigned char>(text[index++]) & 63U);
    }
    if (code > 0xffff) {
      code -= 0x10000;
      hash(0xd800U + (code >> 10));
      hash(0xdc00U + (code & 1023U));
    } else {
      hash(code);
    }
  }
  return result;
}
double sample(const Json &value, std::uint32_t &random) {
  if (value.is_number()) {
    return value.get<double>();
  }
  const double low = value.at("min"), high = value.at("max");
  return low + (high - low) * next(random);
}
Vec rotate(const Quat &q, Vec p) {
  const Vec t = {2 * (q[1] * p[2] - q[2] * p[1]),
                 2 * (q[2] * p[0] - q[0] * p[2]),
                 2 * (q[0] * p[1] - q[1] * p[0])};
  return {p[0] + q[3] * t[0] + q[1] * t[2] - q[2] * t[1],
          p[1] + q[3] * t[1] + q[2] * t[0] - q[0] * t[2],
          p[2] + q[3] * t[2] + q[0] * t[1] - q[1] * t[0]};
}
double curve(const Json &keys, double time) {
  if (time <= keys.front().at("t").get<double>()) {
    return keys.front().at("value");
  }
  for (std::size_t i = 1; i < keys.size(); ++i) {
    if (time <= keys[i].at("t").get<double>()) {
      const double previous = keys[i - 1].at("t"), current = keys[i].at("t"),
                   low = keys[i - 1].at("value"), high = keys[i].at("value");
      return current <= previous ? high
                                 : low + (high - low) * (time - previous) /
                                             (current - previous);
    }
  }
  return keys.back().at("value");
}
Vec color(const std::string &hex) {
  const auto value = std::stoul(hex.substr(1), nullptr, 16);
  return {double((value >> 16) & 255) / 255, double((value >> 8) & 255) / 255,
          double(value & 255) / 255};
}
Vec gradient(const Json &keys, double time) {
  if (time <= keys.front().at("t").get<double>()) {
    return color(keys.front().at("color"));
  }
  for (std::size_t i = 1; i < keys.size(); ++i) {
    if (time <= keys[i].at("t").get<double>()) {
      const double previous = keys[i - 1].at("t"), current = keys[i].at("t"),
                   mix = current <= previous
                             ? 1
                             : (time - previous) / (current - previous);
      auto low = color(keys[i - 1].at("color"));
      const auto high = color(keys[i].at("color"));
      for (std::size_t axis = 0; axis < 3; ++axis) {
        low[axis] += (high[axis] - low[axis]) * mix;
      }
      return low;
    }
  }
  return color(keys.back().at("color"));
}
void shape(const Json &definition, std::uint32_t &random, Vec &position,
           Vec &direction) {
  position = {0, 0, 0};
  direction = {0, 1, 0};
  const auto kind = definition.value("kind", std::string("point"));
  const auto sphere = [&] {
    const double z = next(random) * 2 - 1,
                 turn = next(random) * 2 * std::numbers::pi,
                 ring = std::sqrt(std::max(0., 1 - z * z));
    direction = {ring * std::cos(turn), ring * std::sin(turn), z};
  };
  if (kind == "point") {
    sphere();
  } else if (kind == "sphere") {
    sphere();
    const double unit = next(random),
                 radius =
                     definition.at("radius").get<double>() *
                     (definition.value("fromSurface", false) ? 1
                                                             : std::cbrt(unit));
    for (std::size_t axis = 0; axis < 3; ++axis) {
      position[axis] = direction[axis] * radius;
    }
  } else if (kind == "cone") {
    const double cosine =
                     1 -
                     next(random) *
                         (1 - std::cos(definition.at("angle").get<double>() *
                                       std::numbers::pi / 180)),
                 sine = std::sqrt(std::max(0., 1 - cosine * cosine)),
                 turn = next(random) * std::numbers::pi * 2;
    direction = {sine * std::cos(turn), cosine, sine * std::sin(turn)};
    const double radius =
                     definition.value("radius", 0.) * std::sqrt(next(random)),
                 base = next(random) * std::numbers::pi * 2;
    position = {radius * std::cos(base), 0, radius * std::sin(base)};
  } else if (kind == "box") {
    const auto &size = definition.at("size");
    position = {(next(random) - .5) * size.at("x").get<double>(),
                (next(random) - .5) * size.at("y").get<double>(),
                (next(random) - .5) * size.value("z", 0.)};
  } else {
    throw Error("unsupported", "Unsupported native particle shape: " + kind);
  }
}
void supported(const Json &definition) {
  if (definition.contains("sprite") ||
      !definition.value("onDeath", Json::array()).empty() ||
      definition.contains("speedOverLifetime") ||
      !definition.value("color", Json("#ffffff")).is_string()) {
    throw Error("unsupported", "Unsupported native particle emitter branch");
  }
  const auto render = definition.value("render", Json{{"kind", "billboard"}});
  const auto kind = render.at("kind").get<std::string>();
  if (kind != "billboard" && kind != "stretched" &&
      (kind != "mesh" ||
       render.value("shape", std::string()) != "tetrahedron" ||
       render.value("align", std::string("world")) != "world")) {
    throw Error("unsupported", "Unsupported native particle render style");
  }
}
} // namespace
struct ParticlePresentation3D::State {
  std::string scene;
  std::optional<std::uint64_t> tick;
  std::vector<Emitter> emitters;
  std::size_t count = 0;
};
ParticlePresentation3D::ParticlePresentation3D(std::uint32_t seed)
    : state_(std::make_unique<State>()) {
  // Legacy presentation streams depend only on entity/emitter ids,
  // independently of gameplay RNG.
  static_cast<void>(seed);
}
ParticlePresentation3D::~ParticlePresentation3D() = default;
void ParticlePresentation3D::step(const Json &frame, const Json &emissions) {
  const auto scene = frame.at("sceneId").get<std::string>();
  const auto tick = frame.at("tick").get<std::uint64_t>();
  auto &state = *state_;
  if (state.scene != scene) {
    state = State{};
    state.scene = scene;
  }
  if (state.tick && tick != *state.tick + 1 && tick != *state.tick) {
    throw Error("presentation", "Particle ticks must be consecutive");
  }
  if (state.tick && tick == *state.tick) {
    return;
  }
  const auto &entities = frame.at("entities");
  const auto &transforms = frame.at("worldTransforms");
  for (auto &emitter : state.emitters) {
    emitter.attached = false;
  }
  std::map<std::pair<std::string, std::string>, std::size_t> indexes;
  for (std::size_t i = 0; i < state.emitters.size(); ++i) {
    indexes[{state.emitters[i].entityId, state.emitters[i].emitterId}] = i;
  }
  for (const auto &entity : entities) {
    if (!entity.contains("particles")) {
      continue;
    }
    const auto id = entity.at("id").get<std::string>();
    for (const auto &definition : entity.at("particles").at("emitters")) {
      supported(definition);
      const auto emitterId = definition.at("id").get<std::string>();
      const auto key = std::pair{id, emitterId};
      auto found = indexes.find(key);
      if (found == indexes.end()) {
        if (state.emitters.size() >= MaxEmitters) {
          throw Error("resource_limit",
                      "Native particle emitter budget exceeded");
        }
        Emitter emitter;
        emitter.entityId = id;
        emitter.emitterId = emitterId;
        emitter.random = seedOf(id, emitterId);
        emitter.playing = definition.value("playOnStart", true);
        indexes[key] = state.emitters.size();
        state.emitters.push_back(std::move(emitter));
        found = indexes.find(key);
      }
      auto &emitter = state.emitters[found->second];
      emitter.definition = definition;
      const auto &world = transforms.at(id);
      emitter.transform = {world.at("position").get<Vec>(),
                           world.at("rotation").get<Quat>(),
                           world.at("scale").get<Vec>()};
      emitter.attached = true;
      const auto maximum = definition.value("maxParticles", 256U);
      while (emitter.particles.size() > maximum) {
        emitter.particles.pop_back();
        --state.count;
      }
    }
  }
  for (auto &emitter : state.emitters) {
    if (!emitter.attached &&
        emitter.definition.value("space", std::string("world")) == "local") {
      state.count -= emitter.particles.size();
      emitter.particles.clear();
    }
  }
  for (const auto &event : emissions) {
    if (event.value("kind", std::string()) != "particles") {
      continue;
    }
    const auto id = event.value("entityId", std::string());
    for (auto &emitter : state.emitters) {
      if (emitter.entityId != id || !emitter.attached ||
          (event.contains("emitter") &&
           event.at("emitter") != emitter.emitterId)) {
        continue;
      }
      if (event.contains("count")) {
        emitter.pending += event.at("count").get<std::uint32_t>();
      } else {
        emitter.time = 0;
        emitter.accumulator = 0;
        emitter.playing = true;
      }
      break;
    }
  }
  if (tick == 0 && !state.tick) {
    state.tick = tick;
    return;
  }
  for (auto &emitter : state.emitters) {
    const auto &d = emitter.definition;
    const auto gravity = d.value("gravity", Json{{"x", 0}, {"y", 0}, {"z", 0}});
    const double drag = d.value("drag", 0.),
                 damping = drag > 0 ? 1 / (1 + drag * Seconds) : 1;
    for (std::size_t i = 0; i < emitter.particles.size();) {
      auto &p = emitter.particles[i];
      const double age = p[6] + Seconds;
      if (age >= p[7]) {
        p = emitter.particles.back();
        emitter.particles.pop_back();
        --state.count;
        continue;
      }
      p[6] = age;
      for (std::size_t axis = 0; axis < 3; ++axis) {
        const auto key = axis == 0 ? "x" : axis == 1 ? "y" : "z";
        p[3 + axis] =
            (p[3 + axis] + gravity.value(key, 0.) * Seconds) * damping;
        p[axis] += p[3 + axis] * Seconds;
      }
      p[9] += p[10] * Seconds;
      ++i;
    }
  }
  for (auto &emitter : state.emitters) {
    if (!emitter.attached) {
      continue;
    }
    const auto &d = emitter.definition;
    std::uint32_t emitted = emitter.pending;
    emitter.pending = 0;
    double remaining = Seconds;
    while (emitter.playing && remaining > 0) {
      const double start = emitter.time,
                   length =
                       std::max(0., std::min(remaining,
                                             d.value("duration", 1.) - start)),
                   end = start + length;
      emitter.accumulator += d.value("rate", 10.) * length;
      const auto whole = static_cast<std::uint32_t>(
          std::floor(emitter.accumulator + SameTime));
      emitter.accumulator = std::max(0., emitter.accumulator - whole);
      emitted += whole;
      for (const auto &burst : d.value("bursts", Json::array())) {
        for (std::uint32_t cycle = 0; cycle < burst.value("cycles", 1U);
             ++cycle) {
          const double at =
              burst.value("time", 0.) + cycle * burst.value("interval", .1);
          if (at >= start - SameTime && at < end - SameTime) {
            emitted += burst.at("count").get<std::uint32_t>();
          }
        }
      }
      remaining -= length;
      emitter.time = end;
      if (emitter.time >= d.value("duration", 1.) - SameTime) {
        if (d.value("loop", true)) {
          emitter.time = 0;
        } else {
          emitter.playing = false;
        }
      }
    }
    while (emitted-- > 0 &&
           emitter.particles.size() < d.value("maxParticles", 256U) &&
           state.count < MaxParticles) {
      Vec position{}, direction{};
      shape(d.value("shape", Json{{"kind", "point"}}), emitter.random, position,
            direction);
      const double lifetime =
                       sample(d.value("lifetime", Json(1)), emitter.random),
                   speed = sample(d.value("speed", Json(1)), emitter.random),
                   size = sample(d.value("size", Json(.1)), emitter.random),
                   rotation =
                       sample(d.value("rotation", Json(0)), emitter.random),
                   spin = sample(d.value("angularVelocity", Json(0)),
                                 emitter.random);
      if (d.value("space", std::string("world")) == "world") {
        position = rotate(emitter.transform.rotation, position);
        direction = rotate(emitter.transform.rotation, direction);
        for (std::size_t axis = 0; axis < 3; ++axis) {
          position[axis] += emitter.transform.position[axis];
        }
      }
      const auto tint = color(d.value("color", std::string("#ffffff")));
      emitter.particles.push_back({position[0], position[1], position[2],
                                   direction[0] * speed, direction[1] * speed,
                                   direction[2] * speed, 0, lifetime, size,
                                   rotation, spin, tint[0], tint[1], tint[2]});
      ++state.count;
    }
  }
  std::erase_if(state.emitters, [](const auto &emitter) {
    return !emitter.attached && emitter.particles.empty();
  });
  state.tick = tick;
}
Json ParticlePresentation3D::frame() const {
  Json result = Json::array();
  for (const auto &emitter : state_->emitters) {
    const auto &d = emitter.definition;
    for (const auto &p : emitter.particles) {
      const double life = std::min(1., p[6] / p[7]);
      Vec position = {p[0], p[1], p[2]}, velocity = {p[3], p[4], p[5]},
          tint = {p[11], p[12], p[13]};
      if (d.value("space", std::string("world")) == "local") {
        position = rotate(emitter.transform.rotation, position);
        velocity = rotate(emitter.transform.rotation, velocity);
        for (std::size_t axis = 0; axis < 3; ++axis) {
          position[axis] += emitter.transform.position[axis];
        }
      }
      if (d.contains("colorOverLifetime")) {
        const auto gradientColor = gradient(d.at("colorOverLifetime"), life);
        for (std::size_t axis = 0; axis < 3; ++axis) {
          tint[axis] *= gradientColor[axis];
        }
      }
      auto render = d.value("render", Json{{"kind", "billboard"}});
      if (render.at("kind") == "stretched") {
        render["length"] = render.value("length", 1.);
        render["speedScale"] = render.value("speedScale", .1);
      }
      if (render.at("kind") == "mesh") {
        render["align"] = render.value("align", std::string("world"));
      }
      result.push_back(
          {{"entityId", emitter.entityId},
           {"emitterId", emitter.emitterId},
           {"position", position},
           {"velocity", velocity},
           {"size", p[8] * (d.contains("sizeOverLifetime")
                                ? curve(d.at("sizeOverLifetime"), life)
                                : 1)},
           {"rotation", p[9]},
           {"color", tint},
           {"opacity", d.value("opacity", 1.) *
                           (d.contains("opacityOverLifetime")
                                ? curve(d.at("opacityOverLifetime"), life)
                                : 1)},
           {"life", life},
           {"age", p[6]},
           {"lifetime", p[7]},
           {"blend", d.value("blend", std::string("normal"))},
           {"unlit", d.value("unlit", false)},
           {"softness", d.value("softness", 0.)},
           {"render", std::move(render)}});
    }
  }
  return result;
}
Json ParticlePresentation3D::snapshot() const {
  Json emitters = Json::array();
  for (const auto &e : state_->emitters) {
    emitters.push_back({{"entityId", e.entityId},
                        {"emitterId", e.emitterId},
                        {"definition", e.definition},
                        {"random", e.random},
                        {"time", e.time},
                        {"accumulator", e.accumulator},
                        {"pending", e.pending},
                        {"attached", e.attached},
                        {"playing", e.playing},
                        {"position", e.transform.position},
                        {"rotation", e.transform.rotation},
                        {"scale", e.transform.scale},
                        {"particles", e.particles}});
  }
  Json result = {{"scene", state_->scene},
                 {"tick", state_->tick ? Json(*state_->tick) : Json(nullptr)},
                 {"emitters", std::move(emitters)}};
  if (result.dump().size() > MaxStateBytes) {
    throw Error("resource_limit", "Native particle snapshot budget exceeded");
  }
  return result;
}
void ParticlePresentation3D::restore(const Json &saved) {
  if (!saved.is_object() || saved.dump().size() > MaxStateBytes ||
      !saved.contains("emitters") || !saved.at("emitters").is_array() ||
      saved.at("emitters").size() > MaxEmitters) {
    throw Error("snapshot", "Invalid native particle snapshot");
  }
  auto nextState = std::make_unique<State>();
  nextState->scene = saved.at("scene").get<std::string>();
  if (!saved.at("tick").is_null()) {
    nextState->tick = saved.at("tick").get<std::uint64_t>();
  }
  std::set<std::pair<std::string, std::string>> ids;
  for (const auto &value : saved.at("emitters")) {
    Emitter e;
    e.entityId = value.at("entityId");
    e.emitterId = value.at("emitterId");
    if (!ids.emplace(e.entityId, e.emitterId).second) {
      throw Error("snapshot", "Duplicate native particle emitter");
    }
    e.definition = value.at("definition");
    supported(e.definition);
    e.random = value.at("random");
    e.time = value.at("time");
    e.accumulator = value.at("accumulator");
    e.pending = value.at("pending");
    e.attached = value.at("attached");
    e.playing = value.at("playing");
    e.transform.position = value.at("position").get<Vec>();
    e.transform.rotation = value.at("rotation").get<Quat>();
    e.transform.scale = value.at("scale").get<Vec>();
    e.particles = value.at("particles").get<std::vector<Particle>>();
    nextState->count += e.particles.size();
    if (nextState->count > MaxParticles ||
        e.particles.size() > e.definition.value("maxParticles", 256U) ||
        !std::isfinite(e.time) || !std::isfinite(e.accumulator)) {
      throw Error("snapshot", "Invalid native particle count or clock");
    }
    for (const auto &p : e.particles) {
      if (!std::all_of(p.begin(), p.end(),
                       [](double v) { return std::isfinite(v); }) ||
          p[6] < 0 || p[7] <= 0 || p[6] >= p[7]) {
        throw Error("snapshot", "Invalid native particle payload");
      }
    }
    nextState->emitters.push_back(std::move(e));
  }
  state_ = std::move(nextState);
}
} // namespace nodetool::game
