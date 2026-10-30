#include "core/Session.h"
#include <iostream>
using namespace nodetool::game;
int main() {
  try {
    const Json document = {
        {"engine", "native-cpp-1"},
        {"schemaVersion", 4},
        {"dimension", "3d"},
        {"id", "timing"},
        {"title", "Timing"},
        {"initialSceneId", "scene"},
        {"scenes",
         Json::array(
             {{{"id", "scene"},
               {"entities",
                Json::array({{{"id", "player"},
                              {"behaviors",
                               Json::array({{{"id", "script"},
                                             {"scriptId", "script"}}})}}})}}})},
        {"scripts",
         Json::array({{{"id", "script"},
                       {"source", "i=>({state:{random:i.random()},commands:[{"
                                  "kind:'score',amount:1}]})"}}})}};
    Session measured(document, 123), reference(document, 123);
    measured.recordTimings(true);
    for (int tick = 0; tick < 10; ++tick) {
      if (measured.step() != reference.step()) {
        throw std::runtime_error("Timing changed committed presentation");
      }
    }
    if (measured.snapshot().at("states") != reference.snapshot().at("states") ||
        measured.snapshot().contains("timings")) {
      throw std::runtime_error("Timing leaked into simulation state");
    }
    if (measured.timings().at("scriptsMs").get<double>() < 0 ||
        measured.timings().at("physicsMs").get<double>() < 0 ||
        !reference.timings().empty()) {
      throw std::runtime_error("Invalid opt-in timing contract");
    }
    std::cout << "Opt-in timings preserve simulation state\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
