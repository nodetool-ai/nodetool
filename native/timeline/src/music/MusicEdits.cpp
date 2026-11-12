#include "music/MusicEdits.h"

#include "ai/Take.h"
#include "app/EditRegistry.h"
#include "music/MusicRange.h"
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

    // Take labels: a letter per candidate, and a number per segment when the
    // window gave several ("Take A", "Take B2"); a repaint names its bars
    // ("Repaint A · bars 3–4").
    bool segmented = false;
    for (const auto& value : takes) {
        segmented = segmented || value.toObject().value(u"segment").toInt() > 0;
    }
    const auto tempo = sequenceTempo(raw);
    const auto takeLabel = [&](const QJsonObject& take) {
        const auto candidate = take.value(u"candidate").toInt();
        const QString letter = candidate >= 0 && candidate < 26 ? QString(QChar(u'A' + candidate)) : QString::number(candidate + 1);
        if (repaint) {
            const auto record = take.value(u"record").toObject();
            const FrameRange range{record.value(u"targetStartFrame").toInteger(), record.value(u"targetEndFrame").toInteger()};
            if (!tempo || range.endFrame <= range.startFrame) {
                return QStringLiteral("Repaint ") + letter;
            }
            auto bars = barRangeLabel(range, *tempo);
            bars[0] = bars[0].toLower();
            return QStringLiteral("Repaint %1 · %2").arg(letter, bars);
        }
        return QStringLiteral("Take ") + letter + (segmented ? QString::number(take.value(u"segment").toInt() + 1) : QString());
    };

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
                            {"label", takeLabel(take)},
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

QJsonObject recordPrompt(QJsonObject raw, const QJsonObject& payload) {
    const auto prompt = payload.value(u"prompt").toString().trimmed();
    if (prompt.isEmpty() || !raw.value(u"music").isObject()) {
        return raw;
    }
    auto music = raw.value(u"music").toObject();
    const auto history = music.value(u"promptHistory").toArray();
    if (!history.isEmpty() && history.first().toString() == prompt) {
        return raw;
    }
    QJsonArray next{prompt};
    for (const auto& value : history) {
        if (next.size() >= kPromptHistoryCap) {
            break;
        }
        if (value.isString() && value.toString() != prompt) {
            next.append(value);
        }
    }
    music.insert("promptHistory", next);
    raw.insert("music", music);
    return raw;
}

namespace {

// Applies `change` to the unlocked clip `payload.clipId`; the document is unchanged on a refusal.
template <typename Change>
QJsonObject changeTake(QJsonObject raw, const QJsonObject& payload, Change change) {
    auto clips = raw.value(u"clips").toArray();
    const int index = clipIndex(clips, payload.value(u"clipId").toString());
    const auto takeId = payload.value(u"takeId").toString();
    if (index < 0 || takeId.isEmpty()) {
        return raw;
    }
    const auto clip = clips[index].toObject();
    if (clipLocked(raw, clip)) {
        return raw;
    }
    const auto result = change(clip, takeId);
    if (!result.error.isEmpty()) {
        return raw;
    }
    clips.replace(index, result.clip);
    raw.insert("clips", clips);
    return raw;
}

}  // namespace

QJsonObject selectTake(QJsonObject raw, const QJsonObject& payload) {
    return changeTake(std::move(raw), payload, [](const QJsonObject& clip, const QString& takeId) {
        auto result = nt::ai::applyTake(clip, takeId);
        if (result.error.isEmpty()) {
            if (clip.contains(u"status")) {
                result.clip.insert("status", clip.value(u"status"));
            } else {
                result.clip.remove(QStringLiteral("status"));
            }
        }
        return result;
    });
}

QJsonObject deleteTake(QJsonObject raw, const QJsonObject& payload) {
    return changeTake(std::move(raw), payload, nt::ai::deleteTake);
}

namespace {
const bool placeholderRegistered = nt::app::registerEdit("music.insertPlaceholder", insertPlaceholder);
const bool resultRegistered = nt::app::registerEdit("music.applyResult", applyResult);
const bool promptRegistered = nt::app::registerEdit("music.recordPrompt", recordPrompt);
const bool selectRegistered = nt::app::registerEdit("music.selectTake", selectTake);
const bool deleteRegistered = nt::app::registerEdit("music.deleteTake", deleteTake);
}  // namespace

}  // namespace nt::music
