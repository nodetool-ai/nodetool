#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <nlohmann/json.hpp>
#include <span>
#include <string>
#include <vector>
namespace nodetool::game {
struct PcmClip {
  std::uint32_t sampleRate = 48000;
  std::vector<float> stereo;
};
PcmClip decodeWave(std::span<const std::uint8_t> bytes);
std::vector<std::uint8_t> encodeWave(std::span<const float> stereo,
                                     std::uint32_t sampleRate = 48000);
class AudioMixer {
public:
  explicit AudioMixer(std::uint32_t sampleRate = 48000);
  ~AudioMixer();
  AudioMixer(AudioMixer &&) noexcept;
  AudioMixer &operator=(AudioMixer &&) noexcept;
  void registerClip(const std::string &id, std::shared_ptr<const PcmClip> clip);
  void unregisterClip(const std::string &id);
  void setBus(const std::string &id, float volume, bool muted = false);
  void setListener(std::array<float, 3> position);
  bool consume(const nlohmann::json &event);
  void reset(std::uint64_t generation, std::uint64_t tick,
             const nlohmann::json &music = nlohmann::json::array());
  nlohmann::json musicState() const;
  std::vector<float> mix(std::size_t frames);
  std::size_t voiceCount() const;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
class AudioDevice {
public:
  enum class Backend { Null, System };
  explicit AudioDevice(Backend backend = Backend::Null,
                       std::uint32_t sampleRate = 48000);
  ~AudioDevice();
  AudioDevice(const AudioDevice &) = delete;
  AudioDevice &operator=(const AudioDevice &) = delete;
  // Single producer. Excess samples are rejected, never block the
  // render/simulation host.
  std::size_t submit(std::span<const float> stereo);
  void clear();
  nlohmann::json diagnostic() const;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace nodetool::game
