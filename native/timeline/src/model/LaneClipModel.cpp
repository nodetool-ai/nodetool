#include "model/LaneClipModel.h"

#include "model/TimelineModel.h"
#include "ui/TimelineViewState.h"

#include "takes/TakeSwitch.h"
#include <algorithm>
#include <QScopedValueRollback>
#include <limits>
#include <utility>
#include <unordered_set>
#include <unordered_map>

namespace {

QString mediaTypeName(nt::MediaType type) {
    switch (type) {
    case nt::MediaType::Image: return QStringLiteral("image");
    case nt::MediaType::Video: return QStringLiteral("video");
    case nt::MediaType::Audio: return QStringLiteral("audio");
    case nt::MediaType::Overlay: return QStringLiteral("overlay");
    case nt::MediaType::Text: return QStringLiteral("text");
    case nt::MediaType::Shape: return QStringLiteral("shape");
    case nt::MediaType::Model3d: return QStringLiteral("model3d");
    case nt::MediaType::Group: return QStringLiteral("group");
    case nt::MediaType::Adjustment: return QStringLiteral("adjustment");
    case nt::MediaType::Midi: return QStringLiteral("midi");
    }
    return QStringLiteral("video");
}

}  // namespace

LaneClipModel::LaneClipModel(QObject* parent) : QAbstractListModel(parent) {}

void LaneClipModel::setTimeline(TimelineModel* timeline) {
    if (timeline == m_timeline) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = timeline;
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::changed, this, [this](const ChangeSet& changes) {
            if (!changes.fullReplacement && changes.clips.isEmpty() && !changes.clipsStructural) {
                rebase();
                return;
            }
            if (!m_timeline->trackClipIndexChanged(m_trackId) && rebase()) { return; }
            rebuildClips();
            recompute();
        });
    }
    rebuildClips();
    recompute();
    emit timelineChanged();
}

void LaneClipModel::setTrackId(const QString& id) {
    if (id == m_trackId) return;
    m_trackId = id;
    rebuildClips();
    recompute();
    emit trackIdChanged();
}

void LaneClipModel::setViewState(TimelineViewState* view) {
    if (view == m_view) return;
    if (m_view) disconnect(m_view, nullptr, this, nullptr);
    m_view = view;
    if (m_view) {
        connect(m_view, &TimelineViewState::clipWindowChanged, this, &LaneClipModel::recompute);
    }
    recompute();
    emit viewStateChanged();
}

void LaneClipModel::setPinnedClipId(const QString& id) {
    if (id == m_pinned) return;
    m_pinned = id;
    recompute();
    emit pinnedClipIdChanged();
}

void LaneClipModel::setDetailPinnedClipId(const QString& id) {
    if (id == m_detailPinned) { return; }
    m_detailPinned = id;
    recompute();
    emit detailPinnedClipIdChanged();
}

void LaneClipModel::setReuseDelegates(bool reuse) {
    if (m_reuseDelegates == reuse) { return; }
    beginResetModel();
    m_rows.clear();
    m_reuseDelegates = reuse;
    endResetModel();
    recompute();
    emit reuseDelegatesChanged();
}

