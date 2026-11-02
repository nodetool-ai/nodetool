#pragma once

// What Scene Edit Detection does to the document, as pure functions on the raw
// clip and marker JSON. The cuts are the document's own splits (splitClip), so
// a linked audio clip is cut with its video, a clip keeps its source rate in
// each half, and a locked clip or one with a time remap is refused the way a
// split at the playhead refuses it. The edits registered in
// SceneEditRegistrations.cpp and the dialog's preview both call these, so what
// the dialog promises is what the edit does.

#include "edit/EditActions.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QString>

#include <span>
#include <vector>

namespace nt::shots {

// The cuts found in one clip. The clip's place at the time of the analysis is
// kept so a document that changed since then is noticed.
struct CutRequest {
    QString clipId;
    double startMs = 0.0;
    double durationMs = 0.0;
    double inPointMs = 0.0;
    std::vector<double> atMs;  // timeline times of the first frame of each new shot
};

enum class CutOutcome {
    Cut,         // at least one split was made
    NoCuts,      // the request had no usable time
    Locked,      // the clip, or a clip linked to it, is locked or on a locked track
    Changed,     // the clip is gone or moved, trimmed or retimed since the analysis
    CannotSplit  // the split is refused (a time remap, a media track)
};

struct CutPlan {
    edit::ClipList clips;
    std::vector<CutOutcome> outcomes;  // one per request
    int points = 0;                    // cut points made, over all clips
    int clipsCut = 0;
};

// The document the edit actions read, from the raw sequence JSON.
edit::EditDoc editDocOf(const QJsonObject& raw);

// Splits each requested clip at its times, earliest first, following the right
// half. `doc` is not changed. The result holds the new clip list, so the caller
// writes it only when `points` is above zero.
CutPlan planCuts(const edit::EditDoc& doc, const std::vector<CutRequest>& requests);

// The markers array with one "Scene cut" marker added at each time that has no
// marker within half a frame. It returns the array it was given when there is
// nothing to add.
QJsonArray addCutMarkers(QJsonArray markers, std::span<const double> timesMs, double fps);

}  // namespace nt::shots
