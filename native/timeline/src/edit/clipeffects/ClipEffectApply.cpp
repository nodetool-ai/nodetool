#include "app/EditRegistry.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QSet>

namespace {
// Adds effects to several clips as one edit, so one action in the Effects panel is one undo step.
// A locked clip, a clip on a locked track, or a clip of the wrong kind keeps what it has.
QJsonObject applyClipEffects(QJsonObject raw, const QJsonObject& payload) {
    QSet<QString> lockedTracks;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("locked").toBool()) { lockedTracks.insert(track.value("id").toString()); }
    }
    const auto editable = [&](const QJsonObject& clip) {
        return !clip.value("locked").toBool() && !lockedTracks.contains(clip.value("trackId").toString());
    };
    const auto sounding = [](const QJsonObject& clip) {
        const auto type = clip.value("mediaType").toString();
        return type == "audio" || type == "midi";
    };
    auto clips = raw.value("clips").toArray();
    for (const auto& value : payload.value("visual").toArray()) {
        const auto entry = value.toObject();
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto clip = clips[i].toObject();
            if (clip.value("id") != entry.value("clipId") || !editable(clip) || sounding(clip)) { continue; }
            auto effects = clip.value("effects").toArray();
            effects.append(entry.value("effect"));
            clip.insert("effects", effects);
            clips[i] = clip;
        }
    }
    raw.insert("clips", clips);
    const auto addAudio = nt::app::findEdit("addClipAudioEffect");
    for (const auto& value : payload.value("audio").toArray()) {
        const auto entry = value.toObject();
        for (const auto& candidate : clips) {
            const auto clip = candidate.toObject();
            if (clip.value("id") == entry.value("clipId") && editable(clip) && addAudio) { raw = addAudio(raw, entry); }
        }
    }
    return raw;
}
const bool registered = nt::app::registerEdit("applyClipEffects", applyClipEffects);
}