// Keep occupied slots at their existing indices, including the gesture pin.
// Only departed clips' slots can be rebound. The pool grows to the window's
// high-water mark, never to the document size, and is owned by the lane.
void LaneClipModel::updatePool(const std::vector<const nt::Clip*>& next, bool newSnapshot,
                               const std::unordered_set<std::string>& restacked) {
    const size_t capacity = std::max(size_t{16}, next.size() * 2);
    if (m_rows.size() > capacity && m_pinned.isEmpty() && m_detailPinned.isEmpty()) {
        beginResetModel();
        m_rows = next;
        endResetModel();
        return;
    }
    std::unordered_map<std::string, const nt::Clip*> remaining;
    for (const auto* clip : next) { remaining.emplace(clip->id, clip); }
    std::vector<size_t> idle;
    QHash<int, QList<int>> changed;
    const auto allRoles = roleNames().keys();
    for (size_t row = 0; row < m_rows.size(); ++row) {
        const auto* previous = m_rows[row];
        const auto found = remaining.find(previous->id);
        if (found == remaining.end()) {
            idle.push_back(row);
            continue;
        }
        const auto* clip = found->second;
        if (newSnapshot && (previous->raw != clip->raw || previous->mediaPath != clip->mediaPath ||
                            previous->audioPath != clip->audioPath || restacked.contains(clip->id))) {
            QList<int> roles;
            for (const auto role : allRoles) {
                const auto before = data(index(static_cast<int>(row)), role);
                m_rows[row] = clip;
                const auto after = data(index(static_cast<int>(row)), role);
                m_rows[row] = previous;
                if (before != after) { roles.append(role); }
            }
            if (restacked.contains(clip->id) && !roles.contains(StackingIndexRole)) { roles.append(StackingIndexRole); }
            if (!roles.isEmpty()) {
                changed.insert(static_cast<int>(row), roles);
                ++m_dataChangedRows;
            }
        }
        m_rows[row] = clip;
        remaining.erase(found);
    }
    size_t free = 0;
    std::vector<const nt::Clip*> appended;
    for (const auto* clip : next) {
        if (!remaining.contains(clip->id)) { continue; }
        if (free < idle.size()) {
            const auto row = idle[free++];
            m_rows[row] = clip;
            changed.insert(static_cast<int>(row), allRoles);
        } else {
            appended.push_back(clip);
        }
    }
    for (; free < idle.size(); ++free) {
        const auto row = idle[free];
        if (m_rows[row] == &m_idleClip) { continue; }
        m_rows[row] = &m_idleClip;
        changed.insert(static_cast<int>(row), allRoles);
    }
    // Every existing slot is final before observers can read another row.
    if (!appended.empty()) {
        const int first = rowCount();
        beginInsertRows({}, first, first + static_cast<int>(appended.size()) - 1);
        m_rows.insert(m_rows.end(), appended.begin(), appended.end());
        endInsertRows();
    }
    for (auto it = changed.cbegin(); it != changed.cend(); ++it) {
        emit dataChanged(index(it.key()), index(it.key()), it.value());
    }
}

bool LaneClipModel::rebase() {
    if (!m_snapshot || m_snapshotNext!=m_snapshot) { return false; }
    const auto next=m_timeline->snapshot();
    // The shared index already proved this lane's membership and values unchanged.
    // Rebind by ID so insertion/removal in another lane cannot invalidate offsets.
    for (const auto* c : m_clips) { if (c != &m_idleClip && !next->findClip(c->id)) { return false; } }
    for (const auto* c : m_rows) { if (c != &m_idleClip && !next->findClip(c->id)) { return false; } }
    for (auto& c : m_clips) { if (c != &m_idleClip) { c=next->findClip(c->id); } }
    for (auto& c : m_rows) { if (c != &m_idleClip) { c=next->findClip(c->id); } }
    m_snapshot=next;
    m_snapshotNext=next;
    return true;
}

void LaneClipModel::rebuildClips() {
    ++m_rebuildCount;
    m_snapshotNext = m_timeline ? m_timeline->snapshot() : nullptr;
    const auto beforeCount = m_clips.size();
    auto previousIndices = std::move(m_stackingIndices);
    m_stackingIndices.clear();
    m_clips.clear();
    m_prefixMaxEnd.clear();
    if (!m_snapshotNext || m_trackId.isEmpty()) {
        if (beforeCount != 0) { emit countChanged(); }
        return;
    }
    for (const auto i : m_timeline->trackClipIndices(m_trackId)) {
        ++m_rebuildClipVisits;
        const auto* clip = &m_snapshotNext->clips[i];
        const int order = static_cast<int>(m_clips.size());
        m_stackingIndices.emplace(clip->id, order);
        const auto old = previousIndices.find(clip->id);
        if (old != previousIndices.end() && old->second != order) { m_restackedIds.insert(clip->id); }
        m_clips.push_back(clip);
    }
    double maxEnd = -std::numeric_limits<double>::infinity();
    for (const nt::Clip* c : m_clips) {
        maxEnd = std::max(maxEnd, c->endMs());
        m_prefixMaxEnd.push_back(maxEnd);
    }
    if (beforeCount != m_clips.size()) { emit countChanged(); }
}

