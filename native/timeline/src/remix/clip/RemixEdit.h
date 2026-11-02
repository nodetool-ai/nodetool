#pragma once

// Clip > Remix as pure functions on the raw document. A remix is a baked audio
// asset kept as a new take of the clip (DESIGN.md D4: the raw document is
// authoritative). The take records where it came from in
// `paramOverridesSnapshot.remix`, so the web editor keeps the clip, keeps the
// take and shows the take list unchanged. Every function returns the document
// it was given when it refuses, so a caller can tell a refused edit.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>

#include <optional>

namespace nt::remix {

// The part of the music a remix works on. For a clip that is already a remix it
// is the source the remix was made from, so a new target never re-remixes a
// remix.
struct SourceWindow {
    QString assetId;
    QString takeId;     // the take that holds the source asset, "" when it has none yet
    double startMs = 0;  // the source In point
    double durationMs = 0;
};

// What the active take recorded about its remix, or an empty object when the clip
// is not a remix. The take must hold the clip's current asset.
QJsonObject activeRemix(const QJsonObject& clip);
std::optional<SourceWindow> sourceWindow(const QJsonObject& clip);

// Why the clip cannot be remixed to `durationMs`, or "" when it can. A
// `durationMs` of 0 or less skips the room check.
QString refusal(const QJsonObject& raw, const QString& clipId, double durationMs);
// Why the clip cannot go back to its source, or "".
QString revertRefusal(const QJsonObject& raw, const QString& clipId);
// Shown as the take label: "Remix 0:32".
QString takeLabel(double durationMs);

// Edit "clip.remix". Payload: clipId, assetId (the baked asset), takeId,
// createdAt, durationMs (the exact baked length), sourceDurationMs? (the source
// asset's length, for its take), remix {targetMs, segments, variations, bpm,
// beats, cuts, stretch}. One edit appends the take or takes, makes the new
// asset the clip's media and sets its length.
QJsonObject applyRemix(QJsonObject raw, const QJsonObject& payload);
// Edit "clip.remix.revert". Payload: clipId. Makes the take the remix was made
// from the active one again and gives the clip back its length and source window.
QJsonObject revertRemix(QJsonObject raw, const QJsonObject& payload);

}  // namespace nt::remix
