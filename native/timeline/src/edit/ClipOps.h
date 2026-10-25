#pragma once

// The editing operations of packages/timeline, ported to C++ over the raw
// clip JSON (DESIGN.md D4): `trimClip.ts`, `splitClip.ts`, `rippleEdit.ts`,
// `dropResolve.ts`, `snap.ts` and `snapping/`. Each function copies its
// TypeScript twin line for line and keeps every field it does not own, the
// way `{ ...clip, startMs }` does, so a native edit writes the same document
// the web writes. `scripts/op-conformance.mjs` runs the package's own tests
// and a randomized differential against these functions.
//
// An operation that cannot go ahead throws `OpError`, as the TypeScript one
// throws `Error`. Two kinds of input are refused natively although the web
// accepts them, and the message says so: keyframe and source-anchored custom
// animations on a split or trim (their curve slicing is not ported).

#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <functional>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace nt::edit {

using ClipList = std::vector<QJsonObject>;
using IdSet = std::set<QString>;

struct OpError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

// Fresh ids: 32 lowercase hex characters (`createTimeOrderedUuid`). A test
// may replace the generator to get stable ids.
QString newId();
void setIdGenerator(std::function<QString()> generator);

// Field access with the TypeScript defaults (`clip.inPointMs ?? 0`).
QString clipId(const QJsonObject& c);
QString clipTrackId(const QJsonObject& c);
double clipStartMs(const QJsonObject& c);
double clipDurationMs(const QJsonObject& c);
double clipEndMs(const QJsonObject& c);
// The link group id, or empty when the clip has none (absent or null).
QString clipLinkId(const QJsonObject& c);
bool isGroupClip(const QJsonObject& c);
double sourceRate(const QJsonObject& c);

// ── trimClip.ts ──
QJsonObject retimeCaption(const QJsonObject& caption, double offsetMs, double scale = 1.0);
QJsonObject trimClip(const QJsonObject& clip, const QString& edge, double deltaMs,
                     std::optional<double> maxDurationMs = std::nullopt);

// ── splitClip.ts ──
std::pair<QJsonObject, QJsonObject> splitClip(const QJsonObject& clip, double atMs);

// ── rippleEdit.ts ──
struct RippleOptions {
    IdSet lockedTrackIds;
    IdSet lockedClipIds;
    bool followLinks = true;
};
std::optional<ClipList> planShift(const ClipList& clips, double fromMs, double deltaMs, const IdSet& excludeIds = {},
                                  const RippleOptions& options = {});
ClipList shiftClipsFrom(const ClipList& clips, double fromMs, double deltaMs, const IdSet& excludeIds = {},
                        const RippleOptions& options = {});
ClipList rippleTrim(const ClipList& clips, const QString& clipId, const QString& edge, double deltaMs,
                    const RippleOptions& options = {}, std::optional<double> maxSourceDurationMs = std::nullopt);
// Index into `clips`, or -1.
int findRollNeighbour(const ClipList& clips, const QJsonObject& clip, const QString& edge);
ClipList rollEdit(const ClipList& clips, const QString& clipId, const QString& edge, double deltaMs,
                  bool followLinks = true);
ClipList rippleDelete(const ClipList& clips, const IdSet& ids, const RippleOptions& options = {});
struct Gap {
    double startMs = 0;
    double endMs = 0;
};
std::optional<Gap> findGap(const ClipList& clips, const QString& trackId, double atMs);
ClipList closeGap(const ClipList& clips, const QString& trackId, double atMs, const RippleOptions& options = {});

// ── group.ts ──
IdSet groupDescendantIds(const ClipList& clips, const QString& groupId);

// ── dropResolve.ts ──
ClipList resolveOverwrite(const ClipList& clips, const IdSet& movedIds, const RippleOptions& options = {});
ClipList resolveInsert(const ClipList& clips, const IdSet& movedIds, const RippleOptions& options = {});
ClipList resolveDrop(const ClipList& clips, const IdSet& movedIds, const QString& mode,
                     const RippleOptions& options = {});

// ── clipSpeed.ts ──
inline constexpr double RATE_STRETCH_MIN_SPEED = 0.1;
inline constexpr double RATE_STRETCH_MAX_SPEED = 20;
ClipList rateStretchClips(const ClipList& clips, const IdSet& memberIds, const QString& primaryId, const QString& edge,
                          double durationMs);

// ── slideEdit.ts ──
using SourceDurationFor = std::function<std::optional<double>(const QJsonObject&)>;
double slideDeltaLimit(const ClipList& clips, const IdSet& memberIds, double deltaMs,
                       const SourceDurationFor& sourceDurationMsFor = {});
ClipList slideClips(const ClipList& clips, const IdSet& memberIds, double deltaMs,
                    const SourceDurationFor& sourceDurationMsFor = {});

// ── useClipSourceSlip.ts slipSourceWindow: the patch (inPointMs, and
// outPointMs when the clip has one) ──
QJsonObject slipSourceWindow(const QJsonObject& clip, double sourceDeltaMs, std::optional<double> sourceDurationMs);

// ── trackSelect.ts ── direction "forward" or "backward"; empty track: all.
QStringList trackSelectIds(const ClipList& clips, double atMs, const QString& direction, const QString& trackId = {});

// ── snap.ts, snapping/ ──
double snap(double timeMs, const std::vector<double>& candidates, double thresholdPx, double msPerPx);
struct SnapResolution {
    double value = 0;
    bool snapped = false;
    double distanceMs = 0;
    double distancePx = 0;
};
SnapResolution resolveSnap(double timeMs, const std::vector<double>& candidates, double thresholdPx, double msPerPx);
struct SnapPointSource {
    const ClipList* clips = nullptr;
    std::vector<double> markers;
    std::optional<double> playheadMs;
    double tickIntervalMs = 0;
    double maxTimeMs = 0;
    IdSet excludeClipIds;
};
std::vector<double> buildSnapPoints(const SnapPointSource& source);

}  // namespace nt::edit
