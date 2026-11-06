#include "aiassist/ShotPlacement.h"
#include "aiassist/AssistDocument.h"
#include "aiassist/StoryboardAssembly.h"
#include "edit/clipboard/RawDocument.h"
#include <QUuid>
#include <QSet>
#include <cmath>
namespace nt::aiassist {
namespace {
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QJsonObject makeTrack(const QString& type, const QString& name, qsizetype index) {
    return {{"id", id()}, {"name", name}, {"type", type}, {"index", static_cast<int>(index)}, {"visible", true}, {"locked", false}};
}
}
ShotPlacementResult placeStoryboardShot(const QJsonObject& timeline, const QJsonObject& board, const QString& shotId,
                                       double startMs, const QString& targetTrackId, const QString& dropMode) {
    ShotPlacementResult result{timeline, {}, {}, {}};
    if (!std::isfinite(startMs) || startMs < 0 || (dropMode != "overlap" && dropMode != "overwrite" && dropMode != "insert")) {
        result.error = "Choose a valid placement time and drop mode."; return result;
    }
    const auto shots = board.value("document").toObject().value("shots").toArray();
    QStringList ids; for (const auto& value : shots) { ids.append(value.toObject().value("id").toString()); }
    const auto resolved = resolveId(shotId, ids);
    if (!resolved) { result.error = "The storyboard shot is missing or ambiguous."; return result; }
    const auto built = assembleStoryboard({}, board);
    if (!built.error.isEmpty()) { result.error = built.error; return result; }
    QJsonObject picture;
    for (const auto& value : built.document.value("clips").toArray()) {
        const auto clip = value.toObject(); const auto type = clip.value("mediaType").toString();
        if (clip.value("storyboardShotId").toString() == *resolved && (type == "video" || type == "image")) { picture = clip; break; }
    }
    if (picture.isEmpty() || picture.value("currentAssetId").toString().isEmpty()) { result.error = "This shot has no persisted still or video to place."; return result; }
    auto tracks = timeline.value("tracks").toArray(); QString trackId;
    if (!targetTrackId.isEmpty()) {
        QStringList trackIds; for (const auto& value : tracks) { trackIds.append(value.toObject().value("id").toString()); }
        const auto selected = resolveId(targetTrackId, trackIds);
        if (!selected) { result.error = "The target track is missing or ambiguous."; return result; }
        for (const auto& value : tracks) {
            const auto track = value.toObject();
            if (track.value("id").toString() == *selected && track.value("type") == "video" && !track.value("locked").toBool()) { trackId = *selected; break; }
        }
        if (trackId.isEmpty()) { result.error = "Choose an unlocked video track."; return result; }
    } else {
        for (const auto& value : tracks) { const auto track = value.toObject(); if (track.value("type") == "video" && !track.value("locked").toBool()) { trackId = track.value("id").toString(); break; } }
        if (trackId.isEmpty()) { const auto track = makeTrack("video", QString("video %1").arg(tracks.size()+1), tracks.size()); trackId = track.value("id").toString(); tracks.append(track); }
    }
    QString name;
    for (const auto& value : shots) { const auto shot = value.toObject(); if (shot.value("id").toString() == *resolved) { name = shot.value("slug").toString().trimmed(); if (name.isEmpty()) { name = QString("Shot %1").arg(shot.value("index").toInt()+1); } break; } }
    picture.insert("name", name); picture.insert("trackId", trackId); picture.insert("startMs", std::round(startMs));
    result.clipId = picture.value("id").toString();
    auto clips = timeline.value("clips").toArray(); QJsonArray inserted{picture};
    if (picture.value("mediaType") == "video") {
        QString audioTrackId; const double end = std::round(startMs) + picture.value("durationMs").toDouble();
        for (const auto& value : tracks) {
            const auto track = value.toObject(); if (track.value("type") != "audio" || track.value("locked").toBool()) { continue; }
            bool free = true;
            for (const auto& value : clips) { const auto clip = value.toObject(); const double start = clip.value("startMs").toDouble(); if (clip.value("trackId") == track.value("id") && start < end && start + clip.value("durationMs").toDouble() > std::round(startMs)) { free = false; break; } }
            if (free) { audioTrackId = track.value("id").toString(); break; }
        }
        if (audioTrackId.isEmpty()) { const auto track = makeTrack("audio", "Audio", tracks.size()); audioTrackId = track.value("id").toString(); tracks.append(track); }
        auto audio = picture; audio.insert("id", id()); audio.insert("trackId", audioTrackId); audio.insert("mediaType", "audio"); audio.insert("name", name + " (audio)"); inserted.append(audio);
    }
    for (const auto& value : inserted) { clips.append(value); }
    auto next = timeline; next.insert("tracks", tracks); next.insert("clips", clips);
    try {
        const auto resolvedClips = nt::edit::resolveDropAction(nt::edit::structure::editDocument(next), {result.clipId}, dropMode);
        next.insert("clips", nt::edit::structure::clipsToJson(resolvedClips));
    } catch (const nt::edit::OpError& error) { result.error = QString::fromUtf8(error.what()); return result; }
    QSet<QString> insertedIds; for (const auto& value : inserted) { insertedIds.insert(value.toObject().value("id").toString()); }
    for (const auto& value : next.value("clips").toArray()) { if (insertedIds.contains(value.toObject().value("id").toString())) { result.addedClips.append(value); } }
    result.document = next; return result;
}
}
