#include "model/TrackListModel.h"

#include <algorithm>
#include <map>

namespace {

QString trackTypeName(nt::TrackType type) {
    switch (type) {
    case nt::TrackType::Video: return QStringLiteral("video");
    case nt::TrackType::Audio: return QStringLiteral("audio");
    case nt::TrackType::Overlay: return QStringLiteral("overlay");
    case nt::TrackType::Subtitle: return QStringLiteral("subtitle");
    case nt::TrackType::Midi: return QStringLiteral("midi");
    case nt::TrackType::Chord: return QStringLiteral("chord");
    }
    return QStringLiteral("video");
}

}  // namespace

TrackListModel::TrackListModel(QObject* parent) : QAbstractListModel(parent) {}

namespace {

std::vector<const nt::Track*> sortedTracks(const nt::Timeline* timeline) {
    std::vector<const nt::Track*> rows;
    if (timeline) {
        for (const auto& t : timeline->tracks) {
            rows.push_back(&t);
        }
        std::stable_sort(rows.begin(), rows.end(),
                         [](const nt::Track* a, const nt::Track* b) { return a->index < b->index; });
    }
    return rows;
}

}  // namespace

void TrackListModel::reset(const nt::Timeline* timeline) {
    beginResetModel();
    m_timeline = timeline;
    m_rows = sortedTracks(timeline);
    // `buildTypedIndexMap` counts in document order, not row order.
    m_typedIndex.assign(m_rows.size(), 1);
    if (timeline) {
        std::map<nt::TrackType, int> counters;
        std::map<const nt::Track*, int> byTrack;
        for (const auto& t : timeline->tracks) {
            byTrack[&t] = ++counters[t.type];
        }
        for (size_t i = 0; i < m_rows.size(); ++i) {
            m_typedIndex[i] = byTrack[m_rows[i]];
        }
    }
    endResetModel();
}

void TrackListModel::rebind(const nt::Timeline* timeline) {
    m_timeline = timeline;
    m_rows = sortedTracks(timeline);
}

const nt::Track* TrackListModel::trackAt(int row) const {
    return row >= 0 && row < rowCount() ? m_rows[static_cast<size_t>(row)] : nullptr;
}

int TrackListModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : static_cast<int>(m_rows.size());
}

QVariant TrackListModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= rowCount()) {
        return {};
    }
    const nt::Track& t = *m_rows[static_cast<size_t>(index.row())];
    switch (role) {
    case TrackIdRole: return QString::fromStdString(t.id);
    case NameRole: return QString::fromStdString(t.name);
    case TypeRole: return trackTypeName(t.type);
    case IndexRole: return t.index;
    case VisibleRole: return t.visible;
    case LockedRole: return t.locked;
    case MutedRole: return t.muted;
    case SoloRole: return t.raw.value(QStringLiteral("solo")).toBool(false);
    case HeightPxRole: return t.raw.value(QStringLiteral("heightPx")).toDouble(64.0);
    case TypedIndexRole: return m_typedIndex[static_cast<size_t>(index.row())];
    default: return {};
    }
}

QHash<int, QByteArray> TrackListModel::roleNames() const {
    return {
        {TrackIdRole, "trackId"},  {NameRole, "name"},     {TypeRole, "trackType"},
        {IndexRole, "trackIndex"}, {VisibleRole, "trackVisible"}, {LockedRole, "locked"},
        {MutedRole, "muted"},      {SoloRole, "solo"},       {HeightPxRole, "heightPx"},
        {TypedIndexRole, "typedIndex"},
    };
}
