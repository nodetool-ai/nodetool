#pragma once
#include "assets/PreparedAssets.h"
#include "audio/Audio.h"
namespace nodetool::game {
// Owned by the player simulation host thread. Device callback only reads PCM.
class PlayerAudio {
public:
  PlayerAudio(PreparedAssets &assets, const nlohmann::json &document,
              bool nullDevice);
  void consumeFrame(const nlohmann::json &frame);
  std::vector<float> mixTick();
  nlohmann::json report() const;

private:
  std::map<std::string, std::uint32_t> sampleRates_;
  AudioMixer mixer_;
  AudioDevice device_;
  std::uint64_t generation_ = 0, tick_ = 0;
  bool initialized_ = false, pending_ = false;
  bool is2D_ = false;
  nlohmann::json diagnostics_ = nlohmann::json::array();
  void diagnostic(const std::string &message);
};
} // namespace nodetool::game
