#include "aiassist/TranscriptBeats.h"
#include "aiassist/AssistDocument.h"
#include "edit/clipboard/RawDocument.h"
#include <QHash>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <cmath>
#include <limits>
namespace nt::aiassist {
namespace {
bool transcriptClip(const QJsonObject& clip) { return clip.contains("caption") || clip.value("bindingKind").toString() == "text-to-audio"; }
QString id() { return QUuid::createUuid().toString(QUuid::Id128); }
QList<QJsonObject> timeOrder(const QJsonArray& clips) {
    QList<QJsonObject> result;
    for (const auto& value : clips) { const auto clip = value.toObject(); if (transcriptClip(clip)) { result.append(clip); } }
    std::stable_sort(result.begin(), result.end(), [](const auto& a, const auto& b) {
        const auto start = a.value("startMs").toDouble(); const auto other = b.value("startMs").toDouble();
        return start == other ? a.value("id").toString() < b.value("id").toString() : start < other;
    });
    return result;
}
class ResourceIds {
public:
    explicit ResourceIds(const QJsonObject& document) {
        for (const auto& value : document.value("clips").toArray()) {
            const auto full = value.toObject().value("id").toString();
            exact.insert(full);
            static const QRegularExpression canonicalId(QStringLiteral("^[0-9a-f]{32}$"));
            if (full.size() == 32 && canonicalId.match(full).hasMatch()) {
                const auto prefix = full.left(12);
                if (prefixes.contains(prefix)) { ambiguous.insert(prefix); }
                else { prefixes.insert(prefix, full); }
            }
        }
    }
    QString resolve(const QString& input) const {
        if (exact.contains(input)) { return input; }
        static const QRegularExpression shortId(QStringLiteral("^[0-9a-f]{12}$"));
        return input.size() == 12 && shortId.match(input).hasMatch() && !ambiguous.contains(input) ? prefixes.value(input) : QString{};
    }
private:
    QSet<QString> exact;
    QHash<QString, QString> prefixes;
    QSet<QString> ambiguous;
};
}
QJsonObject reflowTranscript(QJsonObject document, const QJsonObject& payload) {
    auto clips = document.value("clips").toArray();
    const ResourceIds resources(document);
    const auto sorted = timeOrder(clips);
    const auto previousDurations = payload.value("previousDurations").toObject();
    QHash<QString, double> offsets;
    QHash<QString, QJsonObject> byId;
    double previousEnd = 0;
    for (const auto& clip : sorted) {
        const auto clipId = clip.value("id").toString();
        const auto start = clip.value("startMs").toDouble();
        offsets.insert(clipId, start - previousEnd);
        previousEnd = start + (previousDurations.contains(clipId) ? previousDurations.value(clipId).toDouble() : clip.value("durationMs").toDouble());
        byId.insert(clipId, clip);
    }
    QList<QJsonObject> ordered;
    QSet<QString> orderedIds;
    if (payload.contains("orderedClipIds")) {
        for (const auto& value : payload.value("orderedClipIds").toArray()) {
            const auto input = value.toString();
            const auto clipId = resources.resolve(input);
            if (byId.contains(clipId)) { ordered.append(byId.value(clipId)); }
            orderedIds.insert(clipId);
        }
        for (const auto& clip : sorted) { if (!orderedIds.contains(clip.value("id").toString())) { ordered.append(clip); } }
    } else { ordered = sorted; }
    QHash<QString, QJsonObject> patched;
    double cursor = 0;
    double lastStart = 0;
    for (auto clip : ordered) {
        const auto clipId = clip.value("id").toString();
        const auto start = std::max({0.0, lastStart, cursor + offsets.value(clipId)});
        auto duration = clip.value("durationMs").toDouble();
        if (clip.value("bindingKind").toString() == "text-to-audio" && duration <= 0) { duration = 3000; }
        if (clip.value("startMs").toDouble() != start || clip.value("durationMs").toDouble() != duration) {
            clip.insert("startMs", start); clip.insert("durationMs", duration); patched.insert(clipId, clip);
        }
        lastStart = start; cursor = start + duration;
    }
    double end = 0;
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject();
        if (patched.contains(clip.value("id").toString())) { clip = patched.value(clip.value("id").toString()); clips[i] = clip; }
        end = std::max(end, clip.value("startMs").toDouble() + clip.value("durationMs").toDouble());
    }
    document.insert("clips", clips); document.insert("durationMs", end);
    return document;
}
QJsonObject addTranscriptBeat(QJsonObject document, const QJsonObject& payload) {
    auto tracks = document.value("tracks").toArray();
    const auto clips = document.value("clips").toArray();
    QSet<QString> audioTracks;
    QString firstAudio, namedVoice;
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        if (track.value("type").toString() != "audio") { continue; }
        const auto trackId = track.value("id").toString(); audioTracks.insert(trackId);
        if (firstAudio.isEmpty()) { firstAudio = trackId; }
        if (namedVoice.isEmpty() && track.value("name").toString() == "Voiceover") { namedVoice = trackId; }
    }
    QString trackId;
    double end = 0;
    for (const auto& clip : timeOrder(clips)) {
        end = std::max(end, clip.value("startMs").toDouble() + clip.value("durationMs").toDouble());
        if (audioTracks.contains(clip.value("trackId").toString())) { trackId = clip.value("trackId").toString(); }
    }
    if (trackId.isEmpty()) { trackId = namedVoice.isEmpty() ? firstAudio : namedVoice; }
    if (trackId.isEmpty()) {
        trackId = payload.value("newTrackId").toString(); if (trackId.isEmpty()) { trackId = id(); }
        tracks.append(QJsonObject{{"id", trackId}, {"name", "Voiceover"}, {"type", "audio"}, {"index", tracks.size()}, {"visible", true}, {"locked", false}});
    }
    const auto clipId = payload.value("id").toString().isEmpty() ? id() : payload.value("id").toString();
    for (const auto& value : clips) { if (value.toObject().value("id").toString() == clipId) { return document; } }
    const auto text = payload.value("text").toString();
    const auto name = text.left(30).trimmed();
    QJsonObject clip{{"id", clipId}, {"paragraphId", clipId}, {"name", name.isEmpty() ? "Voiceover" : name}, {"trackId", trackId},
        {"startMs", end}, {"durationMs", 3000}, {"mediaType", "audio"}, {"sourceType", "generated"}, {"bindingKind", "text-to-audio"},
        {"prompt", text}, {"provider", payload.value("provider").toString("openai")}, {"model", payload.value("model").toString("tts-1")},
        {"voice", payload.value("voice").toString("alloy")}, {"status", "draft"}, {"locked", false}, {"versions", QJsonArray{}}};
    auto next = clips; next.append(clip); document.insert("tracks", tracks); document.insert("clips", next);
    return reflowTranscript(document);
}
QJsonObject setTranscriptBeatText(QJsonObject document, const QJsonObject& payload) {
    if (!payload.value("text").isString()) { return document; }
    const auto clipId = ResourceIds(document).resolve(payload.value("clipId").toString());
    auto clips = document.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject();
        if (clip.value("id").toString() != clipId) { continue; }
        clip.insert("prompt", payload.value("text"));
        if (!clip.value("lastGeneratedHash").toString().isEmpty() || !clip.value("currentAssetId").toString().isEmpty()) { clip.insert("status", "stale"); }
        clips[i] = clip;
    }
    document.insert("clips", clips); return document;
}
QJsonObject deleteTranscriptParagraph(QJsonObject document, const QJsonObject& payload) {
    QSet<QString> selected;
    const ResourceIds resources(document);
    for (const auto& value : payload.value("clipIds").toArray()) {
        const auto resolved = resources.resolve(value.toString()); if (!resolved.isEmpty()) { selected.insert(resolved); }
    }
    double start = std::numeric_limits<double>::max(); double end = -1;
    for (const auto& value : document.value("clips").toArray()) {
        const auto clip = value.toObject(); if (!selected.contains(clip.value("id").toString())) { continue; }
        start = std::min(start, clip.value("startMs").toDouble()); end = std::max(end, clip.value("startMs").toDouble() + clip.value("durationMs").toDouble());
    }
    return end < 0 ? document : deleteTranscriptRange(document, {{"startMs", start}, {"endMs", end}});
}
QJsonObject applyTranscriptBeatTake(QJsonObject document, const QJsonObject& payload) {
    const auto clipId = ResourceIds(document).resolve(payload.value("clipId").toString());
    if (payload.value("assetId").toString().isEmpty() || payload.value("versionId").toString().isEmpty()) { return document; }
    const auto locked = nt::edit::lockedUserTargetIds(nt::edit::structure::editDocument(document));
    if (locked.contains(clipId)) { return document; }
    auto clips = document.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips.at(i).toObject(); if (clip.value("id").toString() != clipId || clip.value("bindingKind").toString() != "text-to-audio") { continue; }
        if (payload.contains("promptSnapshot") && clip.value("prompt") != payload.value("promptSnapshot")) { return document; }
        const auto previous = clip.value("durationMs");
        auto versions = clip.value("versions").toArray(); bool exists = false;
        for (const auto& version : versions) { if (version.toObject().value("id") == payload.value("versionId")) { exists = true; break; } }
        if (!exists) { versions.append(QJsonObject{{"id", payload.value("versionId")}, {"createdAt", payload.value("createdAt")}, {"workflowUpdatedAt", payload.value("createdAt")},
            {"assetId", payload.value("assetId")}, {"jobId", ""}, {"dependencyHash", ""}, {"paramOverridesSnapshot", QJsonObject{{"prompt", clip.value("prompt").toString().trimmed()}}}, {"status", "success"}}); }
        clip.insert("versions", versions); clip.insert("activeTakeId", payload.value("versionId")); clip.insert("currentAssetId", payload.value("assetId")); clip.insert("status", "generated");
        const auto duration = payload.value("durationMs").toDouble(); if (std::isfinite(duration) && duration > 0) { clip.insert("durationMs", duration); }
        clip.insert("caption", QJsonObject{{"words", payload.value("words").toArray()}}); clips[i] = clip; document.insert("clips", clips);
        return reflowTranscript(document, {{"previousDurations", QJsonObject{{clipId, previous}}}});
    }
    return document;
}
}
