#include "music/MusicEdits.h"

#include "app/EditRegistry.h"
#include "music/MusicTime.h"

#include <QCryptographicHash>
#include <QJsonArray>
#include <QSet>

#include <cmath>

namespace nt::music {
namespace {

QString hashId(const QString& text) {
    return QString::fromLatin1(QCryptographicHash::hash(text.toUtf8(), QCryptographicHash::Sha256).toHex().left(32));
}

QJsonObject findTrack(const QJsonObject& raw, const QString& trackId) {
    for (const auto& value : raw.value(u"tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value(u"id").toString() == trackId) {
            return track;
        }
    }
    return {};
}

int clipIndex(const QJsonArray& clips, const QString& clipId) {
    for (qsizetype i = 0; i < clips.size(); ++i) {
        if (clips[i].toObject().value(u"id").toString() == clipId) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

// The placeholder rules: an unlocked audio track and an empty range on it.
bool canPlace(const QJsonObject& raw, const QJsonObject& clip) {
    const auto clipId = clip.value(u"id").toString();
    const auto trackId = clip.value(u"trackId").toString();
    const double start = clip.value(u"startMs").toDouble(std::nan(""));
    const double duration = clip.value(u"durationMs").toDouble(std::nan(""));
    if (clipId.isEmpty() || !std::isfinite(start) || start < 0 || !std::isfinite(duration) || duration <= 0) {
        return false;
    }
    const auto track = findTrack(raw, trackId);
    if (track.isEmpty() || track.value(u"type").toString() != u"audio" || track.value(u"locked").toBool()) {
        return false;
    }
    const auto clips = raw.value(u"clips").toArray();
    if (clipIndex(clips, clipId) >= 0) {
        return false;
    }
    for (const auto& value : clips) {
        const auto other = value.toObject();
        if (other.value(u"trackId").toString() != trackId || other.value(u"mediaType").toString() != u"audio") {
            continue;
        }
        const double otherStart = other.value(u"startMs").toDouble();
        const double otherEnd = otherStart + other.value(u"durationMs").toDouble();
        if (otherStart < start + duration && otherEnd > start) {
            return false;
        }
    }
    return true;
}

bool clipLocked(const QJsonObject& raw, const QJsonObject& clip) {
    if (clip.value(u"locked").toBool()) {
        return true;
    }
    const auto track = findTrack(raw, clip.value(u"trackId").toString());
    return track.isEmpty() || track.value(u"locked").toBool();
}

}  // namespace

QString musicTakeId(const QString& requestId, const QString& assetId) {
    return hashId(requestId + QStringLiteral(":music-take:") + assetId);
}

QJsonObject placeholderClip(const QString& clipId, const QString& trackId, std::int64_t startFrame, std::int64_t endFrame,
                            const QString& prompt, const QString& provider, const QString& model) {
    const double durationMs = frameToMs(endFrame - startFrame);
    return QJsonObject{{"id", clipId},
                       {"trackId", trackId},
                       {"name", prompt.trimmed().left(40)},
                       {"startMs", frameToMs(startFrame)},
                       {"durationMs", durationMs},
                       {"inPointMs", 0},
                       {"outPointMs", durationMs},
                       {"mediaType", "audio"},
                       {"sourceType", "generated"},
                       {"bindingKind", "text-to-music"},
                       {"prompt", prompt.trimmed()},
                       {"provider", provider},
                       {"model", model},
                       {"audioRole", "music"},
                       {"fadeInMs", kPlaceholderFadeMs},
                       {"fadeOutMs", kPlaceholderFadeMs},
                       {"status", "queued"},
                       {"locked", false},
                       {"versions", QJsonArray{}}};
}

QJsonObject insertPlaceholder(QJsonObject raw, const QJsonObject& payload) {
    const auto clip = payload.value(u"clip").toObject();
    if (clip.value(u"mediaType").toString() != u"audio" || !canPlace(raw, clip)) {
        return raw;
    }
    auto clips = raw.value(u"clips").toArray();
    clips.append(clip);
    raw.insert("clips", clips);
    return raw;
}

QJsonObject applyResult(QJsonObject raw, const QJsonObject& payload) {
    const auto task = payload.value(u"task").toString();
    const bool repaint = task == u"repaint";
    if (!repaint && task != u"text2music" && task != u"lego") {
        return raw;
    }
    const auto clipId = payload.value(u"clipId").toString();
    const auto takes = payload.value(u"takes").toArray();
    const auto requestId = payload.value(u"requestId").toString();
    if (clipId.isEmpty() || takes.isEmpty() || requestId.isEmpty()) {
        return raw;
    }
    auto clips = raw.value(u"clips").toArray();
    int index = clipIndex(clips, clipId);
    if (index < 0) {
        const auto insert = payload.value(u"insertClip").toObject();
        if (repaint || insert.value(u"id").toString() != clipId || insert.value(u"mediaType").toString() != u"audio" ||
            !canPlace(raw, insert)) {
            return raw;
        }
        clips.append(insert);
        index = static_cast<int>(clips.size() - 1);
    }
    auto clip = clips[index].toObject();
    if (clipLocked(raw, clip) || clip.value(u"mediaType").toString() != u"audio") {
        return raw;
    }
    const auto createdAt = payload.value(u"createdAt").toString();
    auto versions = clip.value(u"versions").toArray();
    QSet<QString> heldAssets;
    for (const auto& value : versions) {
        heldAssets.insert(value.toObject().value(u"assetId").toString());
    }

    QString parentTakeId;
    if (repaint) {
        const auto current = clip.value(u"currentAssetId").toString();
        if (current.isEmpty()) {
            return raw;
        }
        for (const auto& value : versions) {
            const auto version = value.toObject();
            if (version.value(u"assetId").toString() == current) {
                parentTakeId = version.value(u"id").toString();
                break;
            }
        }
        if (parentTakeId.isEmpty()) {
            // The original becomes a take, with no source mapping (MD14).
            parentTakeId = hashId(clipId + QStringLiteral(":baseline:") + current);
            versions.append(QJsonObject{{"id", parentTakeId},
                                        {"assetId", current},
                                        {"status", "success"},
                                        {"createdAt", createdAt},
                                        {"workflowUpdatedAt", createdAt},
                                        {"jobId", ""},
                                        {"dependencyHash", clip.value(u"dependencyHash").toString()},
                                        {"paramOverridesSnapshot", clip.value(u"paramOverrides").toObject()},
                                        {"label", "Original"},
                                        {"source", clip.value(u"sourceType").toString() == u"imported"
                                                       ? QStringLiteral("imported") : QStringLiteral("generated")}});
            heldAssets.insert(current);
        }
    }

    const auto provider = payload.value(u"provider").toString();
    const auto model = payload.value(u"model").toString();
    const auto prompt = payload.value(u"prompt").toString();
    const auto jobId = payload.value(u"jobId").toString(requestId);
    QString activeTakeId;
    QString activeAssetId;
    for (const auto& value : takes) {
        const auto take = value.toObject();
        const auto assetId = take.value(u"assetId").toString();
        if (assetId.isEmpty()) {
            return raw;
        }
        if (heldAssets.contains(assetId)) {
            continue;
        }
        const auto record = take.value(u"record").toObject();
        QJsonObject version{{"id", musicTakeId(requestId, assetId)},
                            {"assetId", assetId},
                            {"status", "success"},
                            {"createdAt", createdAt},
                            {"workflowUpdatedAt", createdAt},
                            {"jobId", requestId},
                            {"dependencyHash", ""},
                            {"paramOverridesSnapshot",
                             QJsonObject{{"prompt", prompt}, {"provider", provider}, {"model", model}}},
                            {"provider", provider},
                            {"model", model},
                            {"prompt", prompt},
                            {"requestId", requestId},
                            {"batchId", jobId},
                            {"source", "generated"},
                            {"label", QStringLiteral("Take %1").arg(versions.size() + 1)},
                            {"musicGeneration", record}};
        if (!repaint) {
            const auto start = record.value(u"targetStartFrame");
            const auto end = record.value(u"targetEndFrame");
            if (start.isDouble() && end.isDouble() && end.toDouble() > start.toDouble()) {
                version.insert("durationMs", (end.toDouble() - start.toDouble()) / (static_cast<double>(kSampleRate) / 1000));
            }
        } else {
            version.insert("parentTakeId", parentTakeId);
        }
        versions.append(version);
        heldAssets.insert(assetId);
        if (activeTakeId.isEmpty()) {
            activeTakeId = version.value(u"id").toString();
            activeAssetId = assetId;
        }
    }
    if (activeTakeId.isEmpty()) {
        // Every take is already on the clip: a repeated placement.
        return raw;
    }
    clip.insert("versions", versions);
    clip.insert("currentAssetId", activeAssetId);
    clip.insert("activeTakeId", activeTakeId);
    if (!repaint) {
        clip.insert("status", "generated");
    }
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}

namespace {
const bool placeholderRegistered = nt::app::registerEdit("music.insertPlaceholder", insertPlaceholder);
const bool resultRegistered = nt::app::registerEdit("music.applyResult", applyResult);
}  // namespace

}  // namespace nt::music