void LaneClipModel::recompute() {
    if (m_recomputing) {
        m_recomputePending = true;
        return;
    }
    const QScopedValueRollback<bool> updating(m_recomputing, true);
    do {
        m_recomputePending = false;
        recomputeRows();
    } while (m_recomputePending);
}

void LaneClipModel::recomputeRows() {
    ++m_recomputes;
    // Signals can change the pin or replace the timeline. Retain this GUI
    // snapshot until every notification for its rows has finished.
    const auto incomingSnapshot = m_snapshotNext;
    const auto restacked = std::exchange(m_restackedIds, {});
    // The clips to show, in start order.
    std::vector<const nt::Clip*> next;
    if (m_view) {
        const nt::ui::ClipWindow w=m_view->clipWindow();
        const size_t first=static_cast<size_t>(std::lower_bound(m_prefixMaxEnd.begin(),m_prefixMaxEnd.end(),w.startMs)-m_prefixMaxEnd.begin());
        for (size_t i=first; i<m_clips.size(); ++i) {
            ++m_windowVisits;
            const auto* c=m_clips[i];
            if (c->startMs>=w.endMs) { break; }
            if (nt::ui::clipInWindow(c->startMs,c->durationMs,w)) { next.push_back(c); }
        }
        // Resolve the pin by ID, then search only its owning lane's sorted index.
        for (const auto& id : {m_pinned, m_detailPinned}) {
            const auto* pin=m_timeline && !id.isEmpty() ? m_timeline->findClip(id) : nullptr;
            if (pin && pin->trackId==m_trackId.toStdString()) {
                const auto it=std::lower_bound(m_clips.begin(),m_clips.end(),pin->startMs,
                    [](const nt::Clip* c,double ms) { return c->startMs<ms; });
                for (auto at=it; at!=m_clips.end() && (*at)->startMs==pin->startMs; ++at) {
                    ++m_windowVisits;
                    if ((*at)->id!=pin->id) { continue; }
                    if (std::ranges::find(next,*at)==next.end()) {
                        const auto where=std::lower_bound(next.begin(),next.end(),*at,[](const nt::Clip* a,const nt::Clip* b) {
                            return a->startMs<b->startMs || (a->startMs==b->startMs && a<b);
                        });
                        next.insert(where,*at);
                    }
                    break;
                }
            }
        }
    } else {
        next = m_clips;
    }

    const bool newSnapshot = incomingSnapshot != m_snapshot;
    // The rows point into the old snapshot until step 2 replaces them.
    const std::shared_ptr<const nt::Timeline> keepAlive = m_snapshot;
    const int before = rowCount();

    if (m_reuseDelegates) {
        updatePool(next, newSnapshot, restacked);
        m_snapshot = incomingSnapshot;
        if (rowCount() != before) { emit countChanged(); }
        emit recomputed();
        return;
    }

    // 1. Remove the rows whose clip left.
    std::unordered_set<std::string> nextIds;
    for (const nt::Clip* c : next) nextIds.insert(c->id);
    for (int i = static_cast<int>(m_rows.size()) - 1; i >= 0;) {
        if (nextIds.count(m_rows[static_cast<size_t>(i)]->id)) {
            --i;
            continue;
        }
        int j = i;
        while (j > 0 && !nextIds.count(m_rows[static_cast<size_t>(j - 1)]->id)) --j;
        beginRemoveRows({}, j, i);
        m_rows.erase(m_rows.begin() + j, m_rows.begin() + i + 1);
        endRemoveRows();
        i = j - 1;
    }
    // The kept rows now read the new snapshot; the old one may be released.
    m_snapshot = incomingSnapshot;

    // 2. Walk the new order: keep, move, or insert each clip. A kept clip
    // whose JSON or resolved media changed sends dataChanged; an unchanged
    // clip sends nothing, so its delegate does no work.
    QHash<int, QList<int>> changedRows;
    const auto compareRoles = [this, &changedRows, &restacked](int row, const nt::Clip* next, int destination) {
        const auto* previous = m_rows[static_cast<size_t>(row)];
        QList<int> roles;
        const auto names = roleNames();
        for (auto it = names.cbegin(); it != names.cend(); ++it) {
            const auto before = data(index(row), it.key());
            m_rows[static_cast<size_t>(row)] = next;
            const auto after = data(index(row), it.key());
            m_rows[static_cast<size_t>(row)] = previous;
            if (before != after) { roles.append(it.key()); }
        }
        if (restacked.contains(next->id)) { roles.append(StackingIndexRole); }
        if (!roles.isEmpty()) { changedRows.insert(destination, roles); }
    };
    for (size_t pos = 0; pos < next.size(); ++pos) {
        const nt::Clip* c = next[pos];
        if (pos < m_rows.size() && m_rows[pos]->id == c->id) {
            if (newSnapshot && (m_rows[pos]->raw != c->raw || m_rows[pos]->mediaPath != c->mediaPath ||
                                m_rows[pos]->audioPath != c->audioPath || restacked.contains(c->id))) {
                compareRoles(static_cast<int>(pos), c, static_cast<int>(pos));
            }
            m_rows[pos] = c;
            continue;
        }
        auto it = std::find_if(m_rows.begin() + static_cast<long>(pos), m_rows.end(),
                               [&](const nt::Clip* r) { return r->id == c->id; });
        if (it != m_rows.end()) {
            const int from = static_cast<int>(it - m_rows.begin());
            if (newSnapshot && ((*it)->raw != c->raw || (*it)->mediaPath != c->mediaPath ||
                                (*it)->audioPath != c->audioPath || restacked.contains(c->id))) {
                compareRoles(from, c, static_cast<int>(pos));
            }
            beginMoveRows({}, from, from, {}, static_cast<int>(pos));
            m_rows.erase(it);
            m_rows.insert(m_rows.begin() + static_cast<long>(pos), c);
            endMoveRows();
            continue;
        }
        beginInsertRows({}, static_cast<int>(pos), static_cast<int>(pos));
        m_rows.insert(m_rows.begin() + static_cast<long>(pos), c);
        endInsertRows();
    }
    for (auto it = changedRows.cbegin(); it != changedRows.cend(); ++it) {
        emit dataChanged(index(it.key()), index(it.key()), it.value());
    }
    m_dataChangedRows += static_cast<int>(changedRows.size());
    if (rowCount() != before) emit countChanged();
    emit recomputed();
}

