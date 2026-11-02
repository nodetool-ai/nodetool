#include "remix/clip/RemixEdit.h"

#include <QCryptographicHash>
#include <QStringList>

#include <cmath>

namespace nt::remix {
namespace {
constexpr double slackMs = 0.5;

int findClip(const QJsonArray& clips, const QString& id) {
    for (int i = 0; i < clips.size(); ++i) {
        if (clips.at(i).toObject().value("id").toString() == id) { return i; }
    }
    return -1;
}
QJsonObject findTrack(const QJsonObject& raw, const QString& id) {
    for (const auto& value : raw.value("tracks").toArray()) {
        if (value.toObject().value("id").toString() == id) { return value.toObject(); }
    }
    return {};
}
bool hasSpeedChange(const QJsonObject& clip) {
    const bool baked = clip.value("speedBaked").toBool();
    if (!baked && clip.contains("speedMultiplier") && std::abs(clip.value("speedMultiplier").toDouble(1.0) - 1.0) > 1e-9) { return true; }
    return !clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty();
}
QString seconds(double ms) { return QString::number(ms / 1000.0, 'f', 2) + QStringLiteral(" s"); }

// Why a clip of `durationMs` cannot take the place of `clip` on its track, or "".
QString roomRefusal(const QJsonObject& raw, const QJsonObject& clip, double durationMs, const QString& subject) {
    if (durationMs <= clip.value("durationMs").toDouble() + slackMs) { return {}; }
    const auto clips = raw.value("clips").toArray();
    const double start = clip.value("startMs").toDouble();
    const auto trackId = clip.value("trackId").toString();
    double next = std::numeric_limits<double>::infinity();
    for (const auto& value : clips) {
        const auto other = value.toObject();
        if (other.value("id") == clip.value("id") || other.value("trackId").toString() != trackId) { continue; }
        if (other.value("startMs").toDouble() >= start) { next = std::min(next, other.value("startMs").toDouble()); }
    }
    if (start + durationMs <= next + slackMs) { return {}; }
    const auto track = findTrack(raw, trackId);
    const auto name = track.value("name").toString(trackId);
    return QStringLiteral("Not enough room: %1 would be %2 long and would overlap the next clip on %3. Shorten it or move the next clip.")
        .arg(subject, seconds(durationMs), name);
}
QString lockRefusal(const QJsonObject& raw, const QJsonObject& clip) {
    if (clip.value("locked").toBool() || findTrack(raw, clip.value("trackId").toString()).value("locked").toBool()) {
        return QStringLiteral("Unlock the clip to remix it.");
    }
    return {};
}
QJsonObject versionNamed(const QJsonArray& versions, const QString& id) {
    for (const auto& value : versions) {
        if (value.toObject().value("id").toString() == id) { return value.toObject(); }
    }
    return {};
}
QString baselineId(const QString& clipId, const QString& assetId) {
    return QString::fromLatin1(QCryptographicHash::hash((clipId + QStringLiteral(":baseline:") + assetId).toUtf8(), QCryptographicHash::Sha256).toHex().left(32));
}
QString sourceKind(const QJsonObject& clip) {
    static const QStringList known{"imported", "generated", "extended", "inpainted", "object_replace", "video_to_video"};
    const auto kind = clip.value("sourceType").toString();
    return known.contains(kind) ? kind : QStringLiteral("imported");
}
}  // namespace

QJsonObject activeRemix(const QJsonObject& clip) {
    const auto active = clip.value("activeTakeId").toString();
    if (active.isEmpty()) { return {}; }
    const auto take = versionNamed(clip.value("versions").toArray(), active);
    if (take.isEmpty() || take.value("assetId").toString() != clip.value("currentAssetId").toString()) { return {}; }
    return take.value("paramOverridesSnapshot").toObject().value("remix").toObject();
}

std::optional<SourceWindow> sourceWindow(const QJsonObject& clip) {
    const auto meta = activeRemix(clip);
    if (!meta.isEmpty()) {
        const auto asset = meta.value("sourceAssetId").toString();
        const double duration = meta.value("originalDurationMs").toDouble();
        if (asset.isEmpty() || !(duration > 0)) { return std::nullopt; }
        return SourceWindow{asset, meta.value("sourceTakeId").toString(), meta.value("originalInPointMs").toDouble(0), duration};
    }
    const auto asset = clip.value("currentAssetId").toString();
    const double duration = clip.value("durationMs").toDouble();
    if (asset.isEmpty() || !(duration > 0)) { return std::nullopt; }
    const auto versions = clip.value("versions").toArray();
    QString take;
    const auto active = versionNamed(versions, clip.value("activeTakeId").toString());
    if (!active.isEmpty() && active.value("assetId").toString() == asset) {
        take = active.value("id").toString();
    } else {
        for (const auto& value : versions) {
            if (value.toObject().value("assetId").toString() == asset) { take = value.toObject().value("id").toString(); break; }
        }
    }
    return SourceWindow{asset, take, clip.value("inPointMs").toDouble(0), duration};
}

QString takeLabel(double durationMs) {
    const long long total = std::llround(durationMs / 1000.0);
    return QStringLiteral("Remix %1:%2").arg(total / 60).arg(total % 60, 2, 10, QLatin1Char('0'));
}

QString refusal(const QJsonObject& raw, const QString& clipId, double durationMs) {
    const auto clips = raw.value("clips").toArray();
    const int index = findClip(clips, clipId);
    if (index < 0) { return QStringLiteral("The clip no longer exists."); }
    const auto clip = clips.at(index).toObject();
    if (clip.value("mediaType").toString() != QStringLiteral("audio")) { return QStringLiteral("Remix works on audio clips."); }
    if (const auto locked = lockRefusal(raw, clip); !locked.isEmpty()) { return locked; }
    if (clip.value("currentAssetId").toString().isEmpty()) { return QStringLiteral("This clip has no audio to remix."); }
    if (hasSpeedChange(clip)) { return QStringLiteral("Remix does not work on clips with a speed change. Reset the speed first."); }
    if (durationMs > 0) { return roomRefusal(raw, clip, durationMs, QStringLiteral("the remix")); }
    return {};
}

QString revertRefusal(const QJsonObject& raw, const QString& clipId) {
    const auto clips = raw.value("clips").toArray();
    const int index = findClip(clips, clipId);
    if (index < 0) { return QStringLiteral("The clip no longer exists."); }
    const auto clip = clips.at(index).toObject();
    const auto meta = activeRemix(clip);
    if (meta.isEmpty()) { return QStringLiteral("This clip is not a remix."); }
    if (const auto locked = lockRefusal(raw, clip); !locked.isEmpty()) { return QStringLiteral("Unlock the clip to revert it."); }
    return roomRefusal(raw, clip, meta.value("originalDurationMs").toDouble(), QStringLiteral("the original"));
}

QJsonObject applyRemix(QJsonObject raw, const QJsonObject& payload) {
    const auto clipId = payload.value("clipId").toString();
    const auto assetId = payload.value("assetId").toString();
    const auto takeId = payload.value("takeId").toString();
    const double duration = payload.value("durationMs").toDouble();
    if (assetId.isEmpty() || takeId.isEmpty() || !std::isfinite(duration) || !(duration > 0)) { return raw; }
    auto clips = raw.value("clips").toArray();
    const int index = findClip(clips, clipId);
    if (index < 0) { return raw; }
    auto clip = clips.at(index).toObject();
    auto versions = clip.value("versions").toArray();
    if (!versionNamed(versions, takeId).isEmpty()) { return raw; }
    if (!refusal(raw, clipId, duration).isEmpty()) { return raw; }
    const auto window = sourceWindow(clip);
    if (!window) { return raw; }

    const auto previous = activeRemix(clip);
    const auto createdAt = payload.value("createdAt").toString();
    QString sourceTake = window->takeId;
    // Where the source plays when a take switch puts it back: the web only applies a take's window
    // when its span is the clip's length, so the span follows the remix.
    const auto remixedMapping = [&](QJsonObject mapping) {
        const double rate = mapping.value("speedBaked").toBool() ? 1.0 : mapping.value("speedMultiplier").toDouble(1.0);
        mapping.insert("inPointMs", window->startMs);
        mapping.insert("outPointMs", window->startMs + duration * (rate > 0 ? rate : 1.0));
        return mapping;
    };
    if (sourceTake.isEmpty()) {
        sourceTake = baselineId(clipId, window->assetId);
        QJsonObject mapping;
        for (const auto* field : {"inPointMs", "outPointMs", "speedMultiplier", "speedBaked"}) {
            if (clip.contains(field)) { mapping.insert(field, clip.value(field)); }
        }
        QJsonObject baseline{{"id", sourceTake}, {"assetId", window->assetId}, {"status", "success"}, {"createdAt", createdAt},
                             {"workflowUpdatedAt", createdAt}, {"jobId", ""}, {"dependencyHash", clip.value("dependencyHash").toString()},
                             {"paramOverridesSnapshot", clip.value("paramOverrides").toObject()}, {"source", sourceKind(clip)},
                             {"sourceMapping", remixedMapping(mapping)}};
        const double sourceDuration = payload.value("sourceDurationMs").toDouble();
        if (std::isfinite(sourceDuration) && sourceDuration > 0) { baseline.insert("durationMs", sourceDuration); }
        versions.append(baseline);
    } else {
        for (int i = 0; i < versions.size(); ++i) {
            auto version = versions.at(i).toObject();
            if (version.value("id").toString() != sourceTake) { continue; }
            version.insert("sourceMapping", remixedMapping(version.value("sourceMapping").toObject()));
            versions.replace(i, version);
            break;
        }
    }

    auto meta = payload.value("remix").toObject();
    meta.insert("version", 1);
    meta.insert("sourceAssetId", window->assetId);
    meta.insert("sourceTakeId", sourceTake);
    meta.insert("originalDurationMs", window->durationMs);
    const auto original = previous.isEmpty() ? clip : previous;
    const bool fromRemix = !previous.isEmpty();
    for (const auto* field : {"InPointMs", "OutPointMs"}) {
        const QString key = QStringLiteral("original") + field;
        const QString clipKey = QString::fromLatin1(field).replace(0, 1, QString::fromLatin1(field).at(0).toLower());
        if (fromRemix ? original.contains(key) : original.contains(clipKey)) {
            meta.insert(key, fromRemix ? original.value(key) : original.value(clipKey));
        }
    }
    // The web copies a take's snapshot onto the clip when the take is chosen, so it keeps the clip's own overrides.
    auto snapshot = clip.value("paramOverrides").toObject();
    snapshot.insert("remix", meta);
    QJsonObject take{{"id", takeId}, {"assetId", assetId}, {"status", "success"}, {"createdAt", createdAt}, {"workflowUpdatedAt", createdAt},
                     {"jobId", ""}, {"dependencyHash", clip.value("dependencyHash").toString()},
                     {"paramOverridesSnapshot", snapshot}, {"durationMs", duration}, {"source", "imported"},
                     {"label", takeLabel(duration)}, {"parentTakeId", sourceTake},
                     {"sourceMapping", QJsonObject{{"inPointMs", 0}, {"outPointMs", duration}}}};
    versions.append(take);

    clip.insert("versions", versions);
    clip.insert("currentAssetId", assetId);
    clip.insert("activeTakeId", takeId);
    clip.insert("durationMs", duration);
    clip.insert("inPointMs", 0);
    clip.insert("outPointMs", duration);
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}

QJsonObject revertRemix(QJsonObject raw, const QJsonObject& payload) {
    const auto clipId = payload.value("clipId").toString();
    if (!revertRefusal(raw, clipId).isEmpty()) { return raw; }
    auto clips = raw.value("clips").toArray();
    const int index = findClip(clips, clipId);
    auto clip = clips.at(index).toObject();
    const auto meta = activeRemix(clip);
    clip.insert("currentAssetId", meta.value("sourceAssetId"));
    clip.insert("durationMs", meta.value("originalDurationMs"));
    if (clip.value("paramOverrides").toObject().contains("remix")) {
        auto overrides = clip.value("paramOverrides").toObject();
        overrides.remove("remix");
        clip.insert("paramOverrides", overrides);
    }
    if (!meta.value("sourceTakeId").toString().isEmpty()) { clip.insert("activeTakeId", meta.value("sourceTakeId")); }
    else { clip.remove("activeTakeId"); }
    for (const auto* field : {"InPointMs", "OutPointMs"}) {
        const QString key = QStringLiteral("original") + field;
        const QString clipKey = QString::fromLatin1(field).replace(0, 1, QString::fromLatin1(field).at(0).toLower());
        if (meta.contains(key)) { clip.insert(clipKey, meta.value(key)); } else { clip.remove(clipKey); }
    }
    clips.replace(index, clip);
    raw.insert("clips", clips);
    return raw;
}
}  // namespace nt::remix
