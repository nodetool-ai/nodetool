#include "model/TrackWindowModel.h"

#include "model/TrackListModel.h"
#include "ui/TimelineViewState.h"

#include <algorithm>
#include <cmath>
#include <unordered_set>

namespace nt {

TrackWindow visibleTrackWindow(const std::vector<double>& tops, const std::vector<double>& heights, double scrollTop,
                               double viewportHeight, int overscan) {
    const int n = static_cast<int>(tops.size());
    int low = 0;
    int high = n;
    while (low < high) {
        const int middle = (low + high) / 2;
        if (tops[middle] + heights[middle] <= scrollTop) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    const int start = std::max(0, low - overscan);
    low = start;
    high = n;
    const double viewportEnd = scrollTop + viewportHeight;
    while (low < high) {
        const int middle = (low + high) / 2;
        if (tops[middle] < viewportEnd) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    const int end = std::min(n, low + overscan);
    const double totalHeight = n ? tops[n - 1] + heights[n - 1] : 0.0;
    TrackWindow w;
    w.start = start;
    w.end = end;
    w.top = start < n ? tops[start] : totalHeight;
    w.bottom = totalHeight - (end < n ? tops[end] : totalHeight);
    return w;
}

}  // namespace nt

TrackWindowModel::TrackWindowModel(QObject* parent) : QAbstractListModel(parent) {}

void TrackWindowModel::setTracks(TrackListModel* tracks) {
    if (tracks == m_tracks) return;
    if (m_tracks) disconnect(m_tracks, nullptr, this, nullptr);
    m_tracks = tracks;
    if (m_tracks) {
        const auto rebuild = [this]() { resetRows(); };
        connect(m_tracks, &QAbstractItemModel::modelReset, this, rebuild);
        connect(m_tracks, &QAbstractItemModel::rowsInserted, this, rebuild);
        connect(m_tracks, &QAbstractItemModel::rowsRemoved, this, rebuild);
        connect(m_tracks, &TrackListModel::trackDocumentChanged, this, [this](int row) {
            for (int visible = 0; visible < rowCount(); ++visible) {
                if (sourceRow(visible) == row) { emit dataChanged(index(visible), index(visible), {TrackRole}); }
            }
        });
        connect(m_tracks, &QAbstractItemModel::dataChanged, this,
                [this](const QModelIndex& first, const QModelIndex& last, const QList<int>& roles) {
            const auto oldTops = m_tops;
            const auto oldHeights = m_heights;
            const bool layout = roles.isEmpty() || roles.contains(TrackListModel::HeightPxRole);
            if (layout) { relayout(); updateWindow(); }
            for (int row = 0; row < rowCount(); ++row) {
                const int sourceIndex = sourceRow(row);
                const auto source = static_cast<size_t>(sourceIndex);
                QList<int> affected;
                if (static_cast<int>(source) >= first.row() && static_cast<int>(source) <= last.row()) {
                    if (roles.isEmpty()) {
                        emit dataChanged(index(row), index(row), {});
                        continue;
                    }
                    affected = roles;
                    if (layout) { affected.append(BaseRowHeightRole); }
                }
                if (layout && oldTops[source] != m_tops[source]) { affected.append(RowTopRole); }
                if (layout && oldHeights[source] != m_heights[source]) { affected.append(RowHeightRole); }
                if (!affected.isEmpty()) { emit dataChanged(index(row), index(row), affected); }
            }
        });
    }
    resetRows();
    emit tracksChanged();
}

void TrackWindowModel::setViewState(TimelineViewState* view) {
    if (view == m_view) return;
    if (m_view) disconnect(m_view, nullptr, this, nullptr);
    m_view = view;
    if (m_view) {
        connect(m_view, &TimelineViewState::scrollTopPxChanged, this, &TrackWindowModel::updateWindow);
        connect(m_view, &TimelineViewState::viewportChanged, this, &TrackWindowModel::updateWindow);
        connect(m_view, &TimelineViewState::verticalZoomChanged, this, &TrackWindowModel::onVerticalZoomChanged);
        m_view->setContentHeightPx(m_contentHeight);
    }
    relayout();
    if (rowCount() > 0) emit dataChanged(index(0), index(rowCount() - 1));
    updateWindow();
    emit viewStateChanged();
}

void TrackWindowModel::setExtraRowHeights(const QVariantMap& heights) {
    if (heights == m_extraRowHeights) { return; }
    m_extraRowHeights = heights;
    relayout();
    updateWindow();
    if (rowCount() > 0) {
        emit dataChanged(index(0), index(rowCount() - 1), {RowTopRole, RowHeightRole});
    }
    emit extraRowHeightsChanged();
}

void TrackWindowModel::relayout() {
    m_poolViewport = -1;
    const double zoom = m_view ? m_view->verticalZoom() : 1.0;
    m_layoutZoom = zoom;
    const int n = m_tracks ? m_tracks->rowCount() : 0;
    m_tops.assign(static_cast<size_t>(n), 0.0);
    m_heights.assign(static_cast<size_t>(n), 0.0);
    double top = 0.0;
    for (int i = 0; i < n; ++i) {
        const auto source = m_tracks->index(i);
        const auto id = m_tracks->data(source, TrackListModel::TrackIdRole).toString();
        const double extra = m_extraRowHeights.value(id).toDouble();
        const double h = m_tracks->data(source, TrackListModel::HeightPxRole).toDouble() * zoom
            + (std::isfinite(extra) ? std::max(0.0, extra) : 0.0);
        m_tops[static_cast<size_t>(i)] = top;
        m_heights[static_cast<size_t>(i)] = h;
        top += h;
    }
    if (top != m_contentHeight) {
        m_contentHeight = top;
        emit contentHeightChanged();
    }
    if (m_view) m_view->setContentHeightPx(m_contentHeight);
    emit trackLayoutChanged();
}

void TrackWindowModel::onVerticalZoomChanged() {
    // Keep the row at the top of the viewport at the same relative offset as
    // the rows rescale (the vertical-zoom layout effect in TracksRegion.tsx).
    const std::vector<double> oldTops = m_tops;
    const std::vector<double> oldHeights = m_heights;
    const double oldTop = m_view ? m_view->scrollTopPx() : 0.0;
    relayout();
    if (rowCount() > 0) {
        emit dataChanged(index(0), index(rowCount() - 1), {RowTopRole, RowHeightRole, BaseRowHeightRole});
    }
    if (m_view && !oldTops.empty()) {
        const int row = nt::visibleTrackWindow(oldTops, oldHeights, oldTop, 0.0, 0).start;
        if (row < static_cast<int>(oldTops.size()) && oldHeights[static_cast<size_t>(row)] > 0.0) {
            const size_t r = static_cast<size_t>(row);
            const double nextTop = m_tops[r] + ((oldTop - oldTops[r]) / oldHeights[r]) * m_heights[r];
            m_view->setScrollTopPx(nextTop);
        }
    }
    updateWindow();
}

void TrackWindowModel::resetRows() {
    // relayout() can clamp the vertical scroll, and the scroll signal calls
    // updateWindow(): no row signals may go out between the reset signals.
    beginResetModel();
    m_resetting = true;
    m_window = {};
    m_sourceRows.clear();
    relayout();
    m_resetting = false;
    endResetModel();
    updateWindow();
}

void TrackWindowModel::updateWindow() {
    if (m_resetting) return;
    const double scrollTop = m_view ? m_view->scrollTopPx() : 0.0;
    const double viewport = m_view ? m_view->viewportHeightPx() : 0.0;
    const nt::TrackWindow next = nt::visibleTrackWindow(m_tops, m_heights, scrollTop, viewport);
    const nt::TrackWindow prev = m_window;
    if (!m_reuseRows && next.start == prev.start && next.end == prev.end) {
        m_window = next;
        return;
    }
    if (m_reuseRows) {
        updatePooledRows(next);
        m_window = next;
        if (next.start != prev.start || next.end != prev.end) {
            ++m_windowUpdates;
            emit windowChanged();
        }
        return;
    }
    const bool overlaps = next.start < prev.end && prev.start < next.end;
    if (!overlaps) {
        if (prev.end > prev.start) {
            beginRemoveRows({}, 0, prev.end - prev.start - 1);
            m_window.start = m_window.end = 0;
            endRemoveRows();
        }
        if (next.end > next.start) {
            beginInsertRows({}, 0, next.end - next.start - 1);
            m_window = next;
            endInsertRows();
        }
    } else {
        // Trim and extend each end; the rows in the overlap keep their delegates.
        if (next.start > prev.start) {
            beginRemoveRows({}, 0, next.start - prev.start - 1);
            m_window.start = next.start;
            endRemoveRows();
        }
        if (next.end < prev.end) {
            beginRemoveRows({}, next.end - m_window.start, prev.end - m_window.start - 1);
            m_window.end = next.end;
            endRemoveRows();
        }
        if (next.start < m_window.start) {
            beginInsertRows({}, 0, m_window.start - next.start - 1);
            m_window.start = next.start;
            endInsertRows();
        }
        if (next.end > m_window.end) {
            beginInsertRows({}, m_window.end - m_window.start, next.end - m_window.start - 1);
            m_window.end = next.end;
            endInsertRows();
        }
    }
    m_window = next;
    ++m_windowUpdates;
    emit windowChanged();
}

int TrackWindowModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : m_reuseRows ? static_cast<int>(m_sourceRows.size()) : m_window.end - m_window.start;
}

QVariant TrackWindowModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || !m_tracks || index.row() < 0 || index.row() >= rowCount()) return {};
    const int source = sourceRow(index.row());
    switch (role) {
    case RowTopRole: return m_tops[static_cast<size_t>(source)];
    case RowHeightRole: return m_heights[static_cast<size_t>(source)];
    case SourceRowRole: return source;
    case BaseRowHeightRole: return m_tracks->data(m_tracks->index(source), TrackListModel::HeightPxRole).toDouble() * m_layoutZoom;
    case TrackRole: {
        const auto* track = m_tracks->trackAt(source);
        return track ? track->raw.toVariantMap() : QVariantMap{};
    }
    default: return m_tracks->data(m_tracks->index(source), role);
    }
}

