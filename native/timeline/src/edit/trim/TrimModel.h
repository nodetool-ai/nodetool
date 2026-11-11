#pragma once

// Trim mode's logic, with no Qt GUI, model or clock: edit points, the three
// trim kinds, linked partners, clamping and the dynamic (J/K/L) trim state
// machine. `TrimMode` (edit/trim/TrimMode.h) connects it to the editor.
//
// The behaviour and the test cases are ported from FilmCraft
// (crates/engine/src/trim.rs and trim_tests.rs, licenses/FilmCraft-MIT.txt).
// Two choices follow Premiere and this editor's mouse trims instead:
// - A roll moves every linked partner by the same amount, so a split edit keeps
//   its offset, as rollClipEdge does for a drag.
// - A roll on an edge with no neighbour trims into the gap.
//
// Every trim runs through the document's own edge edits (EdgeEdit), so links,
// sync locks and source limits behave as they do with the mouse. Those edits
// refuse a trim outright when it breaks a limit. trimBy finds the largest
// whole number of frames that is accepted, once for each linked group.
//
// Movement is always in timeline time, positive later, whatever the kind. Ms is
// the unit throughout, and a "clock" is any monotonic time in ms from the caller.

#include "edit/EditActions.h"
#include "edit/targeting/TrackTargeting.h"

#include <QString>

#include <functional>
#include <optional>
#include <utility>
#include <vector>

