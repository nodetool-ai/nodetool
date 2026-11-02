#pragma once
#include "edit/targeting/TrackTargeting.h"
#include <QJsonObject>
#include <optional>

namespace nt::sourceedit {
struct Range { double inMs = 0; double outMs = 0; };
struct Result { QJsonObject doc; QString id; };
struct Destinations {
    QString videoTrackId; QString audioTrackId; QString error;
    bool newVideoTrack = false; bool newAudioTrack = false;
};
Destinations sourceDropDestinations(const QJsonObject& raw, const QString& droppedTrackId, bool video, bool audio);
struct Placement {
    QJsonObject asset; double inMs = 0; double outMs = 0;
    QString videoTrackId; QString audioTrackId;
    bool newVideoTrack = false; bool newAudioTrack = false;
    double startMs = 0; QString mode = "overwrite";
    double snapMs = 0;
    // Set by a caller that needs to know the ids of the new clips, as an edit replays this payload.
    QString videoClipId; QString audioClipId;
};
QJsonObject placementToJson(const Placement& placement);
std::optional<Result> placeSource(const QJsonObject& raw, const nt::targeting::TargetingState& state,
                                  const Placement& placement, QString* error = nullptr);
Range sourceRangeFor(const QJsonObject& asset, const QJsonObject& marks);
QString sourceTargetTrackId(const QJsonObject& doc, const nt::targeting::TargetingState& state,
                            const QJsonObject& asset);
std::optional<Result> performSourceEdit(const QString& kind, const QJsonObject& doc,
    const nt::targeting::TargetingState& state, const QJsonObject& marks, double playheadMs,
    const QJsonObject& asset);
}
