#include "music/MusicProject.h"

#include "music/MusicDocument.h"

#include <QJsonArray>

#include <algorithm>

namespace nt::music {

MusicProjectSettings musicProjectSettings(const QVariantMap& values) {
    MusicProjectSettings settings;
    settings.bpm = values.value(QStringLiteral("bpm"), 120).toDouble();
    settings.beatsPerBar = values.value(QStringLiteral("beatsPerBar"), 4).toInt();
    settings.beatUnit = values.value(QStringLiteral("beatUnit"), 4).toInt();
    const auto tonic = values.value(QStringLiteral("keyTonic")).toString();
    if (!tonic.isEmpty()) {
        settings.key = MusicKey{tonic.toStdString(), values.value(QStringLiteral("keyMode"), QStringLiteral("major")).toString().toStdString()};
    }
    return settings;
}

QString musicProjectRefusal(const MusicProjectSettings& settings) {
    const auto tempo = musicTempoRefusal({settings.bpm, 0, double(settings.beatsPerBar), double(settings.beatUnit)});
    if (!tempo.empty()) {
        return QString::fromStdString(tempo);
    }
    if (settings.key) {
        const bool tonic = std::ranges::find(kMusicKeyTonics, settings.key->tonic) != kMusicKeyTonics.end();
        if (!tonic || (settings.key->mode != "major" && settings.key->mode != "minor")) {
            return QStringLiteral("Choose a key from the list, or no key.");
        }
    }
    return {};
}

QJsonObject musicProjectDocument(const MusicProjectSettings& settings, const std::function<QString()>& newId) {
    QJsonArray tracks;
    for (const auto role : kDefaultMusicTrackRoles) {
        const auto name = musicRoleLabel(role);
        tracks.append(QJsonObject{{"id", newId()},
                                  {"name", QString::fromUtf8(name.data(), qsizetype(name.size()))},
                                  {"type", "audio"},
                                  {"index", tracks.size()},
                                  {"visible", true},
                                  {"locked", false},
                                  {"muted", false},
                                  {"solo", false},
                                  {"musicRole", QString::fromUtf8(role.data(), qsizetype(role.size()))}});
    }
    QJsonObject tempo{{"bpm", settings.bpm},
                      {"offsetMs", 0},
                      {"timeSignature", QJsonObject{{"beatsPerBar", settings.beatsPerBar}, {"beatUnit", settings.beatUnit}}}};
    if (settings.key) {
        tempo.insert("key", QJsonObject{{"tonic", QString::fromStdString(settings.key->tonic)},
                                        {"mode", QString::fromStdString(settings.key->mode)}});
    }
    return {{"tracks", tracks},
            {"clips", QJsonArray{}},
            {"markers", QJsonArray{}},
            {"tempo", tempo},
            {"music", QJsonObject{{"promptHistory", QJsonArray{}}}}};
}

QJsonObject setTrackRole(QJsonObject document, const QJsonObject& payload) {
    const auto trackId = payload.value(u"trackId").toString();
    const auto role = payload.value(u"role").toString();
    if (!role.isEmpty() && !isMusicRole(role.toStdString())) {
        return document;
    }
    auto tracks = document.value(u"tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) {
            continue;
        }
        if (track.value(u"type").toString() != u"audio") {
            return document;
        }
        if (role.isEmpty()) {
            track.remove(QStringLiteral("musicRole"));
        } else {
            track.insert(QStringLiteral("musicRole"), role);
        }
        tracks[i] = track;
        document.insert(QStringLiteral("tracks"), tracks);
        return document;
    }
    return document;
}

QJsonObject setTempoKey(QJsonObject document, const QJsonObject& payload) {
    if (!document.value(u"tempo").isObject()) {
        return document;
    }
    auto tempo = document.value(u"tempo").toObject();
    const auto tonic = payload.value(u"tonic").toString();
    if (tonic.isEmpty()) {
        if (!tempo.contains(u"key")) {
            return document;
        }
        tempo.remove(QStringLiteral("key"));
    } else {
        const auto mode = payload.value(u"mode").toString();
        const bool known = std::ranges::find(kMusicKeyTonics, tonic.toStdString()) != kMusicKeyTonics.end();
        if (!known || (mode != u"major" && mode != u"minor")) {
            return document;
        }
        const QJsonObject key{{"tonic", tonic}, {"mode", mode}};
        if (tempo.value(u"key").toObject() == key) {
            return document;
        }
        tempo.insert(QStringLiteral("key"), key);
    }
    document.insert(QStringLiteral("tempo"), tempo);
    return document;
}

} // namespace nt::music