namespace nt::edit::trim {

enum class Kind {
    Trim,    // The edge moves, leaving or covering a gap.
    Ripple,  // The edge moves and later material follows.
    Roll     // The cut between two clips moves. The duration stays.
};

struct EditPoint {
    QString clipId;
    bool out = false;  // The clip's end edge, else its start edge.
    Kind kind = Kind::Trim;
    friend bool operator==(const EditPoint&, const EditPoint&) = default;
};
using EditPoints = std::vector<EditPoint>;

// One edge edit. `action` is the registered edit's name: trimClipStart,
// trimClipEnd, rippleTrimClipStart, rippleTrimClipEnd or rollClipEdge. `deltaMs`
// has that edit's sign: positive lengthens the clip for the four trims, and is
// later for rollClipEdge. `edge` ("start" or "end") is set for rollClipEdge.
struct EdgeRequest {
    QString action;
    QString clipId;
    QString edge;
    double deltaMs = 0;
    std::optional<double> maxSourceDurationMs;
    bool linked = true;
};
using EdgeEdit = std::function<ClipList(const EditDoc&, const EdgeRequest&)>;

struct Env {
    double fps = 30;
    bool linked = true;
    nt::targeting::TargetingState targeting;
    // The clip's source length in source ms. Empty, or nullopt: not capped.
    SourceDurationFor sourceDuration;
    // Empty: plainEdgeEdit.
    EdgeEdit edit;
};

// The edit a request names, from EditActions.h and, for ripples,
// edit/targeting/TargetingEdits.h with `targeting`.
ClipList plainEdgeEdit(const EditDoc& doc, const EdgeRequest& request, const nt::targeting::TargetingState& targeting);

// ── Edit points ──

// The time of the edge in the sequence, or nullopt with no such clip.
std::optional<double> editTimeMs(const EditDoc& doc, const EditPoint& point);
// The (left, right) clips of the cut at this edge: another clip on the track
// abuts it (findRollNeighbour), or, as after a transition, overlaps it.
std::optional<std::pair<QString, QString>> rollPair(const EditDoc& doc, const EditPoint& point);
// The same edge of the same clip, or, for two rolls, either side of one cut.
bool sameEdge(const EditDoc& doc, const EditPoint& a, const EditPoint& b);
// `point`, then with env.linked the same edge of each linked clip that is not
// on a locked track and is not a group. Empty when the clip is missing, a
// group, or on a locked track or locked itself.
EditPoints linkedPoints(const EditDoc& doc, const EditPoint& point, const Env& env);
// A click on an edge. Without `add` the group replaces the selection. With
// `add`, an edge already selected removes its whole group, and any other adds
// its group. A refused point leaves `current` as it is.
EditPoints select(const EditDoc& doc, const EditPoints& current, const EditPoint& point, bool add, const Env& env);
// On each targeted, unlocked track (nt::targeting::targetedTrackIds), the edge
// nearest `nowMs` with its linked partners and no duplicates. A track's cuts
// (rollPair) win over its other edges. The first edge found wins a tie.
EditPoints selectNearest(const EditDoc& doc, double nowMs, Kind kind, const Env& env);
// Ripple, then Roll, then Trim, then Ripple, for every point.
EditPoints toggleKind(const EditPoints& points);
// Drops the points whose clip is gone.
EditPoints prune(const EditDoc& doc, const EditPoints& points);

// One edge to paint: a roll marks both sides of its cut.
struct EdgeMark {
    QString clipId;
    bool out = false;
    Kind kind = Kind::Trim;
    friend bool operator==(const EdgeMark&, const EdgeMark&) = default;
};
std::vector<EdgeMark> edgeMarks(const EditDoc& doc, const EditPoints& points);

// ── Trims ──

// The frame grid point `frames` frames from `ms`, as a whole ms at or just before
// the frame's time. A frame shows the clips with start <= time < end, so this edge
// puts the cut exactly on that frame. frameStepMs rounds, and when it rounds up
// the frame still belongs to the clip before the edge.
double frameEdgeMs(double ms, double frames, double fps);

struct TrimResult {
    // The document after the trim. doc.clips when nothing moved.
    ClipList clips;
    // The movement of the first point's group.
    double appliedMs = 0;
    int appliedFrames = 0;
    // The first point's group stopped short of what was wanted.
    bool atLimit = false;
};
// Trims each linked group once, in the order of `points`, clamping it on its
// own and handing the document on to the next. `wantedMs` gives a group's
// movement from the document as it is when the group is reached. A group whose
// movement is zero is left alone. A clamped group moves a whole number of frames.
// A movement is accepted when: the edit moved the group's first
// edge by exactly that amount; no clip it changed shows no frame at all
// unless it did not shrink; no track gains overlap (the summed overlap of its
// sorted clips does not grow); and no changed clip's out-point passes
// env.sourceDuration unless it did not grow. The accepted set is an interval
// around zero, so a binary search over whole frames finds the limit.
// A unit with a locked partner trims its unlocked members with no link
// following. A ripple of such a unit with more than one unlocked member is refused.
// A Roll with no neighbour runs as a Trim.
TrimResult trimBy(const EditDoc& doc, const EditPoints& points,
                  const std::function<double(const EditDoc&, const EditPoint&)>& wantedMs, const Env& env);
// Each group moves `frames` frames so that its first edge falls exactly on a frame
// (for a ripple on a start edge, the clip's end does). appliedFrames counts frames for the first group.
TrimResult nudgeFrames(const EditDoc& doc, const EditPoints& points, int frames, const Env& env);
// Each group's first edge moves to `playheadMs`.
TrimResult extendToPlayhead(const EditDoc& doc, const EditPoints& points, double playheadMs, const Env& env);

// Which part of the Trim Monitor a drag started in.
enum class DragSide { Outgoing, Incoming, Between };
// The points a drag acts on. Several linked groups stay as they are. One group
// moves to the dragged side: Outgoing takes the left clip's end edge and
// Incoming the right clip's start edge, with Roll becoming Ripple and other
// kinds kept. Between takes a Roll of the cut. A side with no clip, or a refused
// point, leaves `points` as they are.
EditPoints retargetForDrag(const EditDoc& doc, const EditPoints& points, DragSide side, const Env& env);

// ── Trim Monitor ──

struct MonitorSide {
    QString clipId;
    QString name;
    QString trackId;
    QString mediaType;
    // The frame shown: the last frame of the grid before the outgoing clip's
    // end, or the first frame at or after the incoming clip's start.
    double frameTimeMs = 0;
    // That frame in the clip's source: inPointMs + (frameTimeMs - startMs) * rate.
    double sourceTimeMs = 0;
};
struct MonitorInfo {
    std::optional<MonitorSide> outgoing;
    std::optional<MonitorSide> incoming;
    bool outgoingMoves = false;
    bool incomingMoves = false;
};
// For the primary point: both sides of its cut, or with no neighbour its own
// clip on its own side. Roll moves both sides, other kinds the point's own side.
MonitorInfo monitorInfo(const EditDoc& doc, const EditPoint& primary, double fps);

// The Out and In shift counters count the source movement since the selection,
// so undo brings them back with the document.
struct ShiftAnchor {
    QString outgoingClipId;
    double outgoingSourceOutMs = 0;
    QString incomingClipId;
    double incomingSourceInMs = 0;
};
ShiftAnchor shiftAnchor(const EditDoc& doc, const EditPoint& primary);
struct Shift {
    int outFrames = 0;
    int inFrames = 0;
    friend bool operator==(const Shift&, const Shift&) = default;
};
// A side whose clip is gone counts 0. Source movement is divided by the clip's
// rate, so the count is in timeline frames.
Shift shiftFrom(const EditDoc& doc, const ShiftAnchor& anchor, double fps);

// ── Playing around the edit ──

struct LoopSpan {
    double startMs = 0;
    double endMs = 0;
};
// centerMs - prerollMs to centerMs + postrollMs on the frame grid, inside
// [0, max(contentEndMs, centerMs + one frame)], and at least one frame long.
LoopSpan playAround(double centerMs, double prerollMs, double postrollMs, double contentEndMs, double fps);

// ── Dynamic trim ──

// L moves the edit forward and J back. Each press in the same direction doubles
// the speed up to 8x, and the other direction starts at 1x. Every update applies
// the whole offset to the document as it was at the start, so nothing accumulates.
// When the first point reaches a limit every point holds there, at speed 0, until
// the next press.
class DynamicTrim {
public:
    DynamicTrim(EditDoc base, EditPoints points, Env env);
    // Brings the offset up to `clockMs`, then sets the speed. `slow` is a quarter
    // of normal speed. Returns the new speed. Direction is 1 or -1.
    double shuttle(int direction, double clockMs, bool slow = false);
    // Brings the offset up to `clockMs`. True when the clips changed. The offset
    // is the anchor's plus the time since the anchor times the speed, in whole
    // frames truncated toward zero.
    bool tick(double clockMs);
    int offsetFrames() const { return m_offsetFrames; }
    double speed() const { return m_speed; }
    bool atLimit() const { return m_atLimit; }
    const ClipList& clips() const { return m_clips; }
    const ClipList& baseClips() const { return m_base.clips; }
    const EditPoints& points() const { return m_points; }
    // The primary edit's time in clips().
    std::optional<double> editTime() const;
    // The undo entry's text, once for a run that changed the document: "Dynamic
    // rolling edit", "Dynamic ripple trim" or "Dynamic trim" after the first
    // point's kind. Nothing moved, or already committed: nullopt.
    std::optional<QString> commit();

private:
    EditDoc m_base;
    EditPoints m_points;
    Env m_env;
    ClipList m_clips;
    int m_offsetFrames = 0;
    int m_anchorOffset = 0;
    double m_anchorClockMs = 0;
    double m_speed = 0;
    bool m_atLimit = false;
    bool m_started = false;
    bool m_committed = false;
};

}  // namespace nt::edit::trim
