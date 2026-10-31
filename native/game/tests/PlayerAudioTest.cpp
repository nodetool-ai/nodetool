#include "player/PlayerAudio.h"
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
int main() {
  const auto root =
      std::filesystem::temp_directory_path() /
      ("native-player-audio-" +
       std::to_string(
           std::chrono::steady_clock::now().time_since_epoch().count()));
  try {
    std::filesystem::create_directories(root);
    const auto wav = encodeWave(std::vector<float>(1600, 0.5f), 32000);
    {
      std::ofstream f(root / "tone.wav", std::ios::binary);
      f.write(reinterpret_cast<const char *>(wav.data()), wav.size());
    }
    const nlohmann::json manifest =
        nlohmann::json::array({{{"id", "tone"},
                                {"kind", "audio"},
                                {"digest", assetDigest(wav)},
                                {"path", "tone.wav"},
                                {"size", wav.size()},
                                {"dependencies", nlohmann::json::array()}}});
    PreparedAssets assets(root, manifest);
    PlayerAudio audio(assets, {{"assets", manifest}}, true);
    nlohmann::json event = {{"presentationType", "audio"},
                            {"generation", 1},
                            {"tick", 1},
                            {"id", "play"},
                            {"kind", "play"},
                            {"assetId", "tone"}};
    audio.consumeFrame(
        {{"generation", 1},
         {"tick", 1},
         {"presentationEvents", nlohmann::json::array({event})}});
    auto pcm = audio.mixTick();
    if (pcm.size() != 1600 || std::abs(pcm[0] - 0.5f) > 0.001f) {
      throw std::runtime_error("Player did not consume verified audio asset");
    }
    audio.consumeFrame(
        {{"generation", 1},
         {"tick", 1},
         {"presentationEvents", nlohmann::json::array({event})}});
    if (!audio.mixTick().empty()) {
      throw std::runtime_error("Repeated frame remixed");
    }
    audio.consumeFrame({{"generation", 2},
                        {"tick", 0},
                        {"presentationEvents", nlohmann::json::array()}});
    pcm = audio.mixTick();
    if (pcm[0] != 0) {
      throw std::runtime_error("Restore duplicated one-shot");
    }
    event["generation"] = 2;
    event["tick"] = 1;
    event["loop"] = true;
    event["music"] = true;
    audio.consumeFrame(
        {{"generation", 2},
         {"tick", 1},
         {"presentationEvents", nlohmann::json::array({event})}});
    audio.mixTick();
    event["startTick"] = 1;
    audio.consumeFrame({{"generation", 3},
                        {"tick", 2},
                        {"music", nlohmann::json::array({event})}});
    pcm = audio.mixTick();
    if (std::abs(pcm[0] - 0.5f) > 0.001f || audio.report().at("voices") != 1) {
      throw std::runtime_error("Music restore failed");
    }
    if (std::abs(audio.report().at("music").at(0).at("frame").get<double>() -
                 (800.0 / 3.0)) > 0.01) {
      throw std::runtime_error(
          "Music restore used output rate instead of clip rate");
    }
    PlayerAudio spatial2d(assets, {{"dimension", "2d"}, {"assets", manifest}},
                          true);
    PlayerAudio spatial3d(assets, {{"dimension", "3d"}, {"assets", manifest}},
                          true);
    auto positioned = event;
    positioned["generation"] = 8;
    positioned["tick"] = 1;
    positioned["position"] = {{"x", 1}, {"y", 1}};
    auto positioned3d = positioned;
    positioned3d["position"] = {1, 1, 0};
    for (std::uint64_t tick = 1; tick <= 4; ++tick) {
      const float x = tick == 1 ? 0 : tick == 2 ? 2 : 1;
      const float y = tick == 3 ? 3 : 1;
      nlohmann::json frame2d = {
          {"generation", 8},
          {"tick", tick},
          {"camera", {{"x", x}, {"y", y}}},
          {"presentationEvents", tick == 1 ? nlohmann::json::array({positioned})
                                           : nlohmann::json::array()}};
      auto frame3d = frame2d;
      frame3d["camera"] = {{"position", {x, y, 0}}};
      if (tick == 1) {
        frame3d["presentationEvents"] = nlohmann::json::array({positioned3d});
      }
      spatial2d.consumeFrame(frame2d);
      spatial3d.consumeFrame(frame3d);
      if (!spatial2d.report().at("diagnostics").empty() ||
          spatial2d.report().at("voices") != 1) {
        throw std::runtime_error("2D positioned WAV did not create a voice: " +
                                 spatial2d.report().dump());
      }
      const auto pcm2d = spatial2d.mixTick(), pcm3d = spatial3d.mixTick();
      if (pcm2d != pcm3d) {
        throw std::runtime_error(
            "2D spatial audio differs from equivalent 3D emitter/listener");
      }
      const float left = tick == 1   ? 0
                         : tick == 2 ? .5f
                         : tick == 3 ? .5f / (2 * std::sqrt(2.F))
                                     : .5f / std::sqrt(2.F);
      const float right = tick == 1 ? .5f : tick == 2 ? 0 : left;
      if (std::abs(pcm2d[0] - left) > .001F ||
          std::abs(pcm2d[1] - right) > .001F) {
        throw std::runtime_error(
            "2D camera pan or distance attenuation incorrect");
      }
    }
    positioned["startTick"] = 1;
    spatial2d.consumeFrame({{"generation", 9},
                            {"tick", 2},
                            {"camera", {{"x", 0}, {"y", 1}}},
                            {"music", nlohmann::json::array({positioned})}});
    pcm = spatial2d.mixTick();
    if (pcm[0] != 0 || std::abs(pcm[1] - .5F) > .001F ||
        spatial2d.report().at("voices") != 1 ||
        !spatial2d.report().at("diagnostics").empty()) {
      throw std::runtime_error("Positioned 2D music restore failed: " +
                               spatial2d.report().dump());
    }
    if (positioned.at("position") != nlohmann::json({{"x", 1}, {"y", 1}})) {
      throw std::runtime_error(
          "Native audio adapter mutated shared 2D event coordinates");
    }
    PlayerAudio global2d(assets, {{"dimension", "2d"}, {"assets", manifest}},
                         true);
    auto globalEvent = event;
    globalEvent["entityId"] = "speaker";
    global2d.consumeFrame(
        {{"generation", 2},
         {"tick", 1},
         {"camera", {{"x", 100}, {"y", 100}}},
         {"presentationEvents", nlohmann::json::array({globalEvent})}});
    pcm = global2d.mixTick();
    if (std::abs(pcm[0] - .5F) > .001F || std::abs(pcm[1] - .5F) > .001F) {
      throw std::runtime_error(
          "Unpositioned 2D audio became spatial from its target ID");
    }
    auto wrong = manifest;
    wrong[0]["digest"] = std::string(64, '0');
    PreparedAssets corrupt(root, wrong);
    PlayerAudio broken(corrupt, {{"assets", wrong}}, true);
    if (broken.report().at("diagnostics").empty()) {
      throw std::runtime_error("Asset corruption not diagnosed");
    }
    std::filesystem::remove_all(root);
    std::cout << "player audio tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::filesystem::remove_all(root);
    std::cerr << error.what() << '\n';
    return 1;
  }
}
