#include "audio/Audio.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
namespace {
void require(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
void rejected(const auto &call) {
  bool failed = false;
  try {
    call();
  } catch (const std::exception &) {
    failed = true;
  }
  require(failed, "invalid input accepted");
}
nlohmann::json event(const char *id = "tone", std::uint64_t generation = 1,
                     std::uint64_t tick = 0) {
  return {{"id", id},       {"generation", generation}, {"tick", tick},
          {"kind", "play"}, {"assetId", "tone"},        {"volume", 0.5}};
}
} // namespace
int main() {
  try {
    auto clip = std::make_shared<PcmClip>();
    clip->stereo.assign(480 * 2, 0.5f);
    const auto wav = encodeWave(clip->stereo);
    auto decoded = decodeWave(wav);
    require(decoded.stereo.size() == clip->stereo.size(), "WAV frame count");
    require(std::abs(decoded.stereo[0] - 0.5f) < 0.001, "WAV roundtrip");
    rejected([&] {
      auto b = wav;
      b[4] = 0;
      decodeWave(b);
    });
    AudioMixer mixer;
    mixer.registerClip("tone", clip);
    mixer.reset(1, 0);
    require(mixer.consume(event()), "play failed");
    require(!mixer.consume(event()), "duplicate replayed");
    auto pcm = mixer.mix(240);
    require(std::abs(pcm[0] - 0.25f) < 0.001, "gain incorrect");
    mixer.setBus("sfx", 1, true);
    require(mixer.mix(240)[0] == 0, "mute failed");
    require(mixer.voiceCount() == 0, "finished voice retained");
    mixer.setBus("sfx", 1);
    auto spatial = event("spatial", 1, 1);
    spatial["position"] = {1, 0, 0};
    mixer.consume(spatial);
    pcm = mixer.mix(1);
    require(pcm[0] == 0 && pcm[1] > 0, "spatial pan incorrect");
    mixer.reset(2, 10);
    require(!mixer.consume(event("old", 1, 11)), "old generation replayed");
    require(!mixer.consume(event("old", 2, 9)), "stale event replayed");
    require(mixer.voiceCount() == 0, "restore retained one-shot");
    auto music = event("music", 2, 10);
    music["music"] = true;
    music["loop"] = true;
    mixer.consume(music);
    mixer.mix(700);
    auto saved = mixer.musicState();
    AudioMixer restored;
    restored.registerClip("tone", clip);
    restored.reset(3, 10, saved);
    require(mixer.mix(32) == restored.mix(32), "music continuation mismatch");
    require(restored.voiceCount() == 1, "music lost");
    rejected([&] {
      auto invalid = event("bad", 3, 10);
      invalid["volume"] = -1;
      restored.consume(invalid);
    });
    require(restored.voiceCount() == 1, "invalid command changed state");
    rejected([&] { restored.mix(192001); });
    mixer.reset(8, 0);
    mixer.setListener({-3e38f, 0, 0});
    auto largePosition = event("large", 8, 0);
    largePosition["position"] = {3e38f, 0, 0};
    mixer.consume(largePosition);
    require(std::isfinite(mixer.mix(1)[0]), "large position produced NaN");
    AudioDevice device;
    require(device.diagnostic().at("available") == true, "null device missing");
    require(device.submit(pcm) == pcm.size() / 2, "null submit");
    AudioDevice invalid(AudioDevice::Backend::System, 1);
    require(invalid.diagnostic().at("available") == false,
            "invalid device accepted");
    for (int i = 0; i < 100; ++i) {
      AudioMixer repeated;
      repeated.registerClip("tone", clip);
      repeated.reset(1, 0);
      repeated.consume(event());
      repeated.mix(16);
      repeated.unregisterClip("tone");
      require(repeated.voiceCount() == 0, "unload leaked voice");
    }
    std::cout << "audio tests passed\n";
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