QStringList LaneClipModel::clipIds() const {
    QStringList ids;
    for (const nt::Clip* c : m_rows) {
        if (c != &m_idleClip) { ids.append(QString::fromStdString(c->id)); }
    }
    return ids;
}

int LaneClipModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_rows.size());
}

QVariant LaneClipModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) return {};
    const nt::Clip& c = *m_rows[static_cast<size_t>(index.row())];
    const auto activeTake = [&c] {
        QJsonObject byAsset;
        for (const auto& value : c.raw.value("versions").toArray()) {
            const auto take = value.toObject();
            if (take.value("assetId") != c.raw.value("currentAssetId")) { continue; }
            if (take.value("id") == c.raw.value("activeTakeId")) { return take; }
            if (byAsset.isEmpty()) { byAsset = take; }
        }
        return byAsset;
    };
    switch (role) {
    case StackingIndexRole: {
        const auto order = m_stackingIndices.find(c.id);
        return order == m_stackingIndices.end() ? 0 : order->second;
    }
    case TakeBadgeRole: return nt::takes::takeBadge(c.raw);
    case ActiveTakeLabelRole: return activeTake().value("label").toString();
    case HasActiveTakeRole: return !activeTake().isEmpty();
    case ActiveTakeDriftingRole: return activeTake().value("musicGeneration").toObject().value("alignment").toObject().value("drifting").toBool();
    case LabelColorRole: return c.raw.value("labelColor").toString();
    case LoopLengthMsRole: return c.raw.value("loopLengthMs").toDouble();
    case SpeedMultiplierRole: return c.speedMultiplier;
    case SpeedBakedRole: return c.speedBaked;
    case HasEffectsRole: return !c.raw.value("effects").toArray().isEmpty();
    case HasAnimationsRole: return !c.raw.value("animations").toArray().isEmpty();
    case HasTimeRemapRole: return c.raw.value("timeRemap").isObject();
    case AudioRoleRole: return c.raw.value("audioRole").toString();
    case ClipIdRole: return QString::fromStdString(c.id);
    case NameRole: return QString::fromStdString(c.name);
    case StartMsRole: return c.startMs;
    case DurationMsRole: return c.durationMs;
    case MediaTypeRole: return mediaTypeName(c.mediaType);
    case HiddenRole: return c.hidden;
    case LockedRole: return c.raw.value(QStringLiteral("locked")).toBool(false);
    case StatusRole: return c.raw.value(QStringLiteral("status")).toString();
    case FadeInMsRole: return c.fadeInMs;
    case FadeOutMsRole: return c.fadeOutMs;
    case FadeInShapeRole: return QString::fromStdString(c.fadeInShape.empty() ? "linear" : c.fadeInShape);
    case FadeOutShapeRole: return QString::fromStdString(c.fadeOutShape.empty() ? "linear" : c.fadeOutShape);
    case TransitionTypeRole: return c.transitionIn ? QString::fromStdString(c.transitionIn->type) : QString();
    case TransitionMsRole: return c.transitionIn ? c.transitionIn->durationMs : 0.0;
    case MediaSourceRole:
        return QString::fromStdString(c.mediaType == nt::MediaType::Audio && !c.audioPath.empty() ? c.audioPath
                                                                                                   : c.mediaPath);
    case InPointMsRole: return c.inPointMs;
    case SourceOutMsRole: {
        const QJsonValue out = c.raw.value(QStringLiteral("outPointMs"));
        if (out.isDouble()) return out.toDouble();
        const double rate = c.speedBaked ? 1.0 : std::max(0.0001, c.speedMultiplier);
        return c.inPointMs + c.durationMs * rate;
    }
    default: return {};
    }
}

