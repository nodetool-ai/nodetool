#include "presentation/Particles3D.h"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool value, const char *message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}
Json makeFrame(std::uint64_t tick, Json entities = Json::array()) {
  Json transforms = Json::object();
  for (const auto &entity : entities) {
    transforms[entity.at("id").get<std::string>()] = entity.at("transform");
  }
  return {{"worldTransforms", std::move(transforms)},
          {"tick", tick},
          {"sceneId", "scene"},
          {"entities", std::move(entities)}};
}
Json entity(Json emitter = Json{{"id", "rain"},
                                {"rate", 60},
                                {"shape",
                                 {{"kind", "box"},
                                  {"size", {{"x", 1}, {"y", 0}, {"z", 1}}}}}}) {
  return {{"id", "rain"},
          {"transform",
           {{"position", {0, 0, 0}},
            {"rotation", {0, 0, 0, 1}},
            {"scale", {1, 1, 1}}}},
          {"particles", {{"emitters", Json::array({std::move(emitter)})}}}};
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc == 2) {
      std::ifstream input(argv[1]);
      Json fixture;
      input >> fixture;
      ParticlePresentation3D particles;
      Json captures = Json::array();
      Json counts = Json::array();
      const auto captureTicks = fixture.value("captureTicks", Json::array());
      for (const auto &frame : fixture.at("frames")) {
        particles.step(frame, frame.value("emissions", Json::array()));
        const auto samples = particles.frame();
        if (!captureTicks.empty()) {
          Json byEmitter = Json::object();
          for (const auto &sample : samples) {
            const auto key = sample.at("entityId").get<std::string>() + "/" +
                             sample.at("emitterId").get<std::string>();
            byEmitter[key] = byEmitter.value(key, 0) + 1;
          }
          counts.push_back(
              {{"tick", frame.at("tick")}, {"emitters", std::move(byEmitter)}});
        }
        if (std::find(captureTicks.begin(), captureTicks.end(),
                      frame.at("tick")) != captureTicks.end()) {
          captures.push_back(
              {{"tick", frame.at("tick")}, {"particles", samples}});
        }
      }
      std::cout << (captureTicks.empty()
                        ? particles.frame()
                        : Json{{"captures", captures}, {"counts", counts}})
                       .dump()
                << '\n';
      return 0;
    }
    ParticlePresentation3D particles;
    const auto source = entity();
    particles.step(makeFrame(0, Json::array({source})), Json::array());
    require(particles.frame().empty(),
            "Tick zero initializes without advancing");
    particles.step(makeFrame(1, Json::array({source})), Json::array());
    require(particles.frame().size() == 1, "Rate emits once at tick one");
    const auto first = particles.frame(), saved = particles.snapshot();
    particles.step(makeFrame(2, Json::array({source})), Json::array());
    const auto second = particles.frame();
    require(second.size() == 2, "Rate accumulation preserves particles");
    particles.restore(saved);
    require(particles.frame() == first, "Snapshot restores exact presentation");
    particles.step(makeFrame(2, Json::array({source})), Json::array());
    require(particles.frame() == second, "Snapshot restores random sequence");
    particles.step(makeFrame(2, Json::array({source})), Json::array());
    require(particles.frame() == second, "Duplicate tick does not emit twice");
    bool rejected = false;
    try {
      particles.step(makeFrame(4), Json::array());
    } catch (const Error &) {
      rejected = true;
    }
    require(rejected, "Missing committed ticks rejected");
    auto malformed = saved;
    malformed["emitters"][0]["particles"][0][7] = 0;
    rejected = false;
    try {
      particles.restore(malformed);
    } catch (const Error &) {
      rejected = true;
    }
    require(rejected, "Invalid lifetimes rejected");
    require(particles.frame() == second,
            "Failed restore leaves live state unchanged");
    ParticlePresentation3D local;
    auto attached = entity({{"id", "flash"},
                            {"rate", 0},
                            {"space", "local"},
                            {"shape", {{"kind", "cone"}, {"angle", 0}}},
                            {"speed", 0}});
    attached["parentId"] = "parent";
    attached["transform"]["position"] = {1, 0, 0};
    auto parent = Json{{"id", "parent"},
                       {"transform",
                        {{"position", {2, 3, 4}},
                         {"rotation", {0, 0, std::sqrt(.5), std::sqrt(.5)}},
                         {"scale", {2, 1, 1}}}}};
    attached["transform"]["position"] = {2, 5, 4};
    attached["transform"]["rotation"] = parent.at("transform").at("rotation");
    attached.erase("parentId");
    auto entities = Json::array({attached, parent});
    local.step(makeFrame(0, entities), Json::array());
    local.step(makeFrame(1, entities), Json::array({{{"kind", "particles"},
                                                     {"entityId", "rain"},
                                                     {"emitter", "flash"},
                                                     {"count", 1}}}));
    const auto position = local.frame().at(0).at("position");
    require(std::abs(position.at(0).get<double>() - 2) < 1e-12 &&
                std::abs(position.at(1).get<double>() - 5) < 1e-12,
            "Local emitters inherit parent rotation and scale");
    local.step(makeFrame(2), Json::array());
    require(local.frame().empty(), "Detached local particles disappear");
    ParticlePresentation3D capped;
    auto limited =
        entity({{"id", "rain"}, {"rate", 1000}, {"maxParticles", 2}});
    capped.step(makeFrame(0, Json::array({limited})), Json::array());
    for (std::uint64_t tick = 1; tick < 100; ++tick) {
      capped.step(makeFrame(tick, Json::array({limited})), Json::array());
    }
    require(capped.frame().size() == 2, "Emitter storage remains bounded");
    auto newScene = makeFrame(100);
    newScene["sceneId"] = "next";
    capped.step(newScene, Json::array());
    require(capped.frame().empty(), "Scene transitions clear particles");
    std::cout << "Particle presentation rate, hierarchy, bounded storage and "
                 "restore passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
