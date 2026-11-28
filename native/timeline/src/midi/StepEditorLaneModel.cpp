#include "midi/StepEditorLaneModel.h"
#include <utility>

QVariant StepEditorLaneModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= m_lanes.size() || role != Qt::UserRole) {
        return {};
    }
    return m_lanes[index.row()];
}

void StepEditorLaneModel::setLanes(const QVariantList& lanes) {
    // A descriptor has only its type and pitch or lane ID. Keep equal prefixes
    // and suffixes. This is linear even when a whole lane set changes.
    int first = 0;
    const int oldSize = int(m_lanes.size());
    const int newSize = int(lanes.size());
    while (first < oldSize && first < newSize && m_lanes[first] == lanes[first]) {
        ++first;
    }
    int oldEnd = oldSize;
    int newEnd = newSize;
    while (oldEnd > first && newEnd > first && m_lanes[oldEnd - 1] == lanes[newEnd - 1]) {
        --oldEnd;
        --newEnd;
    }
    if (oldEnd > first) {
        beginRemoveRows({}, first, oldEnd - 1);
        m_lanes.remove(first, oldEnd - first);
        endRemoveRows();
    }
    if (newEnd > first) {
        beginInsertRows({}, first, newEnd - 1);
        QVariantList next;
        next.reserve(newSize);
        for (int i = 0; i < first; ++i) {
            next.append(m_lanes[i]);
        }
        for (int i = first; i < newEnd; ++i) {
            next.append(lanes[i]);
        }
        for (int i = first; i < m_lanes.size(); ++i) {
            next.append(m_lanes[i]);
        }
        m_lanes = std::move(next);
        endInsertRows();
    }
}
