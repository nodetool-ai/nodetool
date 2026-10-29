#include "model/LaneClipModel.h"

#include "model/TimelineModel.h"
#include "ui/TimelineViewState.h"

#include <algorithm>
#include <limits>
#include <unordered_set>

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
        connect(m_timeline, &TimelineModel::clipsChanged, this, [this]() {
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

void LaneClipModel::rebuildClips() {
    m_snapshotNext = m_timeline ? m_timeline->snapshot() : nullptr;
    m_clips.clear();
    m_prefixMaxEnd.clear();
    if (!m_snapshotNext || m_trackId.isEmpty()) return;
    const std::string track = m_trackId.toStdString();
    for (const auto& c : m_snapshotNext->clips) {
        if (c.trackId == track) m_clips.push_back(&c);
    }
    std::stable_sort(m_clips.begin(), m_clips.end(),
                     [](const nt::Clip* a, const nt::Clip* b) { return a->startMs < b->startMs; });
    double maxEnd = -std::numeric_limits<double>::infinity();
    for (const nt::Clip* c : m_clips) {
        maxEnd = std::max(maxEnd, c->endMs());
        m_prefixMaxEnd.push_back(maxEnd);
    }
}

void LaneClipModel::recompute() {
    ++m_recomputes;
    // The clips to show, in start order.
    std::vector<const nt::Clip*> next;
    const std::string pinned = m_pinned.toStdString();
    bool pinnedIn = pinned.empty();
    if (m_view) {
        const nt::ui::ClipWindow w = m_view->clipWindow();
        // Clips before `first` all end before the window.
        const size_t first = static_cast<size_t>(
            std::lower_bound(m_prefixMaxEnd.begin(), m_prefixMaxEnd.end(), w.startMs) - m_prefixMaxEnd.begin());
        for (size_t i = pinned.empty() ? first : 0; i < m_clips.size(); ++i) {
            const nt::Clip* c = m_clips[i];
            const bool inWindow = i >= first && nt::ui::clipInWindow(c->startMs, c->durationMs, w);
            const bool isPinned = !pinned.empty() && c->id == pinned;
            if (inWindow || isPinned) {
                next.push_back(c);
                pinnedIn = pinnedIn || isPinned;
            }
            // Past the window end only the pinned clip can still be kept.
            if (i >= first && c->startMs >= w.endMs && (pinnedIn || pinned.empty())) break;
        }
    } else {
        next = m_clips;
    }

    const bool newSnapshot = m_snapshotNext != m_snapshot;
    // The rows point into the old snapshot until step 2 replaces them.
    const std::shared_ptr<const nt::Timeline> keepAlive = m_snapshot;
    const int before = rowCount();

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
    m_snapshot = m_snapshotNext;

    // 2. Walk the new order: keep, move, or insert each clip. A kept clip
    // whose JSON or resolved media changed sends dataChanged; an unchanged
    // clip sends nothing, so its delegate does no work.
    std::vector<int> changedRows;
    for (size_t pos = 0; pos < next.size(); ++pos) {
        const nt::Clip* c = next[pos];
        if (pos < m_rows.size() && m_rows[pos]->id == c->id) {
            if (newSnapshot && (m_rows[pos]->raw != c->raw || m_rows[pos]->mediaPath != c->mediaPath ||
                                m_rows[pos]->audioPath != c->audioPath)) {
                changedRows.push_back(static_cast<int>(pos));
            }
            m_rows[pos] = c;
            continue;
        }
        auto it = std::find_if(m_rows.begin() + static_cast<long>(pos), m_rows.end(),
                               [&](const nt::Clip* r) { return r->id == c->id; });
        if (it != m_rows.end()) {
            const int from = static_cast<int>(it - m_rows.begin());
            if (newSnapshot && ((*it)->raw != c->raw || (*it)->mediaPath != c->mediaPath ||
                                (*it)->audioPath != c->audioPath)) {
                changedRows.push_back(static_cast<int>(pos));
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
    for (int row : changedRows) emit dataChanged(index(row), index(row));
    m_dataChangedRows += static_cast<int>(changedRows.size());
    if (rowCount() != before) emit countChanged();
    emit recomputed();
}

QStringList LaneClipModel::clipIds() const {
    QStringList ids;
    for (const nt::Clip* c : m_rows) ids.append(QString::fromStdString(c->id));
    return ids;
}

int LaneClipModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_rows.size());
}

QVariant LaneClipModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) return {};
    const nt::Clip& c = *m_rows[static_cast<size_t>(index.row())];
    switch (role) {
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
