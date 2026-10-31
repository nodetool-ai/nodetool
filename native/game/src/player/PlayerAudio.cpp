#include "PlayerAudio.h"
#include <stdexcept>
namespace nodetool::game {
namespace {
void normalizePosition(nlohmann::json &event, bool is2D) {
  if (is2D && event.contains("position") && event.at("position").is_object()) {
    const auto &position = event.at("position");
    event["position"] = {position.at("x").get<float>(),
                         position.at("y").get<float>(), 0.F};
  }
}
} // namespace
PlayerAudio::PlayerAudio(PreparedAssets &assets, const nlohmann::json &document,
                         bool nullDevice)
    : device_(nullDevice ? AudioDevice::Backend::Null
                         : AudioDevice::Backend::System),
      is2D_(document.value("dimension", std::string("3d")) == "2d") {
  for (const auto &asset : document.value("assets", nlohmann::json::array())) {
    if (asset.value("kind", std::string{}) != "audio") {
      continue;
    }
    try {
      const auto bytes = assets.bytes(asset.at("id").get<std::string>());
      auto clip = std::make_shared<const PcmClip>(decodeWave(*bytes));
      sampleRates_[asset.at("id").get<std::string>()] = clip->sampleRate;
      mixer_.registerClip(asset.at("id").get<std::string>(), std::move(clip));
    } catch (const std::exception &error) {
      diagnostic(error.what());
    }
  }
  if (!device_.diagnostic().at("available").get<bool>()) {
    diagnostic(device_.diagnostic().value(
        "error", std::string("Audio output unavailable")));
  }
}
void PlayerAudio::diagnostic(const std::string &message) {
  if (diagnostics_.size() < 64) {
    diagnostics_.push_back(
        {{"code", "audio"}, {"message", message.substr(0, 2048)}});
  }
}
void PlayerAudio::consumeFrame(const nlohmann::json &frame) {
  const auto generation = frame.value("generation", std::uint64_t(0));
  const auto tick = frame.value("tick", std::uint64_t(0));
  if (initialized_ && generation == generation_ && tick == tick_) {
    return;
  }
  if (!initialized_ || generation != generation_ || tick < tick_) {
    device_.clear();
    auto music = frame.value("music", nlohmann::json::array());
    for (auto &voice : music) {
      normalizePosition(voice, is2D_);
      const auto start = voice.value("startTick", tick);
      voice["frame"] =
          double(tick >= start ? tick - start : 0) *
          double(sampleRates_.contains(voice.at("assetId").get<std::string>())
                     ? sampleRates_.at(voice.at("assetId").get<std::string>())
                     : 48000) /
          60.0;
    }
    try {
      mixer_.reset(generation, tick, music);
    } catch (const std::exception &error) {
      diagnostic(error.what());
      mixer_.reset(generation, tick);
    }
  }
  generation_ = generation;
  tick_ = tick;
  initialized_ = true;
  pending_ = true;
  for (const auto &event :
       frame.value("presentationEvents", nlohmann::json::array())) {
    if (event.value("presentationType", std::string{}) != "audio") {
      continue;
    }
    try {
      auto nativeEvent = event;
      normalizePosition(nativeEvent, is2D_);
      mixer_.consume(nativeEvent);
    } catch (const std::exception &error) {
      diagnostic(error.what());
    }
  }
  if (frame.contains("camera")) {
    const auto &camera = frame.at("camera");
    if (is2D_) {
      mixer_.setListener({camera.value("x", 0.F), camera.value("y", 0.F), 0.F});
    } else if (camera.contains("position")) {
      mixer_.setListener(camera.at("position").get<std::array<float, 3>>());
    }
  }
}
std::vector<float> PlayerAudio::mixTick() {
  if (!pending_) {
    return {};
  }
  pending_ = false;
  auto pcm = mixer_.mix(800);
  device_.submit(pcm);
  return pcm;
}
nlohmann::json PlayerAudio::report() const {
  return {{"device", device_.diagnostic()},
          {"diagnostics", diagnostics_},
          {"voices", mixer_.voiceCount()},
          {"music", mixer_.musicState()}};
}
} // namespace nodetool::game