QHash<int, QByteArray> TrackWindowModel::roleNames() const {
    // Fixed, so a view that reads the roles before `tracks` is bound sees them.
    static const QHash<int, QByteArray> sourceRoles = TrackListModel().roleNames();
    QHash<int, QByteArray> roles = sourceRoles;
    roles.insert(RowTopRole, "rowTop");
    roles.insert(RowHeightRole, "rowHeight");
    roles.insert(SourceRowRole, "sourceRow");
    roles.insert(BaseRowHeightRole, "baseRowHeight");
    roles.insert(TrackRole, "track");
    return roles;
}

int TrackWindowModel::sourceRow(int row) const {
    return m_reuseRows ? m_sourceRows[static_cast<size_t>(row)] : m_window.start + row;
}
void TrackWindowModel::setReuseRows(bool value) {
    if (m_reuseRows == value) { return; }
    m_reuseRows = value;
    resetRows();
    emit reuseRowsChanged();
}
void TrackWindowModel::retainTrack(QObject* owner, const QString& id, bool retain) {
    if (!owner) { return; }
    if (retain && !id.isEmpty()) {
        connect(owner, &QObject::destroyed, this, &TrackWindowModel::releaseRetainedTrack, Qt::UniqueConnection);
        m_retainedTracks.insert(owner, id);
    } else {
        disconnect(owner, &QObject::destroyed, this, &TrackWindowModel::releaseRetainedTrack);
        releaseRetainedTrack(owner);
    }
}
void TrackWindowModel::releaseRetainedTrack(QObject* owner) {
    if (m_retainedTracks.remove(owner)) {
        QMetaObject::invokeMethod(this, &TrackWindowModel::updateWindow, Qt::QueuedConnection);
    }
}
void TrackWindowModel::updatePooledRows(const nt::TrackWindow& next) {
    std::unordered_set<int> needed;
    for (int source = next.start; source < next.end; ++source) { needed.insert(source); }
    if (m_view && m_poolViewport != m_view->viewportHeightPx()) {
        m_poolViewport = m_view->viewportHeightPx();
        // Reserve rows for both overscan edges and a partially visible row.
        // Hidden lanes keep their clip models detached until they enter.
        size_t end = 0, capacity = 0;
        for (size_t first = 0; first < m_tops.size(); ++first) {
            while (end < m_tops.size() && m_tops[end] < m_tops[first] + m_heights[first] + m_poolViewport) { ++end; }
            capacity = std::max(capacity, end - first + 6);
        }
        m_poolCapacity = std::min(static_cast<int>(m_tops.size()), static_cast<int>(capacity));
    }
    if (rowCount() < m_poolCapacity) {
        const int first = std::max(0, std::min(next.start, static_cast<int>(m_tops.size()) - m_poolCapacity));
        for (int source = first; source < first + m_poolCapacity; ++source) { needed.insert(source); }
    }
    const auto retainedValues = m_retainedTracks.values();
    const QSet<QString> retained(retainedValues.begin(), retainedValues.end());
    for (int source : m_sourceRows) {
        const auto id = m_tracks->data(m_tracks->index(source), TrackListModel::TrackIdRole).toString();
        if (retained.contains(id)) { needed.insert(source); }
    }
    std::vector<size_t> idle;
    for (size_t slot = 0; slot < m_sourceRows.size(); ++slot) {
        if (!needed.erase(m_sourceRows[slot])) { idle.push_back(slot); }
    }
    std::vector<int> incoming(needed.begin(), needed.end());
    std::ranges::sort(incoming);
    std::vector<int> changed;
    size_t used = 0;
    for (const int source : incoming) {
        if (used < idle.size()) {
            const auto slot = idle[used++];
            m_sourceRows[slot] = source;
            changed.push_back(static_cast<int>(slot));
        } else {
            const int slot = rowCount();
            beginInsertRows({}, slot, slot);
            m_sourceRows.push_back(source);
            endInsertRows();
        }
    }
    // Idle slots keep their last offscreen identity until another row needs
    // them. Clearing them here tears down content only to rebuild it later.
    // Publish after all slots have final identities, as LaneClipModel does.
    for (const int slot : changed) { emit dataChanged(index(slot), index(slot), roleNames().keys()); }
}

void TrackWindowModel::reportExtraHeight(const QString& id, double height) {
    if (id.isEmpty() || !std::isfinite(height) || extraHeight(id) == height) { return; }
    auto heights = m_extraRowHeights;
    heights.insert(id, height);
    setExtraRowHeights(heights);
}
