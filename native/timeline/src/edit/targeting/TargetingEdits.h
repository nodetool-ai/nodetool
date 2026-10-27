#pragma once
#include "edit/EditActions.h"
#include "edit/targeting/TrackTargeting.h"
#include <QJsonArray>

namespace nt::targeting {
using nt::edit::ClipList;
using nt::edit::EditDoc;
using nt::edit::IdSet;

IdSet targetedTrackIds(const EditDoc& doc, const TargetingState& state);
IdSet rippleFrozenTrackIds(const EditDoc& doc, const TargetingState& state, const IdSet& editedTrackIds);
ClipList rippleTrimClipStart(const EditDoc& doc, const TargetingState& state, const QString& id,
                            double deltaMs, bool linked);
ClipList rippleTrimClipEnd(const EditDoc& doc, const TargetingState& state, const QString& id,
                          double deltaMs, std::optional<double> maxSourceDurationMs, bool linked);
ClipList rippleDeleteSelected(const EditDoc& doc, const TargetingState& state, const IdSet& selectedIds);
ClipList resolveDropAction(const EditDoc& doc, const TargetingState& state, const IdSet& movedIds, const QString& mode);
struct RangeResult {
    ClipList clips;
    QJsonArray mediaTracks;
};
RangeResult removeRange(const EditDoc& doc, const QJsonArray& mediaTracks, const TargetingState& state,
                        double startMs, double endMs, bool ripple);
ClipList closeGapAt(const EditDoc& doc, const TargetingState& state, const QString& trackId, double timeMs);
}
