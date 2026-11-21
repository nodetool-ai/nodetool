#pragma once
#include <QJsonObject>
#include <optional>

namespace nt::assets {
QString assetMediaType(const QJsonObject& asset);
// An asset a generation uploaded as its input, such as a music context bounce
// (`metadata.generation_context`, docs/MUSIC-MODE.md MR10). Libraries leave it out.
bool isGenerationContextAsset(const QJsonObject& asset);
std::optional<QJsonObject> assetToClip(const QJsonObject& asset, const QString& trackId, double startMs);
}
