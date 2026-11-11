#include "assets/AssetClip.h"
#include "edit/ClipOps.h"
#include <QJsonArray>
#include <cmath>

namespace nt::assets {
QString assetMediaType(const QJsonObject& asset) {
    const auto type = asset.value("content_type").toString();
    const auto name = asset.value("name").toString().toLower();
    if (type.toLower().startsWith("model/") || name.endsWith(".glb") || name.endsWith(".gltf")) {
        return "model3d";
    }
    for (const auto& kind : {QStringLiteral("image"), QStringLiteral("video"), QStringLiteral("audio")}) {
        if (type.startsWith(kind + '/')) { return kind; }
    }
    return {};
}

std::optional<QJsonObject> assetToClip(const QJsonObject& asset, const QString& trackId, double startMs) {
    const auto type = assetMediaType(asset);
    if (type.isEmpty()) { return std::nullopt; }
    const auto duration = asset.value("duration");
    const double durationMs = type == "model3d" || duration.isNull() || duration.isUndefined()
        ? 4000 : std::floor(duration.toDouble() * 1000 + 0.5);
    QJsonObject clip{{"id", nt::edit::newId()}, {"trackId", trackId}, {"name", asset.value("name")},
        {"startMs", startMs}, {"durationMs", durationMs}, {"mediaType", type}, {"sourceType", "imported"},
        {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}, {"currentAssetId", asset.value("id")}};
    if (type == "video") {
        const auto thumbnails = asset.value("metadata").toObject().value("thumbnails").toArray();
        if (!thumbnails.isEmpty() && !thumbnails.first().toString().isEmpty()) {
            clip.insert("thumbnailAssetId", thumbnails.first());
        }
    }
    if (type == "model3d") {
        clip.insert("model3dStyle", QJsonObject{
            {"camera", QJsonObject{{"mode", "orbit"}, {"azimuthDeg", 45}, {"elevationDeg", 25}, {"fovDeg", 35}, {"zoom", 1}}},
            {"animation", QJsonObject{{"loop", true}, {"speed", 1}}}, {"lighting", "studio"},
            {"lightIntensity", 1}, {"background", QJsonObject{{"transparent", true}}}});
    }
    return clip;
}
}
