// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#include "takes/TakeSwitch.h"

#include "ai/Take.h"
#include "edit/ClipOps.h"

#include <QJsonArray>
#include <algorithm>

namespace nt::takes {
using nt::edit::ClipList;
using nt::edit::EditDoc;

namespace {
const QJsonObject* find(const ClipList& clips, const QString& id) {
    const auto it = std::ranges::find_if(clips, [&](const QJsonObject& clip) { return nt::edit::clipId(clip) == id; });
    return it == clips.end() ? nullptr : &*it;
}
bool hasTakes(const QJsonObject& clip) { return !selectableTakes(clip).isEmpty(); }
bool contains(const QJsonObject& clip, double timeMs) {
    return timeMs >= nt::edit::clipStartMs(clip) && timeMs < nt::edit::clipEndMs(clip);
}
// Clips first by the track order, then by document order.
QString topAtPlayhead(const EditDoc& doc, const Lookup& lookup, bool selectedOnly) {
    for (const auto& trackId : lookup.tracksTopDown) {
        if (!selectedOnly && !lookup.targetedTracks.count(trackId)) { continue; }
        for (const auto& clip : doc.clips) {
            if (nt::edit::clipTrackId(clip) != trackId || !contains(clip, lookup.timeMs) || !hasTakes(clip)) { continue; }
            if (selectedOnly && !lookup.selection.contains(nt::edit::clipId(clip))) { continue; }
            return nt::edit::clipId(clip);
        }
    }
    return {};
}
QString missingTake(const QJsonObject& clip, int index) {
    const auto count = selectableTakes(clip).size();
    return QStringLiteral("Take %1 does not exist. This clip has %2 %3.")
        .arg(index + 1).arg(count).arg(count == 1 ? QStringLiteral("take") : QStringLiteral("takes"));
}
// The refusal for this clip, or empty. A locked clip or track takes no edit.
QString refusal(const EditDoc& doc, const QJsonObject& clip, int index) {
    if (nt::edit::lockedUserTargetIds(doc).count(nt::edit::clipId(clip))) {
        return QStringLiteral("Unlock the clip to switch its take.");
    }
    if (index < 0 || index >= selectableTakes(clip).size()) { return missingTake(clip, index); }
    return {};
}
ClipList replaced(const ClipList& clips, const QJsonObject& clip) {
    ClipList next = clips;
    const auto it = std::ranges::find_if(next, [&](const QJsonObject& c) { return nt::edit::clipId(c) == nt::edit::clipId(clip); });
    if (it != next.end()) { *it = clip; }
    return next;
}
}

QList<QJsonObject> selectableTakes(const QJsonObject& clip) {
    QList<QJsonObject> takes;
    const auto versions = clip.value(u"versions").toArray();
    for (const auto& value : versions) {
        const auto take = value.toObject();
        if (take.value(u"status").toString() == u"success" && !take.value(u"assetId").toString().isEmpty()) {
            takes.append(take);
        }
    }
    return takes;
}

int activeTakeIndex(const QJsonObject& clip) {
    const auto takes = selectableTakes(clip);
    const auto active = clip.value(u"activeTakeId").toString();
    const auto asset = clip.value(u"currentAssetId").toString();
    int assetMatch = -1;
    int idMatch = -1;
    for (int i = 0; i < takes.size(); ++i) {
        const bool sameAsset = !asset.isEmpty() && takes[i].value(u"assetId").toString() == asset;
        const bool sameId = !active.isEmpty() && takes[i].value(u"id").toString() == active;
        if (sameAsset && sameId) { return i; }
        if (sameAsset && assetMatch < 0) { assetMatch = i; }
        if (sameId && idMatch < 0) { idMatch = i; }
    }
    return assetMatch >= 0 ? assetMatch : asset.isEmpty() ? idMatch : -1;
}

QString takeName(const QJsonObject& take, int number) {
    const auto label = take.value(u"label").toString().trimmed();
    return label.isEmpty() ? QStringLiteral("Take %1").arg(number) : label;
}

QString takeBadge(const QJsonObject& clip) {
    const auto count = selectableTakes(clip).size();
    if (count < 2) { return {}; }
    const int active = activeTakeIndex(clip);
    return QStringLiteral("%1/%2").arg(active < 0 ? QStringLiteral("–") : QString::number(active + 1)).arg(count);
}

double takeSourceMs(const QJsonObject& clip, const QString& takeId, double timeMs) {
    const auto applied = nt::ai::applyTake(clip, takeId);
    const auto& shown = applied.error.isEmpty() ? applied.clip : clip;
    const double start = nt::edit::clipStartMs(shown);
    const double local = std::clamp(timeMs, start, std::max(start, nt::edit::clipEndMs(shown))) - start;
    return shown.value(u"inPointMs").toDouble(0) + local * nt::edit::sourceRate(shown);
}

QStringList switchTargets(const EditDoc& doc, const Lookup& lookup) {
    QStringList selected;
    for (const auto& clip : doc.clips) {
        if (lookup.selection.contains(nt::edit::clipId(clip)) && hasTakes(clip)) { selected.append(nt::edit::clipId(clip)); }
    }
    if (!selected.isEmpty()) { return selected; }
    const auto top = topAtPlayhead(doc, lookup, false);
    return top.isEmpty() ? QStringList{} : QStringList{top};
}

QString cutTarget(const EditDoc& doc, const Lookup& lookup) {
    const auto selected = topAtPlayhead(doc, lookup, true);
    return selected.isEmpty() ? topAtPlayhead(doc, lookup, false) : selected;
}

TakeEdit switchTake(const EditDoc& doc, const QString& clipId, int index) {
    TakeEdit edit{doc.clips, {}, clipId, false};
    const auto* clip = find(doc.clips, clipId);
    if (!clip) { edit.error = QStringLiteral("The clip no longer exists."); return edit; }
    edit.error = refusal(doc, *clip, index);
    if (!edit.error.isEmpty() || activeTakeIndex(*clip) == index) { return edit; }
    const auto applied = nt::ai::applyTake(*clip, selectableTakes(*clip)[index].value(u"id").toString());
    if (!applied.error.isEmpty()) { edit.error = applied.error; return edit; }
    edit.clips = replaced(doc.clips, applied.clip);
    edit.changed = applied.clip != *clip;
    return edit;
}

TakeEdit cutToTake(const EditDoc& doc, const QString& clipId, double timeMs, int index, bool splitSameTake) {
    TakeEdit edit{doc.clips, {}, clipId, false};
    const auto* clip = find(doc.clips, clipId);
    if (!clip) { edit.error = QStringLiteral("The clip no longer exists."); return edit; }
    if (timeMs <= nt::edit::clipStartMs(*clip)) { return switchTake(doc, clipId, index); }
    if (timeMs >= nt::edit::clipEndMs(*clip)) { return edit; }
    edit.error = refusal(doc, *clip, index);
    if (!edit.error.isEmpty()) { return edit; }
    const bool sameTake = activeTakeIndex(*clip) == index;
    if (sameTake && !splitSameTake) { return edit; }
    const auto applied = nt::ai::applyTake(*clip, selectableTakes(*clip)[index].value(u"id").toString());
    if (!applied.error.isEmpty()) { edit.error = applied.error; return edit; }
    // Split the switched clip so the part after the cut stays at its place in
    // the take's source window. The part before keeps the clip as it was.
    auto switched = doc;
    switched.clips = replaced(doc.clips, sameTake ? *clip : applied.clip);
    QJsonObject left;
    try {
        left = nt::edit::splitClip(*clip, timeMs).first;
    } catch (const nt::edit::OpError&) {
        edit.error = QStringLiteral("This clip cannot be cut at the playhead.");
        return edit;
    }
    const auto split = nt::edit::splitSelectedAtPlayhead(switched, timeMs, {clipId});
    if (find(split.clips, clipId)) {
        edit.error = QStringLiteral("This clip cannot be cut at the playhead.");
        return edit;
    }
    nt::edit::IdSet known;
    for (const auto& c : doc.clips) { known.insert(nt::edit::clipId(c)); }
    edit.clips = split.clips;
    const auto track = nt::edit::clipTrackId(*clip);
    const double start = nt::edit::clipStartMs(*clip);
    for (auto& c : edit.clips) {
        if (known.count(nt::edit::clipId(c)) || nt::edit::clipTrackId(c) != track) { continue; }
        if (nt::edit::clipStartMs(c) == timeMs) {
            edit.resultId = nt::edit::clipId(c);
        } else if (nt::edit::clipStartMs(c) == start) {
            left.insert(QStringLiteral("id"), nt::edit::clipId(c));
            c = left;
        }
    }
    edit.changed = true;
    return edit;
}
}
