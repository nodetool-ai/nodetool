// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "FrameHoldController.h"
#include "FrameHold.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/targeting/TargetingEdits.h"
#include <algorithm>
#include <cmath>

namespace {
QVariantMap reply(const nt::framehold::Result& result, bool applied) {
    return {{"ok", result.ok() && applied}, {"unchanged", result.unchanged},
        {"error", result.ok() && !applied ? "No frame holds changed." : result.error},
        {"clipIds", result.ok() && applied ? result.clipIds : QStringList{}}};
}
nt::framehold::Result noTimeline() { return {{}, {}, "Open a timeline before adding a frame hold."}; }
QStringList changedHolds(const QJsonObject& before, const QJsonObject& after, double atMs) {
    QHash<QString, QJsonObject> old;
    for (const auto& value : before.value("clips").toArray()) {
        const auto c = value.toObject(); old.insert(nt::edit::clipId(c), c);
    }
    QStringList ids;
    for (const auto& value : after.value("clips").toArray()) {
        const auto c = value.toObject();
        if (nt::framehold::isHold(c) && nt::edit::clipStartMs(c) == atMs && old.value(nt::edit::clipId(c)) != c) {
            ids.append(nt::edit::clipId(c));
        }
    }
    return ids;
}
}
void FrameHoldController::setTimeline(TimelineModel* model) {
    if (m_timeline == model) { return; }
    m_timeline = model; emit timelineChanged();
}
QVariantMap FrameHoldController::add(const QStringList& ids, double atMs) {
    if (!m_timeline) { return reply(noTimeline(), false); }
    const auto before = m_timeline->timeline().raw;
    auto result = nt::framehold::addFrameHold(before, ids, atMs);
    if (!result.ok()) { return reply(result, false); }
    const bool applied = m_timeline->applyEdit("frameHold.add", {{"clipIds", QJsonArray::fromStringList(ids)}, {"atMs", atMs}});
    result.clipIds = changedHolds(before, m_timeline->timeline().raw, atMs);
    return reply(result, applied);
}
QVariantMap FrameHoldController::insertSegment(const QString& id, double atMs, double durationMs) {
    if (!m_timeline) { return reply(noTimeline(), false); }
    const auto before = m_timeline->timeline().raw;
    auto result = nt::framehold::insertFrameHoldSegment(before, id, atMs, durationMs);
    if (!result.ok()) { return reply(result, false); }
    const bool applied = m_timeline->applyEdit("frameHold.insertSegment", {{"clipId", id}, {"atMs", atMs}, {"durationMs", durationMs}});
    result.clipIds = changedHolds(before, m_timeline->timeline().raw, atMs);
    return reply(result, applied);
}
QVariantMap FrameHoldController::setOptions(const QVariantMap& request) {
    if (!m_timeline) { return reply(noTimeline(), false); }
    auto result = nt::framehold::setFrameHoldOptions(m_timeline->timeline().raw,
        {request.value("clipIds").toStringList(), request.value("enabled", true).toBool(),
            request.value("holdOn", "in").toString(), request.value("playheadMs").toDouble(), request.value("timeMs").toDouble()});
    if (!result.ok()) { return reply(result, false); }
    return reply(result, m_timeline->applyEdit("frameHold.options", QJsonObject::fromVariantMap(request)));
}
QVariantMap FrameHoldController::clipJson(const QString& id) const {
    if (!m_timeline) { return {}; }
    for (const auto& value : m_timeline->timeline().raw.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == id) { return value.toObject().toVariantMap(); }
    }
    return {};
}
double FrameHoldController::holdSourceMs(const QString& id) const {
    const auto clip = QJsonObject::fromVariantMap(clipJson(id));
    return nt::framehold::isHold(clip) ? nt::framehold::sourceMsAt(clip, nt::edit::clipStartMs(clip)) : -1;
}
QStringList FrameHoldController::targetsAt(const QStringList& selection, double atMs) const {
    if (!m_timeline || !std::isfinite(atMs)) { return {}; }
    const auto& raw = m_timeline->timeline().raw;
    const auto doc = nt::edit::structure::editDocument(raw);
    nt::edit::IdSet across;
    for (const auto& c : doc.clips) {
        if (c.value("mediaType") == "video" && nt::edit::clipStartMs(c) <= atMs && atMs < nt::edit::clipEndMs(c)) {
            across.insert(nt::edit::clipId(c));
        }
    }
    const auto editable = nt::edit::editableUserTargets(doc, across, true, false);
    QStringList selected;
    nt::edit::IdSet seen;
    for (const auto& id : selection) {
        const int index = doc.indexOf(id);
        if (index >= 0 && editable.contains(id) && seen.insert(id).second) { selected.append(id); }
    }
    if (!selected.isEmpty()) { return selected; }
    const auto targeted = nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
    std::vector<QJsonObject> tracks;
    for (const auto& value : raw.value("tracks").toArray()) { tracks.push_back(value.toObject()); }
    std::stable_sort(tracks.begin(), tracks.end(), [](const auto& a, const auto& b) {
        return a.value("index").toDouble() < b.value("index").toDouble();
    });
    QHash<QString, QString> topByTrack;
    for (const auto& c : doc.clips) {
        if (editable.contains(nt::edit::clipId(c))) { topByTrack.insert(nt::edit::clipTrackId(c), nt::edit::clipId(c)); }
    }
    for (const auto& t : tracks) {
        const auto id = t.value("id").toString();
        if (targeted.contains(id) && nt::edit::clipFitsTrack("video", t.value("type").toString()) && topByTrack.contains(id)) {
            return {topByTrack.value(id)};
        }
    }
    return {};
}
