#include "SourceEdit.h"
#include "assets/AssetClip.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/targeting/TargetingEdits.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nt::sourceedit {
namespace {
// sourceEdit.ts asks assetMediaType(content_type), without the filename hint.
QString sourceMediaType(const QJsonObject& asset) {
    return nt::assets::assetMediaType(QJsonObject{{"content_type", asset.value("content_type")}});
}
}
Range sourceRangeFor(const QJsonObject& asset, const QJsonObject& range) {
    const auto duration = asset.value("duration");
    const double fullMs = duration.isDouble() ? std::floor(duration.toDouble() * 1000 + 0.5) : 0;
    const auto marks = range.value("assetId") == asset.value("id") ? range : QJsonObject{};
    const double limit = fullMs != 0 ? fullMs : std::numeric_limits<double>::infinity();
    const double inMs = std::min(limit, std::max(0.0, marks.value("inMs").toDouble()));
    const auto markedOut = marks.value("outMs");
    const double outMs = markedOut.isDouble() ? markedOut.toDouble() : fullMs > 0 ? fullMs : inMs;
    return {inMs, std::min(limit, std::max(inMs, outMs))};
}
QString sourceTargetTrackId(const QJsonObject& raw, const nt::targeting::TargetingState& state,
                            const QJsonObject& asset) {
    const auto type = sourceMediaType(asset);
    if (type.isEmpty()) { return {}; }
    const auto targeted = nt::targeting::targetedTrackIds(nt::edit::structure::editDocument(raw), state);
    std::vector<QJsonObject> tracks;
    for (const auto& value : raw.value("tracks").toArray()) { tracks.push_back(value.toObject()); }
    std::stable_sort(tracks.begin(), tracks.end(), [](const auto& a, const auto& b) {
        return a.value("index").toDouble() < b.value("index").toDouble();
    });
    for (const auto& track : tracks) {
        const auto id = track.value("id").toString();
        if (targeted.contains(id) && nt::edit::clipFitsTrack(type, track.value("type").toString())) { return id; }
    }
    return {};
}
std::optional<Result> performSourceEdit(const QString& kind, const QJsonObject& raw,
    const nt::targeting::TargetingState& state, const QJsonObject& marks, double playheadMs,
    const QJsonObject& asset) {
    if (asset.isEmpty()) { return std::nullopt; }
    auto [inMs, outMs] = sourceRangeFor(asset, marks);
    const auto type = sourceMediaType(asset);
    if (type.isEmpty() || (type != "image" && outMs <= inMs)) { return std::nullopt; }
    const auto trackId = sourceTargetTrackId(raw, state, asset);
    if (trackId.isEmpty()) { return std::nullopt; }
    if (type == "image" && outMs <= inMs) {
        const auto base = nt::assets::assetToClip(asset, trackId, 0);
        if (!base) { return std::nullopt; }
        inMs = 0;
        outMs = base->value("durationMs").toDouble();
    }
    auto doc = nt::edit::structure::editDocument(raw);
    double startMs = playheadMs;
    if (kind == "append") {
        startMs = 0;
        for (const auto& clip : doc.clips) {
            if (nt::edit::clipTrackId(clip) == trackId) { startMs = std::max(startMs, nt::edit::clipEndMs(clip)); }
        }
    }
    auto ranged = nt::assets::assetToClip(asset, trackId, startMs);
    if (!ranged) { return std::nullopt; }
    // addSourceRange branches on the adapter's media type, as the web does.
    if (ranged->value("mediaType") != "image") {
        ranged->insert("inPointMs", inMs);
        ranged->insert("outPointMs", outMs);
    }
    ranged->insert("durationMs", std::max(1.0, outMs - inMs));
    const auto id = ranged->value("id").toString();
    doc.clips.push_back(*ranged);
    if (kind == "insert" || kind == "overwrite") {
        doc.clips = nt::targeting::resolveDropAction(doc, state, {id}, kind);
    }
    return Result{nt::edit::structure::withClips(raw, doc.clips), id};
}
}