QHash<int, QByteArray> LaneClipModel::roleNames() const {
    return {
        {StackingIndexRole, "stackingIndex"},
        {LabelColorRole, "labelColor"},
        {LoopLengthMsRole, "loopLengthMs"},
        {SpeedMultiplierRole, "speedMultiplier"},
        {SpeedBakedRole, "speedBaked"},
        {HasEffectsRole, "hasEffects"},
        {HasAnimationsRole, "hasAnimations"},
        {HasTimeRemapRole, "hasTimeRemap"},
        {AudioRoleRole, "audioRole"},
        {TakeBadgeRole, "takeBadge"},
        {ActiveTakeLabelRole, "activeTakeLabel"},
        {HasActiveTakeRole, "hasActiveTake"},
        {ActiveTakeDriftingRole, "activeTakeDrifting"},
        {ClipIdRole, "clipId"},
        {NameRole, "name"},
        {StartMsRole, "startMs"},
        {DurationMsRole, "durationMs"},
        {MediaTypeRole, "mediaType"},
        {HiddenRole, "hidden"},
        {LockedRole, "locked"},
        {StatusRole, "status"},
        {FadeInMsRole, "fadeInMs"},
        {FadeOutMsRole, "fadeOutMs"},
        {FadeInShapeRole, "fadeInShape"},
        {FadeOutShapeRole, "fadeOutShape"},
        {TransitionTypeRole, "transitionType"},
        {TransitionMsRole, "transitionMs"},
        {MediaSourceRole, "mediaSource"},
        {InPointMsRole, "inPointMs"},
        {SourceOutMsRole, "sourceOutMs"},
    };
}
