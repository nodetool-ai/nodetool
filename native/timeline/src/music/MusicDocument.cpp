#include "music/MusicDocument.h"

#include "model/TimelineTypes.h"

#include <QJsonArray>

#include <algorithm>

namespace nt::music {
namespace {
constexpr std::array<std::string_view, 17> kTonics{"C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#",
                                                   "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"};
constexpr std::array<std::string_view, 12> kRoleLabels{"Vocals", "Backing vocals", "Drums", "Bass",
                                                       "Guitar", "Keyboard", "Percussion", "Strings",
                                                       "Synth", "FX", "Brass", "Woodwinds"};
} // namespace

bool isMusicRole(std::string_view value) { return std::ranges::find(kMusicRoles, value) != kMusicRoles.end(); }

std::string_view musicRoleLabel(std::string_view role) {
    const auto it = std::ranges::find(kMusicRoles, role);
    return it == kMusicRoles.end() ? std::string_view() : kRoleLabels[static_cast<std::size_t>(it - kMusicRoles.begin())];
}

std::optional<MusicKey> tempoKey(const QJsonObject& rawSequence) {
    const auto key = rawSequence.value(u"tempo").toObject().value(u"key").toObject();
    const auto tonic = key.value(u"tonic").toString().toStdString();
    const auto mode = key.value(u"mode").toString().toStdString();
    if (std::ranges::find(kTonics, tonic) == kTonics.end() || (mode != "major" && mode != "minor")) {
        return std::nullopt;
    }
    return MusicKey{tonic, mode};
}

bool isMusicSequence(const QJsonObject& rawSequence) { return rawSequence.value(u"music").isObject(); }

QStringList promptHistory(const QJsonObject& rawSequence) {
    QStringList prompts;
    for (const auto& prompt : rawSequence.value(u"music").toObject().value(u"promptHistory").toArray()) {
        if (prompt.isString()) {
            prompts.append(prompt.toString());
        }
    }
    return prompts;
}

std::optional<std::string> trackMusicRole(const QJsonObject& rawTrack) {
    const auto role = rawTrack.value(u"musicRole").toString().toStdString();
    return isMusicRole(role) ? std::optional<std::string>(role) : std::nullopt;
}

std::optional<std::string> trackMusicRole(const Track& track) { return trackMusicRole(track.raw); }

QJsonObject musicGeneration(const QJsonObject& rawVersion) { return rawVersion.value(u"musicGeneration").toObject(); }

} // namespace nt::music
