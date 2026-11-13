#pragma once
#include "nodetool/realtime/offline.h"
#include "nodetool/realtime/audio.h"
#include <cstddef>

namespace nt::realtime {
// Offline host thread only. Owns prepared file payloads until transferred to
// the audio executor or synchronously uploaded to private GPU textures.
struct OfflineSlots {
    std::vector<AudioBufferSlot> audio;
    std::unordered_map<std::string, std::vector<std::byte>> textures;
};
OfflineSlots loadOfflineSlots(const Plan& plan, std::span<const OfflineSlotFile> files);
}
