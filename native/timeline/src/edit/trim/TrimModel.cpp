#include "TrimModel.h"

#include "edit/targeting/TargetingEdits.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iterator>
#include <limits>

namespace nt::edit::trim {
namespace {
constexpr double EPSILON_MS = 1e-3;

const QJsonObject* findClip(const EditDoc& doc, const QString& id) {
    const int index = doc.indexOf(id);
    return index < 0 ? nullptr : &doc.clips[static_cast<size_t>(index)];
}
QString edgeName(bool out) { return out ? QStringLiteral("end") : QStringLiteral("start"); }
double frameDuration(double fps) { return 1000 / std::max(1.0, fps); }
double sourceIn(const QJsonObject& clip) { return clip.value(u"inPointMs").toDouble(); }
double sourceOut(const QJsonObject& clip) {
    const auto out = clip.value(u"outPointMs");
    return out.isDouble() ? out.toDouble() : sourceIn(clip) + clipDurationMs(clip) * sourceRate(clip);
}
bool editable(const QJsonObject& clip, const IdSet& lockedTracks) {
    return !isGroupClip(clip) && !clip.value(u"locked").toBool() && !lockedTracks.contains(clipTrackId(clip));
}
int frameCount(double frames) {
    return static_cast<int>(std::round(std::clamp(frames, static_cast<double>(std::numeric_limits<int>::min()),
                                                       static_cast<double>(std::numeric_limits<int>::max()))));
}
void appendUnique(const EditDoc& doc, EditPoints& points, const EditPoint& point) {
    if (!std::ranges::any_of(points, [&](const auto& p) { return sameEdge(doc, p, point); })) {
        points.push_back(point);
    }
}
std::pair<QString, QString> sides(const EditDoc& doc, const EditPoint& point) {
    if (const auto pair = rollPair(doc, point)) { return *pair; }
    if (!editTimeMs(doc, point)) { return {}; }
    return point.out ? std::pair{point.clipId, QString{}} : std::pair{QString{}, point.clipId};
}

// A frame is shown by the clips with start <= time < end, so a clip's length alone
// does not say it has one: 41 ms at 24 fps can fall between two frames.
bool showsAFrame(const QJsonObject& clip, double fps) {
    const double frameMs = frameDuration(fps);
    return std::ceil(clipStartMs(clip) / frameMs - 1e-9) * frameMs < clipEndMs(clip) - 1e-9;
}
// The movement `frames` frames on the grid. A ripple on a start edge leaves the clip
// parked, so the edge that has to land on a frame is its end, moving the other way.
double frameMovement(const EditDoc& doc, const EditPoint& point, double frames, double fps) {
    const auto* clip = findClip(doc, point.clipId);
    // No frames is no movement, even for an edge that lies off the grid.
    if (!clip || frames == 0) { return 0; }
    if (!point.out && point.kind == Kind::Ripple) {
        const double end = clipEndMs(*clip);
        return end - frameEdgeMs(end, -frames, fps);
    }
    const double edge = point.out ? clipEndMs(*clip) : clipStartMs(*clip);
    return frameEdgeMs(edge, frames, fps) - edge;
}

using Overlaps = QHash<QString, double>;
Overlaps overlaps(const ClipList& clips) {
    QHash<QString, std::vector<std::pair<double, double>>> tracks;
    for (const auto& clip : clips) {
        if (!isGroupClip(clip)) { tracks[clipTrackId(clip)].emplace_back(clipStartMs(clip), clipEndMs(clip)); }
    }
    Overlaps result;
    for (auto it = tracks.begin(); it != tracks.end(); ++it) {
        auto& spans = it.value();
        std::ranges::stable_sort(spans, {}, &std::pair<double, double>::first);
        double overlap = 0;
        for (size_t i = 1; i < spans.size(); ++i) {
            overlap += std::max(0.0, spans[i - 1].second - spans[i].first);
        }
        result.insert(it.key(), overlap);
    }
    return result;
}
bool validEdit(const EditDoc& before, const ClipList& after, const Overlaps& beforeOverlap, const Env& env) {
    if (before.clips.size() != after.size()) { return false; }
    for (size_t i = 0; i < after.size(); ++i) {
        const auto& old = before.clips[i];
        const auto& clip = after[i];
        if (clipId(old) != clipId(clip)) { return false; }
        if (isGroupClip(clip) || clip == old) { continue; }
        const double duration = clipDurationMs(clip);
        if (!showsAFrame(clip, env.fps) && (showsAFrame(old, env.fps) || duration + EPSILON_MS < clipDurationMs(old))) {
            return false;
        }
        if (env.sourceDuration && sourceOut(clip) > sourceOut(old) + EPSILON_MS) {
            const auto cap = env.sourceDuration(clip);
            if (cap && sourceOut(clip) > *cap + EPSILON_MS) { return false; }
        }
    }
    const auto afterOverlap = overlaps(after);
    for (auto it = afterOverlap.cbegin(); it != afterOverlap.cend(); ++it) {
        if (it.value() > beforeOverlap.value(it.key()) + EPSILON_MS) { return false; }
    }
    return true;
}

double movement(const EditDoc& before, const EditDoc& after, const EditPoint& point) {
    const auto* old = findClip(before, point.clipId);
    const auto* clip = findClip(after, point.clipId);
    if (!old || !clip) { return 0; }
    if (point.out) { return clipEndMs(*clip) - clipEndMs(*old); }
    if (point.kind == Kind::Ripple) { return clipDurationMs(*old) - clipDurationMs(*clip); }
    return clipStartMs(*clip) - clipStartMs(*old);
}
EdgeRequest requestFor(const EditDoc& doc, EditPoint point, double deltaMs, bool linked, const Env& env) {
    EdgeRequest request;
    request.clipId = point.clipId;
    request.linked = linked;
    const auto pair = rollPair(doc, point);
    if (point.kind == Kind::Roll && !pair) { point.kind = Kind::Trim; }
    if (point.kind == Kind::Roll) {
        request.action = QStringLiteral("rollClipEdge");
        request.edge = edgeName(point.out);
        request.deltaMs = deltaMs;
        if (env.sourceDuration) {
            if (const auto* left = findClip(doc, pair->first)) { request.maxSourceDurationMs = env.sourceDuration(*left); }
        }
    } else {
        request.action = point.kind == Kind::Ripple
            ? (point.out ? QStringLiteral("rippleTrimClipEnd") : QStringLiteral("rippleTrimClipStart"))
            : (point.out ? QStringLiteral("trimClipEnd") : QStringLiteral("trimClipStart"));
        request.deltaMs = point.out ? deltaMs : -deltaMs;
        if (point.out && env.sourceDuration) {
            if (const auto* clip = findClip(doc, point.clipId)) { request.maxSourceDurationMs = env.sourceDuration(*clip); }
        }
    }
    return request;
}
// One edit, except for a roll of an overlapped cut, which rollClipEdge refuses because the
// clips do not abut: there each side trims by the same movement, and the overlap stays.
std::vector<EdgeRequest> requestsFor(const EditDoc& doc, const EditPoint& point, double deltaMs, bool linked, const Env& env) {
    const auto* clip = findClip(doc, point.clipId);
    const auto pair = point.kind == Kind::Roll ? rollPair(doc, point) : std::nullopt;
    if (!clip || !pair || findRollNeighbour(doc.clips, *clip, edgeName(point.out)) >= 0) {
        return {requestFor(doc, point, deltaMs, linked, env)};
    }
    return {requestFor(doc, {pair->first, true, Kind::Trim}, deltaMs, linked, env),
            requestFor(doc, {pair->second, false, Kind::Trim}, deltaMs, linked, env)};
}
bool canFollowLinks(const EditDoc& doc, const EditPoint& point, const Env& env) {
    if (!env.linked) { return false; }
    IdSet links;
    if (const auto* clip = findClip(doc, point.clipId)) { links.insert(clipLinkId(*clip)); }
    if (point.kind == Kind::Roll) {
        if (const auto pair = rollPair(doc, point)) {
            if (const auto* left = findClip(doc, pair->first)) { links.insert(clipLinkId(*left)); }
            if (const auto* right = findClip(doc, pair->second)) { links.insert(clipLinkId(*right)); }
        }
    }
    links.erase(QString{});
    const auto locked = lockedTrackIds(doc);
    return !std::ranges::any_of(doc.clips, [&](const auto& clip) {
        return links.contains(clipLinkId(clip)) && !editable(clip, locked);
    });
}

// Keep both sides of a rolling cut in the visited set, even after it moves.
void markEdited(const EditDoc& doc, const EditPoint& point, const Env& env, IdSet& starts, IdSet& ends) {
    const auto mark = [&](const EditPoint& p) {
        (p.out ? ends : starts).insert(p.clipId);
        if (p.kind == Kind::Roll) {
            if (const auto pair = rollPair(doc, p)) {
                ends.insert(pair->first);
                starts.insert(pair->second);
            }
        }
    };
    for (const auto& p : linkedPoints(doc, point, env)) { mark(p); }
    if (point.kind == Kind::Roll) {
        if (const auto pair = rollPair(doc, point)) {
            const EditPoint other{point.out ? pair->second : pair->first, !point.out, Kind::Roll};
            for (const auto& p : linkedPoints(doc, other, env)) { mark(p); }
        }
    }
}
}

double frameEdgeMs(double ms, double frames, double fps) {
    const double frameMs = frameDuration(fps);
    return std::floor((std::floor(ms / frameMs + 0.5) + frames) * frameMs + 1e-6);
}

ClipList plainEdgeEdit(const EditDoc& doc, const EdgeRequest& request, const nt::targeting::TargetingState& targeting) {
    try {
        if (request.action == u"trimClipStart") {
            return trimClipStart(doc, request.clipId, request.deltaMs, request.linked);
        }
        if (request.action == u"trimClipEnd") {
            return trimClipEnd(doc, request.clipId, request.deltaMs, request.maxSourceDurationMs, request.linked);
        }
        if (request.action == u"rippleTrimClipStart") {
            return nt::targeting::rippleTrimClipStart(doc, targeting, request.clipId, request.deltaMs, request.linked);
        }
        if (request.action == u"rippleTrimClipEnd") {
            return nt::targeting::rippleTrimClipEnd(doc, targeting, request.clipId, request.deltaMs,
                                                  request.maxSourceDurationMs, request.linked);
        }
        if (request.action == u"rollClipEdge") {
            return rollClipEdge(doc, request.clipId, request.edge, request.deltaMs,
                                request.maxSourceDurationMs, request.linked);
        }
    } catch (const OpError&) {
        return doc.clips;
    }
    return doc.clips;
}

std::optional<double> editTimeMs(const EditDoc& doc, const EditPoint& point) {
    const auto* clip = findClip(doc, point.clipId);
    if (!clip || isGroupClip(*clip)) { return std::nullopt; }
    return point.out ? clipEndMs(*clip) : clipStartMs(*clip);
}
std::optional<std::pair<QString, QString>> rollPair(const EditDoc& doc, const EditPoint& point) {
    const auto* clip = findClip(doc, point.clipId);
    if (!clip || isGroupClip(*clip)) { return std::nullopt; }
    const int index = findRollNeighbour(doc.clips, *clip, edgeName(point.out));
    if (index >= 0) {
        const auto& neighbour = doc.clips[static_cast<size_t>(index)];
        if (isGroupClip(neighbour)) { return std::nullopt; }
        return point.out ? std::pair{point.clipId, clipId(neighbour)} : std::pair{clipId(neighbour), point.clipId};
    }
    // A transition lengthens the outgoing clip under the incoming one, and it is still that cut.
    const double start = clipStartMs(*clip);
    const double end = clipEndMs(*clip);
    for (const auto& other : doc.clips) {
        if (clipId(other) == point.clipId || isGroupClip(other) || clipTrackId(other) != clipTrackId(*clip)) { continue; }
        const double otherStart = clipStartMs(other);
        const double otherEnd = clipEndMs(other);
        if (point.out && start < otherStart && otherStart < end && end <= otherEnd) {
            return std::pair{point.clipId, clipId(other)};
        }
        if (!point.out && otherStart < start && start < otherEnd && otherEnd <= end) {
            return std::pair{clipId(other), point.clipId};
        }
    }
    return std::nullopt;
}
bool sameEdge(const EditDoc& doc, const EditPoint& a, const EditPoint& b) {
    if (a.clipId == b.clipId && a.out == b.out) { return true; }
    if (a.kind != Kind::Roll || b.kind != Kind::Roll) { return false; }
    const auto pair = rollPair(doc, a);
    return pair && pair == rollPair(doc, b);
}
EditPoints linkedPoints(const EditDoc& doc, const EditPoint& point, const Env& env) {
    const auto* clip = findClip(doc, point.clipId);
    const auto locked = lockedTrackIds(doc);
    if (!clip || !editable(*clip, locked)) { return {}; }
    EditPoints points{point};
    const auto link = clipLinkId(*clip);
    if (env.linked && !link.isEmpty()) {
        for (const auto& partner : doc.clips) {
            if (clipId(partner) != point.clipId && clipLinkId(partner) == link && editable(partner, locked)) {
                points.push_back({clipId(partner), point.out, point.kind});
            }
        }
    }
    return points;
}
EditPoints select(const EditDoc& doc, const EditPoints& current, const EditPoint& point, bool add, const Env& env) {
    const auto group = linkedPoints(doc, point, env);
    if (group.empty()) { return current; }
    if (!add) { return group; }
    const auto inGroup = [&](const auto& p) {
        return std::ranges::any_of(group, [&](const auto& g) { return sameEdge(doc, p, g); });
    };
    const bool remove = std::ranges::any_of(current, inGroup);
    EditPoints result;
    std::ranges::copy_if(current, std::back_inserter(result), [&](const auto& p) { return !inGroup(p); });
    if (!remove) { result.insert(result.end(), group.begin(), group.end()); }
    return result;
}
EditPoints selectNearest(const EditDoc& doc, double nowMs, Kind kind, const Env& env) {
    const auto targeted = nt::targeting::targetedTrackIds(doc, env.targeting);
    const auto locked = lockedTrackIds(doc);
    // By track, so a long sequence costs n log n and no scan for each edge.
    struct TrackEdges {
        std::vector<int> clips;
        std::vector<double> starts;
        std::vector<double> ends;
    };
    QHash<QString, TrackEdges> byTrack;
    for (size_t i = 0; i < doc.clips.size(); ++i) {
        const auto& clip = doc.clips[i];
        if (isGroupClip(clip) || !targeted.contains(clipTrackId(clip))) { continue; }
        auto& edges = byTrack[clipTrackId(clip)];
        edges.starts.push_back(clipStartMs(clip));
        edges.ends.push_back(clipEndMs(clip));
        if (editable(clip, locked)) { edges.clips.push_back(static_cast<int>(i)); }
    }
    // findRollNeighbour's tolerance, on the sorted edges of the other side.
    const auto touches = [](const std::vector<double>& sorted, double at) {
        const auto found = std::ranges::lower_bound(sorted, at - 1);
        return found != sorted.end() && *found <= at + 1;
    };
    EditPoints result;
    for (const auto& track : doc.tracks) {
        const auto found = byTrack.find(track.id);
        if (found == byTrack.end()) { continue; }
        auto& edges = found.value();
        std::ranges::sort(edges.starts);
        std::ranges::sort(edges.ends);
        std::optional<EditPoint> best;
        double distance = std::numeric_limits<double>::infinity();
        bool bestIsCut = false;
        for (const int index : edges.clips) {
            const auto& clip = doc.clips[static_cast<size_t>(index)];
            for (const bool out : {false, true}) {
                const double at = out ? clipEndMs(clip) : clipStartMs(clip);
                const bool cut = touches(out ? edges.starts : edges.ends, at);
                const double d = std::abs(at - nowMs);
                if ((!bestIsCut && cut) || (bestIsCut == cut && d < distance)) {
                    best = EditPoint{clipId(clip), out, kind};
                    distance = d;
                    bestIsCut = cut;
                }
            }
        }
        if (best) {
            for (const auto& p : linkedPoints(doc, *best, env)) { appendUnique(doc, result, p); }
        }
    }
    return result;
}
EditPoints toggleKind(const EditPoints& points) {
    auto result = points;
    for (auto& p : result) {
        switch (p.kind) {
        case Kind::Trim: p.kind = Kind::Ripple; break;
        case Kind::Ripple: p.kind = Kind::Roll; break;
        case Kind::Roll: p.kind = Kind::Trim; break;
        }
    }
    return result;
}
EditPoints prune(const EditDoc& doc, const EditPoints& points) {
    EditPoints result;
    std::ranges::copy_if(points, std::back_inserter(result), [&](const auto& p) { return editTimeMs(doc, p).has_value(); });
    return result;
}
std::vector<EdgeMark> edgeMarks(const EditDoc& doc, const EditPoints& points) {
    std::vector<EdgeMark> result;
    IdSet starts;
    IdSet ends;
    const auto mark = [&](const QString& id, bool out, Kind kind) {
        if ((out ? ends : starts).insert(id).second) { result.push_back({id, out, kind}); }
    };
    for (const auto& p : points) {
        if (!editTimeMs(doc, p)) { continue; }
        if (p.kind == Kind::Roll) {
            if (const auto pair = rollPair(doc, p)) {
                mark(pair->first, true, p.kind);
                mark(pair->second, false, p.kind);
                continue;
            }
        }
        mark(p.clipId, p.out, p.kind);
    }
    return result;
}

TrimResult trimBy(const EditDoc& doc, const EditPoints& points,
                  const std::function<double(const EditDoc&, const EditPoint&)>& wantedMs, const Env& env) {
    TrimResult result{doc.clips};
    EditDoc current = doc;
    IdSet starts;
    IdSet ends;
    for (size_t i = 0; i < points.size(); ++i) {
        const auto& point = points[i];
        if ((point.out ? ends : starts).contains(point.clipId)) { continue; }
        const auto group = linkedPoints(current, point, env);
        if (group.empty()) { continue; }
        markEdited(current, point, env, starts, ends);
        const double wanted = wantedMs(current, point);
        if (wanted == 0 || !std::isfinite(wanted)) { continue; }
        const bool follow = canFollowLinks(current, point, env);
        const auto beforeOverlap = overlaps(current.clips);
        const auto attempt = [&](double deltaMs) -> std::optional<ClipList> {
            if (point.kind == Kind::Ripple && !follow && group.size() > 1) { return std::nullopt; }
            EditDoc candidate = current;
            const size_t count = follow ? 1 : group.size();
            try {
                for (size_t j = 0; j < count; ++j) {
                    const auto& p = group[j];
                    auto next = candidate;
                    for (const auto& request : requestsFor(candidate, p, deltaMs, follow, env)) {
                        next.clips = env.edit ? env.edit(next, request) : plainEdgeEdit(next, request, env.targeting);
                    }
                    if (std::abs(movement(candidate, next, p) - deltaMs) > EPSILON_MS) { return std::nullopt; }
                    candidate = std::move(next);
                }
                if (!validEdit(current, candidate.clips, beforeOverlap, env)) { return std::nullopt; }
            } catch (const OpError&) {
                return std::nullopt;
            }
            return candidate.clips;
        };
        double applied = wanted;
        int appliedFrames = frameCount(wanted / frameDuration(env.fps));
        auto accepted = attempt(wanted);
        if (!accepted) {
            applied = 0;
            appliedFrames = 0;
            const double sign = wanted > 0 ? 1 : -1;
            // Two extra frames cover the rounded edge and the rounded grid origin.
            std::int64_t low = 0;
            std::int64_t high = static_cast<std::int64_t>(std::min(
                std::ceil(std::abs(wanted) / frameDuration(env.fps)) + 2,
                static_cast<double>(std::numeric_limits<int>::max()) + 2));
            while (high - low > 1) {
                const auto middle = low + (high - low) / 2;
                const double delta = frameMovement(current, point, sign * static_cast<double>(middle), env.fps);
                auto trial = std::abs(delta) <= std::abs(wanted) + EPSILON_MS ? attempt(delta) : std::nullopt;
                if (trial) {
                    low = middle;
                    applied = delta;
                    appliedFrames = frameCount(sign * static_cast<double>(middle));
                    accepted = std::move(trial);
                } else {
                    high = middle;
                }
            }
        }
        if (i == 0) {
            result.appliedMs = applied;
            result.appliedFrames = appliedFrames;
            result.atLimit = std::abs(applied - wanted) > EPSILON_MS;
        }
        if (accepted) { current.clips = std::move(*accepted); }
    }
    result.clips = std::move(current.clips);
    return result;
}
TrimResult nudgeFrames(const EditDoc& doc, const EditPoints& points, int frames, const Env& env) {
    auto result = trimBy(doc, points, [&](const EditDoc& current, const EditPoint& p) {
        return frameMovement(current, p, frames, env.fps);
    }, env);
    if (!points.empty() && !result.atLimit &&
        std::abs(result.appliedMs - frameMovement(doc, points.front(), frames, env.fps)) <= EPSILON_MS) {
        result.appliedFrames = frames;
    }
    return result;
}
TrimResult extendToPlayhead(const EditDoc& doc, const EditPoints& points, double playheadMs, const Env& env) {
    return trimBy(doc, points, [&](const EditDoc& current, const EditPoint& p) {
        return playheadMs - *editTimeMs(current, p);
    }, env);
}
EditPoints retargetForDrag(const EditDoc& doc, const EditPoints& points, DragSide side, const Env& env) {
    if (points.empty()) { return points; }
    const auto group = linkedPoints(doc, points.front(), env);
    if (group.empty() || std::ranges::any_of(points, [&](const auto& p) {
            return !std::ranges::any_of(group, [&](const auto& g) { return sameEdge(doc, p, g); });
        })) { return points; }
    const auto& primary = points.front();
    const auto [left, right] = sides(doc, primary);
    EditPoint target = primary;
    if (side == DragSide::Between) {
        if (left.isEmpty() || right.isEmpty()) { return points; }
        target = {left, true, Kind::Roll};
    } else {
        const bool out = side == DragSide::Outgoing;
        const auto& id = out ? left : right;
        if (id.isEmpty()) { return points; }
        target = {id, out, primary.kind == Kind::Roll ? Kind::Ripple : primary.kind};
    }
    const auto result = linkedPoints(doc, target, env);
    return result.empty() ? points : result;
}

MonitorInfo monitorInfo(const EditDoc& doc, const EditPoint& primary, double fps) {
    const auto [left, right] = sides(doc, primary);
    const auto side = [&](const QString& id, bool out) -> std::optional<MonitorSide> {
        const auto* clip = findClip(doc, id);
        if (!clip || isGroupClip(*clip)) { return std::nullopt; }
        const double frameMs = frameDuration(fps);
        const double first = std::ceil(clipStartMs(*clip) / frameMs - 1e-9);
        const double index = out ? std::max(first, std::ceil(clipEndMs(*clip) / frameMs - 1e-9) - 1) : first;
        const double time = index * frameMs;
        return MonitorSide{id, clip->value(u"name").toString(), clipTrackId(*clip),
                           clip->value(u"mediaType").toString(), time,
                           sourceIn(*clip) + (time - clipStartMs(*clip)) * sourceRate(*clip)};
    };
    MonitorInfo info;
    info.outgoing = side(left, true);
    info.incoming = side(right, false);
    info.outgoingMoves = info.outgoing.has_value() && (primary.out || primary.kind == Kind::Roll);
    info.incomingMoves = info.incoming.has_value() && (!primary.out || primary.kind == Kind::Roll);
    return info;
}
ShiftAnchor shiftAnchor(const EditDoc& doc, const EditPoint& primary) {
    const auto [left, right] = sides(doc, primary);
    ShiftAnchor anchor;
    if (const auto* clip = findClip(doc, left)) {
        anchor.outgoingClipId = left;
        anchor.outgoingSourceOutMs = sourceOut(*clip);
    }
    if (const auto* clip = findClip(doc, right)) {
        anchor.incomingClipId = right;
        anchor.incomingSourceInMs = sourceIn(*clip);
    }
    return anchor;
}
Shift shiftFrom(const EditDoc& doc, const ShiftAnchor& anchor, double fps) {
    Shift shift;
    if (const auto* clip = findClip(doc, anchor.outgoingClipId); clip && !isGroupClip(*clip)) {
        shift.outFrames = frameCount((sourceOut(*clip) - anchor.outgoingSourceOutMs) / sourceRate(*clip) / frameDuration(fps));
    }
    if (const auto* clip = findClip(doc, anchor.incomingClipId); clip && !isGroupClip(*clip)) {
        shift.inFrames = frameCount((sourceIn(*clip) - anchor.incomingSourceInMs) / sourceRate(*clip) / frameDuration(fps));
    }
    return shift;
}
LoopSpan playAround(double centerMs, double prerollMs, double postrollMs, double contentEndMs, double fps) {
    const double frameMs = frameDuration(fps);
    const double last = std::max(1.0, std::floor(std::max(contentEndMs, centerMs + frameMs) / frameMs + 1e-9));
    const double start = std::clamp(std::floor(std::max(0.0, centerMs - prerollMs) / frameMs + 0.5), 0.0, last - 1);
    const double end = std::clamp(std::floor((centerMs + postrollMs) / frameMs + 0.5), start + 1, last);
    return {start * frameMs, end * frameMs};
}

DynamicTrim::DynamicTrim(EditDoc base, EditPoints points, Env env)
    : m_base(std::move(base)), m_points(std::move(points)), m_env(std::move(env)), m_clips(m_base.clips) {}
double DynamicTrim::shuttle(int direction, double clockMs, bool slow) {
    if (m_committed) { return 0; }
    if (m_started) { tick(clockMs); }
    const double dir = direction < 0 ? -1 : 1;
    if (slow) {
        m_speed = 0.25 * dir;
    } else if (m_speed * dir > 0 && !m_atLimit) {
        m_speed = dir * std::min(8.0, std::abs(m_speed) * 2);
    } else {
        m_speed = dir;
    }
    m_started = true;
    m_anchorClockMs = clockMs;
    m_anchorOffset = m_offsetFrames;
    m_atLimit = false;
    return m_speed;
}
bool DynamicTrim::tick(double clockMs) {
    if (!m_started || m_committed || m_speed == 0) { return false; }
    // The small term keeps an exact whole frame from truncating to the one before.
    const double travelled = std::max(0.0, clockMs - m_anchorClockMs) * m_speed / frameDuration(m_env.fps);
    const int wanted = frameCount(m_anchorOffset + std::trunc(travelled + std::copysign(1e-9, travelled)));
    if (wanted == m_offsetFrames) { return false; }
    auto result = nudgeFrames(m_base, m_points, wanted, m_env);
    // Every point holds where the first stopped. A later point past it would move
    // back on the next press, when the offset starts again from the first point's.
    m_atLimit = result.atLimit || result.appliedFrames != wanted;
    const int reached = result.appliedFrames;
    if (m_atLimit) { result = nudgeFrames(m_base, m_points, reached, m_env); }
    const bool changed = result.clips != m_clips;
    m_clips = std::move(result.clips);
    m_offsetFrames = reached;
    if (m_atLimit) {
        m_speed = 0;
        m_anchorOffset = m_offsetFrames;
        m_anchorClockMs = clockMs;
    }
    return changed;
}
std::optional<double> DynamicTrim::editTime() const {
    if (m_points.empty()) { return std::nullopt; }
    auto doc = m_base;
    doc.clips = m_clips;
    return editTimeMs(doc, m_points.front());
}
std::optional<QString> DynamicTrim::commit() {
    if (m_committed) { return std::nullopt; }
    m_committed = true;
    m_speed = 0;
    // The clips decide, not the offset: a later point can move while the first is at its limit.
    if (m_clips == m_base.clips || m_points.empty()) { return std::nullopt; }
    switch (m_points.front().kind) {
    case Kind::Roll: return QStringLiteral("Dynamic rolling edit");
    case Kind::Ripple: return QStringLiteral("Dynamic ripple trim");
    case Kind::Trim: return QStringLiteral("Dynamic trim");
    }
    return std::nullopt;
}

}  // namespace nt::edit::trim
