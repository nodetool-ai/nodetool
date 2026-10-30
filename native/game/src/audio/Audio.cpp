#include "Audio.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <set>
#include <stdexcept>
namespace nodetool::game {
namespace {
std::uint16_t u16(std::span<const std::uint8_t> b, std::size_t p) {
  if (p + 2 > b.size()) {
    throw std::runtime_error("Truncated WAV");
  }
  return std::uint16_t(b[p]) | (std::uint16_t(b[p + 1]) << 8);
}
std::uint32_t u32(std::span<const std::uint8_t> b, std::size_t p) {
  return std::uint32_t(u16(b, p)) | (std::uint32_t(u16(b, p + 2)) << 16);
}
bool tag(std::span<const std::uint8_t> b, std::size_t p, const char *value) {
  return p + 4 <= b.size() && std::memcmp(b.data() + p, value, 4) == 0;
}
void add16(std::vector<std::uint8_t> &b, std::uint16_t v) {
  b.push_back(v & 255);
  b.push_back(v >> 8);
}
void add32(std::vector<std::uint8_t> &b, std::uint32_t v) {
  add16(b, v & 65535);
  add16(b, v >> 16);
}
void text(std::vector<std::uint8_t> &b, const char *s) {
  b.insert(b.end(), s, s + 4);
}
float bounded(float v, float maximum = 4) {
  if (!std::isfinite(v) || v < 0 || v > maximum) {
    throw std::runtime_error("Invalid audio volume");
  }
  return v;
}
} // namespace
PcmClip decodeWave(std::span<const std::uint8_t> b) {
  if (b.size() > 64 * 1024 * 1024 || !tag(b, 0, "RIFF") || !tag(b, 8, "WAVE") ||
      u32(b, 4) != b.size() - 8) {
    throw std::runtime_error("Unsupported or malformed WAV");
  }
  std::uint16_t format = 0, channels = 0, bits = 0, align = 0;
  std::uint32_t rate = 0;
  std::span<const std::uint8_t> data;
  for (std::size_t p = 12; p + 8 <= b.size();) {
    const auto size = u32(b, p + 4);
    const auto start = p + 8;
    if (size > b.size() - start) {
      throw std::runtime_error("WAV chunk outside file");
    }
    if (tag(b, p, "fmt ")) {
      if (size < 16) {
        throw std::runtime_error("Invalid WAV format");
      }
      format = u16(b, start);
      channels = u16(b, start + 2);
      rate = u32(b, start + 4);
      align = u16(b, start + 12);
      bits = u16(b, start + 14);
    }
    if (tag(b, p, "data")) {
      if (!data.empty()) {
        throw std::runtime_error("Duplicate WAV data");
      }
      data = b.subspan(start, size);
    }
    p = start + size + (size & 1);
  }
  if ((format != 1 && format != 3) || (channels != 1 && channels != 2) ||
      rate < 8000 || rate > 192000 ||
      ((format == 1 && bits != 16) || (format == 3 && bits != 32)) ||
      align != channels * (bits / 8) || data.empty() || data.size() % align) {
    throw std::runtime_error(
        "Only mono/stereo PCM16 or float32 WAV is supported");
  }
  PcmClip result;
  result.sampleRate = rate;
  const auto frames = data.size() / align;
  result.stereo.resize(frames * 2);
  for (std::size_t i = 0; i < frames; ++i) {
    for (std::size_t c = 0; c < 2; ++c) {
      const auto p =
          i * align + std::min<std::size_t>(c, channels - 1) * (bits / 8);
      float value;
      if (format == 1) {
        value = static_cast<std::int16_t>(u16(data, p)) / 32768.0f;
      } else {
        const auto raw = u32(data, p);
        std::memcpy(&value, &raw, 4);
        if (!std::isfinite(value)) {
          throw std::runtime_error("Nonfinite audio sample");
        }
      }
      result.stereo[i * 2 + c] = std::clamp(value, -1.0f, 1.0f);
    }
  }
  return result;
}
std::vector<std::uint8_t> encodeWave(std::span<const float> stereo,
                                     std::uint32_t rate) {
  if (stereo.size() % 2 || stereo.size() > 16 * 1024 * 1024 || rate < 8000 ||
      rate > 192000) {
    throw std::runtime_error("Invalid offline WAV output");
  }
  std::vector<std::uint8_t> b;
  text(b, "RIFF");
  add32(b, 36 + stereo.size() * 2);
  text(b, "WAVE");
  text(b, "fmt ");
  add32(b, 16);
  add16(b, 1);
  add16(b, 2);
  add32(b, rate);
  add32(b, rate * 4);
  add16(b, 4);
  add16(b, 16);
  text(b, "data");
  add32(b, stereo.size() * 2);
  for (float v : stereo) {
    if (!std::isfinite(v)) {
      throw std::runtime_error("Nonfinite audio sample");
    }
    add16(b, static_cast<std::uint16_t>(static_cast<std::int16_t>(
                 std::clamp(v, -1.0f, 1.0f) * 32767)));
  }
  return b;
}
struct AudioMixer::Impl {
  struct Voice {
    std::string id, asset, bus;
    std::shared_ptr<const PcmClip> clip;
    double frame = 0;
    float volume = 1;
    bool loop = false, music = false;
    std::array<float, 3> position{};
    bool spatial = false;
  };
  struct Bus {
    float volume = 1;
    bool muted = false;
  };
  std::uint32_t rate;
  std::uint64_t generation = 0, tick = 0;
  std::map<std::string, std::shared_ptr<const PcmClip>> clips;
  std::map<std::string, Bus> buses;
  std::vector<Voice> voices;
  std::set<std::pair<std::uint64_t, std::string>> seen;
  std::array<float, 3> listener{};
};
AudioMixer::AudioMixer(std::uint32_t rate) : impl_(std::make_unique<Impl>()) {
  if (rate < 8000 || rate > 192000) {
    throw std::runtime_error("Invalid audio rate");
  }
  impl_->rate = rate;
}
AudioMixer::~AudioMixer() = default;
AudioMixer::AudioMixer(AudioMixer &&) noexcept = default;
AudioMixer &AudioMixer::operator=(AudioMixer &&) noexcept = default;
void AudioMixer::registerClip(const std::string &id,
                              std::shared_ptr<const PcmClip> clip) {
  if (id.empty() || id.size() > 128 || !clip || clip->stereo.empty() ||
      clip->stereo.size() % 2 || clip->sampleRate < 8000 ||
      clip->sampleRate > 192000 || clip->stereo.size() > 32 * 1024 * 1024) {
    throw std::runtime_error("Invalid audio clip");
  }
  for (float s : clip->stereo) {
    if (!std::isfinite(s)) {
      throw std::runtime_error("Nonfinite audio sample");
    }
  }
  if (impl_->clips.size() >= 256 && !impl_->clips.contains(id)) {
    throw std::runtime_error("Audio clip limit");
  }
  std::size_t total = clip->stereo.size();
  for (const auto &[key, other] : impl_->clips) {
    if (key != id) {
      total += other->stereo.size();
    }
  }
  if (total > 32 * 1024 * 1024) {
    throw std::runtime_error("Audio clip memory limit");
  }
  impl_->clips[id] = std::move(clip);
}
void AudioMixer::unregisterClip(const std::string &id) {
  impl_->clips.erase(id);
  std::erase_if(impl_->voices, [&](const auto &v) { return v.asset == id; });
}
void AudioMixer::setBus(const std::string &id, float volume, bool muted) {
  if (id.empty() || id.size() > 128) {
    throw std::runtime_error("Invalid audio bus");
  }
  if (impl_->buses.size() >= 32 && !impl_->buses.contains(id)) {
    throw std::runtime_error("Audio bus limit");
  }
  impl_->buses[id] = {bounded(volume), muted};
}
void AudioMixer::setListener(std::array<float, 3> position) {
  for (float v : position) {
    if (!std::isfinite(v)) {
      throw std::runtime_error("Invalid listener");
    }
  }
  impl_->listener = position;
}
bool AudioMixer::consume(const nlohmann::json &e) {
  const auto generation = e.at("generation").get<std::uint64_t>();
  const auto tick = e.at("tick").get<std::uint64_t>();
  const auto id = e.at("id").get<std::string>();
  if (id.empty() || id.size() > 128) {
    throw std::runtime_error("Invalid audio event id");
  }
  if (generation != impl_->generation || tick < impl_->tick ||
      impl_->seen.contains({tick, id})) {
    return false;
  }
  const auto kind = e.at("kind").get<std::string>();
  if (kind != "play" && kind != "stop") {
    throw std::runtime_error("Invalid audio event kind");
  }
  const auto stopTarget =
      kind == "stop" ? e.value("voiceId", id) : std::string{};
  Impl::Voice voice;
  if (kind == "play") {
    voice.id = id;
    voice.asset = e.at("assetId").get<std::string>();
    auto clip = impl_->clips.find(voice.asset);
    if (clip == impl_->clips.end()) {
      throw std::runtime_error("Audio asset unavailable");
    }
    voice.clip = clip->second;
    voice.bus = e.value("bus", std::string("sfx"));
    voice.volume = bounded(e.value("volume", 1.0f));
    voice.loop = e.value("loop", false);
    voice.music = e.value("music", false);
    if (e.contains("position")) {
      voice.position = e.at("position").get<std::array<float, 3>>();
      for (float v : voice.position) {
        if (!std::isfinite(v)) {
          throw std::runtime_error("Invalid audio position");
        }
      }
      voice.spatial = true;
    }
    if (impl_->voices.size() >= 128) {
      throw std::runtime_error("Audio voice limit");
    }
  }
  impl_->tick = tick;
  while (!impl_->seen.empty() && impl_->seen.begin()->first < tick) {
    impl_->seen.erase(impl_->seen.begin());
  }
  if (impl_->seen.size() >= 4096) {
    throw std::runtime_error("Audio event limit");
  }
  impl_->seen.insert({tick, id});
  if (kind == "stop") {
    std::erase_if(impl_->voices,
                  [&](const auto &v) { return v.id == stopTarget; });
  } else {
    std::erase_if(impl_->voices, [&](const auto &v) { return v.id == id; });
    impl_->voices.push_back(std::move(voice));
  }
  return true;
}
void AudioMixer::reset(std::uint64_t generation, std::uint64_t tick,
                       const nlohmann::json &music) {
  if (!music.is_array() || music.size() > 128) {
    throw std::runtime_error("Invalid music restore");
  }
  AudioMixer candidate(impl_->rate);
  candidate.impl_->clips = impl_->clips;
  candidate.impl_->buses = impl_->buses;
  candidate.impl_->listener = impl_->listener;
  candidate.impl_->generation = generation;
  candidate.impl_->tick = tick;
  for (const auto &entry : music) {
    auto event = entry;
    event["generation"] = generation;
    event["tick"] = tick;
    event["kind"] = "play";
    event["music"] = true;
    if (!candidate.consume(event)) {
      throw std::runtime_error("Duplicate restored music voice");
    }
    double frame = entry.value("frame", 0.0);
    auto &voice = candidate.impl_->voices.back();
    if (!std::isfinite(frame) || frame < 0) {
      throw std::runtime_error("Invalid music offset");
    }
    voice.frame = voice.loop
                      ? std::fmod(frame, voice.clip->stereo.size() / 2)
                      : std::min(frame, double(voice.clip->stereo.size() / 2));
  }
  impl_ = std::move(candidate.impl_);
}
nlohmann::json AudioMixer::musicState() const {
  nlohmann::json result = nlohmann::json::array();
  for (const auto &v : impl_->voices) {
    if (v.music) {
      nlohmann::json entry = {{"id", v.id},     {"assetId", v.asset},
                              {"bus", v.bus},   {"volume", v.volume},
                              {"loop", v.loop}, {"frame", v.frame}};
      if (v.spatial) {
        entry["position"] = v.position;
      }
      result.push_back(entry);
    }
  }
  return result;
}
std::vector<float> AudioMixer::mix(std::size_t frames) {
  if (frames > 192000) {
    throw std::runtime_error("Audio block limit");
  }
  std::vector<float> out(frames * 2);
  for (auto &v : impl_->voices) {
    float gain = v.volume;
    const auto bus = impl_->buses.find(v.bus);
    if (bus != impl_->buses.end()) {
      gain *= bus->second.muted ? 0 : bus->second.volume;
    }
    float left = 1, right = 1;
    if (v.spatial) {
      double dx = double(v.position[0]) - impl_->listener[0],
             dy = double(v.position[1]) - impl_->listener[1],
             dz = double(v.position[2]) - impl_->listener[2];
      const double distance = std::hypot(dx, dy, dz);
      const float pan = static_cast<float>(
          std::clamp(dx / std::max(distance, 1.0), -1.0, 1.0));
      left = std::sqrt((1 - pan) * 0.5f);
      right = std::sqrt((1 + pan) * 0.5f);
      gain /= std::max(1.0, distance);
    }
    const auto count = v.clip->stereo.size() / 2;
    for (std::size_t i = 0; i < frames; ++i) {
      if (v.frame >= count) {
        if (v.loop) {
          v.frame = std::fmod(v.frame, count);
        } else {
          break;
        }
      }
      const auto index = static_cast<std::size_t>(v.frame);
      const auto next =
          v.loop ? (index + 1) % count : std::min(index + 1, count - 1);
      const float fraction = v.frame - index;
      out[i * 2] += std::lerp(v.clip->stereo[index * 2],
                              v.clip->stereo[next * 2], fraction) *
                    gain * left;
      out[i * 2 + 1] += std::lerp(v.clip->stereo[index * 2 + 1],
                                  v.clip->stereo[next * 2 + 1], fraction) *
                        gain * right;
      v.frame += double(v.clip->sampleRate) / impl_->rate;
    }
  }
  std::erase_if(impl_->voices, [](const auto &v) {
    return !v.loop && v.frame >= v.clip->stereo.size() / 2;
  });
  for (auto &v : out) {
    v = std::clamp(v, -1.0f, 1.0f);
  }
  return out;
}
std::size_t AudioMixer::voiceCount() const { return impl_->voices.size(); }
} // namespace nodetool::game
