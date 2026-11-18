#include "ai/Take.h"

#include <QJsonArray>
#include <algorithm>
#include <cmath>
#include <limits>
#include <optional>

namespace nt::ai {
namespace {
double mappingRate(const QJsonObject& mapping) {
    return mapping.value("speedBaked").toBool() ? 1.0 : std::max(0.0001, mapping.value("speedMultiplier").toDouble(1.0));
}
// Timeline ms from the start of the playing take's recorded window to the clip's
// window. The playing take is the one whose asset is current, as activeTakeIdOf on the web.
std::optional<double> playingOffsetMs(const QJsonObject& clip) {
    const auto versions = clip.value("versions").toArray();
    QJsonObject playing;
    for (const auto& value : versions) {
        if (value.toObject().value("assetId") == clip.value("currentAssetId")) { playing = value.toObject(); break; }
    }
    if (playing.isEmpty()) {
        for (const auto& value : versions) {
            if (value.toObject().value("id") == clip.value("activeTakeId")) { playing = value.toObject(); break; }
        }
    }
    const auto mapping = playing.value("sourceMapping").toObject();
    if (!mapping.value("inPointMs").isDouble() || !clip.value("inPointMs").isDouble()) { return std::nullopt; }
    return (clip.value("inPointMs").toDouble() - mapping.value("inPointMs").toDouble()) / mappingRate(mapping);
}
}
TakeResult applyTake(const QJsonObject& clip, const QString& takeId) {
    if (clip.value("mediaType").toString() == "model3d") {
        return {clip, QStringLiteral("Take application is not available for 3D clips.")};
    }
    QJsonObject take;
    for (const auto& value : clip.value("versions").toArray()) {
        const auto candidate = value.toObject();
        if (candidate.value("id").toString() == takeId) {
            take = candidate;
            break;
        }
    }
    if (take.isEmpty()) return {clip, QStringLiteral("Take not found.")};
    if (take.value("status").toString() != "success" || take.value("assetId").toString().isEmpty()) {
        return {clip, QStringLiteral("Take did not finish successfully.")};
    }
    const double duration = clip.value("durationMs").toDouble();
    const auto takeDuration = take.value("durationMs");
    if (clip.value("mediaType").toString() == "video" &&
        (!std::isfinite(duration) || duration <= 0 || !takeDuration.isDouble() || !std::isfinite(takeDuration.toDouble()) || takeDuration.toDouble() <= 0)) {
        return {clip, QStringLiteral("Take is shorter than the current cut.")};
    }
    if (take.value("source").toString() == "extended") {
        return {clip, QStringLiteral("Choose an extension mode to apply this take.")};
    }
    auto result = clip;
    result.insert("currentAssetId", take.value("assetId"));
    result.insert("activeTakeId", take.value("id"));
    result.insert("paramOverrides", take.value("paramOverridesSnapshot"));
    result.insert("lastGeneratedHash", take.value("dependencyHash"));
    result.insert("status", clip.value("dependencyHash") == take.value("dependencyHash") ? "generated" : "stale");
    const auto mapping = take.value("sourceMapping").toObject();
    bool mappingApplied = false;
    if (!mapping.isEmpty()) {
        const auto in = mapping.value("inPointMs");
        const auto out = mapping.value("outPointMs");
        const double speed = mapping.value("speedBaked").toBool() ? 1.0 : std::max(0.0001, mapping.value("speedMultiplier").toDouble(1.0));
        const auto copyMapping = [&] {
            for (const auto* field : {"inPointMs", "outPointMs", "speedMultiplier", "speedBaked"}) {
                if (mapping.contains(field)) result.insert(field, mapping.value(field));
                else result.remove(field);
            }
        };
        if (!in.isDouble() || !out.isDouble() || std::abs(out.toDouble() - in.toDouble() - duration * speed) < 1.0) {
            mappingApplied = in.isDouble() && out.isDouble();
            copyMapping();
        } else if (const auto offset = playingOffsetMs(clip); offset && *offset >= -0.5) {
            // The clip keeps its length and its offset into the take it plays now, so a
            // remix take of another length starts at its own start (F11).
            const double start = in.toDouble() + *offset * speed;
            const double limit = takeDuration.isDouble() ? takeDuration.toDouble() : std::numeric_limits<double>::infinity();
            if (start + duration * speed <= limit + 0.5) {
                mappingApplied = true;
                copyMapping();
                result.insert("inPointMs", start);
                result.insert("outPointMs", start + duration * speed);
            }
        }
    }
    if (take.value("mediaEdit").isObject()) {
        result.insert("inPointMs", 0);
        result.insert("outPointMs", duration);
        result.insert("speedMultiplier", 1);
        result.insert("speedBaked", true);
        result.remove("timeRemap");
    }
    if (clip.value("mediaType").toString() == "video") {
        if (!mappingApplied && takeDuration.toDouble() < duration) {
            return {clip, QStringLiteral("Take is shorter than the current cut.")};
        }
        if (!result.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) {
            return {clip, QStringLiteral("Bake time remapping before applying this take.")};
        }
        const double sourceIn = result.value("inPointMs").toDouble(0);
        const double rate = result.value("speedBaked").toBool() ? 1.0 : result.value("speedMultiplier").toDouble(1.0);
        const double sourceOut = result.value("outPointMs").toDouble(sourceIn + duration * rate);
        if (!std::isfinite(sourceIn) || sourceIn < 0 || !std::isfinite(rate) || rate <= 0 ||
            !std::isfinite(sourceOut) || sourceOut < sourceIn + duration * rate - 1.0 ||
            sourceOut > takeDuration.toDouble() + 0.5) {
            return {clip, QStringLiteral("Take does not cover the current source window.")};
        }
    }
    return {result, {}};
}
TakeResult renameTake(const QJsonObject& clip, const QString& takeId, const QString& label) {
    auto versions = clip.value("versions").toArray();
    for (int i = 0; i < versions.size(); ++i) {
        auto take = versions[i].toObject();
        if (take.value("id").toString() != takeId) continue;
        take.insert("label", label);
        versions.replace(i, take);
        auto result = clip;
        result.insert("versions", versions);
        return {result, {}};
    }
    return {clip, QStringLiteral("Take not found.")};
}
TakeResult deleteTake(const QJsonObject& clip, const QString& takeId) {
    auto versions = clip.value("versions").toArray();
    int index = -1;
    QString active = clip.value("activeTakeId").toString();
    const auto asset = clip.value("currentAssetId").toString();
    bool matchedAsset = false;
    bool explicitMatchesAsset = false;
    QString assetMatch;
    for (int i = 0; i < versions.size(); ++i) {
        const auto take = versions[i].toObject();
        if (take.value("id").toString() == takeId) index = i;
        if (!matchedAsset && !asset.isEmpty() && take.value("assetId").toString() == asset) {
            assetMatch = take.value("id").toString();
            matchedAsset = true;
        }
    }
    for (const auto& value : versions) {
        const auto take = value.toObject();
        if (!active.isEmpty() && take.value("id").toString() == active && !asset.isEmpty() && take.value("assetId").toString() == asset) {
            explicitMatchesAsset = true;
            break;
        }
    }
    if (matchedAsset && !explicitMatchesAsset) active = assetMatch;
    if (index < 0) return {clip, QStringLiteral("Take not found.")};
    if (active == takeId) return {clip, QStringLiteral("Select another take before deleting the active take.")};
    versions.removeAt(index);
    auto result = clip;
    result.insert("versions", versions);
    return {result, {}};
}

}
