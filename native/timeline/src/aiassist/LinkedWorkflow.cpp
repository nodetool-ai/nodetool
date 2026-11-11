#include "aiassist/LinkedWorkflow.h"
#include "aiassist/AssistDocument.h"
#include "edit/clipboard/RawDocument.h"
#include <QJsonArray>
#include <QHash>
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <map>
#include <cmath>
namespace nt::aiassist {
namespace {
QString freshId() { return QUuid::createUuid().toString(QUuid::Id128); }
QJsonObject currentTake(const QJsonObject& line) {
    const auto selected = line.value("currentTakeId").toString();
    if (selected.isEmpty()) { return {}; }
    for (const auto& value : line.value("takes").toArray()) {
        const auto take = value.toObject();
        if (take.value("id").toString() == selected) { return take; }
    }
    return {};
}
QJsonArray captionWords(const QJsonObject& take) {
    QJsonArray result;
    for (const auto& value : take.value("words").toArray()) {
        const auto word = value.toObject();
        result.append(QJsonObject{{"word", word.value("word")}, {"startMs", word.value("startMs")}, {"endMs", word.value("endMs")}});
    }
    return result;
}
QJsonObject lineClip(const QString& scriptId, const QJsonObject& line, const QJsonObject& take,
                     const QHash<QString, QJsonObject>& cast, const QString& trackId, double start) {
    const auto speaker = cast.value(line.value("speakerId").toString());
    const auto voice = line.value("voiceOverride").isObject() ? line.value("voiceOverride").toObject() : speaker.value("voice").toObject();
    const auto text = line.value("text").toString();
    const auto duration = take.value("durationMs").toDouble();
    QJsonObject clip{{"id", freshId()}, {"trackId", trackId}, {"name", text.isEmpty() ? "Line" : text.left(40)},
        {"startMs", start}, {"durationMs", duration > 0 ? duration : 3000}, {"mediaType", "audio"},
        {"sourceType", "generated"}, {"bindingKind", "text-to-audio"}, {"status", "generated"},
        {"locked", false}, {"versions", QJsonArray{}}, {"currentAssetId", take.value("assetId")},
        {"prompt", text}, {"scriptId", scriptId}, {"scriptLineId", line.value("id")}};
    for (const auto& key : {"provider", "model", "voice"}) {
        if (voice.contains(key)) { clip.insert(key, voice.value(key)); }
    }
    if (speaker.contains("name")) { clip.insert("speaker", speaker.value("name")); }
    const auto words = captionWords(take);
    if (!words.isEmpty()) { clip.insert("caption", QJsonObject{{"words", words}}); }
    return clip;
}
QJsonObject updateClip(QJsonObject clip, const QJsonObject& fresh, const QJsonObject& take) {
    for (const auto& key : {"name", "prompt", "speaker", "provider", "model", "voice"}) {
        if (fresh.contains(key)) { clip.insert(key, fresh.value(key)); } else { clip.remove(key); }
    }
    if (clip.value("currentAssetId") == take.value("assetId")) { return clip; }
    auto versions = clip.value("versions").toArray();
    QJsonObject version;
    for (const auto& candidate : versions) {
        if (candidate.toObject().value("assetId") == take.value("assetId")) { version = candidate.toObject(); break; }
    }
    if (version.isEmpty()) {
        version = {{"id", freshId()}, {"createdAt", take.value("createdAt")}, {"workflowUpdatedAt", take.value("createdAt")},
            {"jobId", ""}, {"assetId", take.value("assetId")}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{}},
            {"status", "success"}, {"durationMs", fresh.value("durationMs")}, {"source", "generated"}};
        versions.append(version);
    }
    clip.insert("currentAssetId", take.value("assetId"));
    clip.insert("activeTakeId", version.value("id"));
    clip.insert("versions", versions);
    clip.insert("durationMs", fresh.value("durationMs"));
    clip.insert("status", "generated");
    if (fresh.contains("caption")) { clip.insert("caption", fresh.value("caption")); } else { clip.remove("caption"); }
    clip.remove("inPointMs");
    clip.remove("outPointMs");
    return clip;
}
// Union occupied intervals once, then locate each new line without rescanning every clip.
void occupy(std::map<double, double>& intervals, double start, double end) {
    auto it = intervals.lower_bound(start);
    if (it != intervals.begin()) {
        auto previous = std::prev(it);
        if (previous->second >= start) { it = previous; }
    }
    while (it != intervals.end() && it->first <= end) {
        start = std::min(start, it->first);
        end = std::max(end, it->second);
        it = intervals.erase(it);
    }
    intervals.emplace(start, end);
}
double firstFree(const std::map<double, double>& intervals, double start, double duration) {
    auto it = intervals.lower_bound(start);
    if (it != intervals.begin() && std::prev(it)->second > start) { it = std::prev(it); }
    while (it != intervals.end() && it->first < start + duration) {
        if (it->second > start) { start = it->second; }
        ++it;
    }
    return start;
}
}
QJsonObject reconcileScript(QJsonObject timeline, const QJsonObject& script) {
    const auto scriptId = script.value("id").toString();
    if (scriptId.isEmpty()) { return timeline; }
    const auto document = script.value("document").toObject();
    QHash<QString, QJsonObject> cast;
    for (const auto& value : document.value("cast").toArray()) { const auto speaker = value.toObject(); cast.insert(speaker.value("id").toString(), speaker); }
    QList<QJsonObject> lines;
    QHash<QString, QJsonObject> takes;
    for (const auto& section : document.value("sections").toArray()) {
        for (const auto& value : section.toObject().value("lines").toArray()) {
            const auto line = value.toObject();
            const auto take = currentTake(line);
            if (take.value("assetId").toString().isEmpty()) { continue; }
            lines.append(line);
            takes.insert(line.value("id").toString(), take);
        }
    }
    QJsonArray clips;
    QHash<QString, qsizetype> owned;
    QString trackId;
    for (const auto& value : timeline.value("clips").toArray()) {
        auto clip = value.toObject();
        const auto lineId = clip.value("scriptLineId").toString();
        if (clip.value("scriptId").toString() == scriptId && !lineId.isEmpty()) {
            if (trackId.isEmpty()) { trackId = clip.value("trackId").toString(); }
            if (!takes.contains(lineId)) { continue; }
            owned.insert(lineId, clips.size());
        }
        clips.append(clip);
    }
    for (const auto& line : lines) {
        const auto id = line.value("id").toString();
        if (!owned.contains(id)) { continue; }
        const auto index = owned.value(id);
        const auto clip = clips.at(index).toObject();
        clips[index] = updateClip(clip, lineClip(scriptId, line, takes.value(id), cast, clip.value("trackId").toString(), clip.value("startMs").toDouble()), takes.value(id));
    }
    auto tracks = timeline.value("tracks").toArray();
    if (trackId.isEmpty() && !lines.isEmpty()) {
        trackId = freshId();
        tracks.append(QJsonObject{{"id", trackId}, {"name", "Voiceover"}, {"type", "audio"}, {"index", tracks.size()}, {"visible", true}, {"locked", false}});
    }
    std::map<double, double> occupied;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (clip.value("trackId").toString() == trackId) { const auto start = clip.value("startMs").toDouble(); occupy(occupied, start, start + clip.value("durationMs").toDouble()); }
    }
    double anchor = 0;
    for (const auto& line : lines) {
        const auto id = line.value("id").toString();
        QJsonObject clip;
        if (owned.contains(id)) { clip = clips.at(owned.value(id)).toObject(); }
        else {
            clip = lineClip(scriptId, line, takes.value(id), cast, trackId, anchor);
            const auto start = firstFree(occupied, anchor, clip.value("durationMs").toDouble());
            clip.insert("startMs", start);
            occupy(occupied, start, start + clip.value("durationMs").toDouble());
            clips.append(clip);
        }
        anchor = clip.value("startMs").toDouble() + clip.value("durationMs").toDouble() + std::max(0.0, line.value("pauseAfterMs").toDouble());
    }
    timeline.insert("tracks", tracks);
    timeline.insert("clips", clips);
    return timeline;
}
QJsonObject syncStoryboardShot(QJsonObject timeline, const QJsonObject& payload) {
    const auto assetId = payload.value("assetId").toString();
    if (assetId.isEmpty()) { return timeline; }
    auto clips = timeline.value("clips").toArray();
    QStringList boardIds;
    QSet<QString> seenBoards;
    for (const auto& value : clips) {
        const auto board = value.toObject().value("storyboardBoardId").toString();
        if (!board.isEmpty() && !seenBoards.contains(board)) { boardIds.append(board); seenBoards.insert(board); }
    }
    const auto boardId = resolveId(payload.value("boardId").toString(), boardIds);
    if (!boardId) { return timeline; }
    QStringList shotIds;
    QSet<QString> seenShots;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        const auto shot = clip.value("storyboardShotId").toString();
        if (clip.value("storyboardBoardId").toString() == *boardId && !shot.isEmpty() && !seenShots.contains(shot)) { shotIds.append(shot); seenShots.insert(shot); }
    }
    const auto shotId = resolveId(payload.value("shotId").toString(), shotIds);
    if (!shotId) { return timeline; }
    const auto locked = nt::edit::lockedUserTargetIds(nt::edit::structure::editDocument(timeline));
    const auto takeMs = payload.value("durationMs").toDouble();
    const bool knownDuration = payload.value("durationMs").isDouble() && std::isfinite(takeMs) && takeMs > 0;
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject();
        const auto element = clip.value("storyboardElementId");
        const auto media = clip.value("mediaType").toString();
        if (clip.value("storyboardBoardId").toString() != *boardId || clip.value("storyboardShotId").toString() != *shotId ||
            !clip.value("scriptLineId").toString().isEmpty() || (media != "video" && media != "audio") ||
            (!element.isUndefined() && element.toString() != "$source" && element.toString() != "$source-audio") ||
            locked.contains(clip.value("id").toString()) || clip.value("locked").toBool() || clip.value("currentAssetId").toString() == assetId) { continue; }
        clip.insert("currentAssetId", assetId);
        clip.insert("status", "generated");
        QJsonValue activeTake;
        for (const auto& value : clip.value("versions").toArray()) {
            const auto version = value.toObject();
            if (version.value("assetId").toString() == assetId) { activeTake = version.value("id"); break; }
        }
        if (activeTake.isUndefined() || activeTake.isNull()) { clip.remove("activeTakeId"); }
        else { clip.insert("activeTakeId", activeTake); }
        if (knownDuration) {
            const double rate = nt::edit::sourceRate(clip);
            const double span = clip.value("durationMs").toDouble() * rate;
            const double inPoint = clip.value("inPointMs").toDouble();
            if (inPoint + span > takeMs) {
                clip.remove("timeRemap");
                clip.insert("outPointMs", takeMs);
                if (span <= takeMs) { clip.insert("inPointMs", takeMs - span); }
                else { clip.insert("inPointMs", 0); clip.insert("durationMs", std::max(1.0, std::floor(takeMs / rate))); }
            }
        }
        clips[i] = clip;
    }
    timeline.insert("clips", clips);
    return timeline;
}
}
