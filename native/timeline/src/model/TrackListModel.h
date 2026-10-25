#pragma once

#include "model/TimelineTypes.h"

#include <QAbstractListModel>
#include <QtQmlIntegration/qqmlintegration.h>

// One row per track, sorted by `index` (row 0 is the top track). The clips of
// a row come from a `LaneClipModel`, and the visible rows from a
// `TrackWindowModel` (DESIGN.md D27, D28).
class TrackListModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Owned by TimelineModel")

public:
    enum Role {
        TrackIdRole = Qt::UserRole + 1,
        NameRole,
        TypeRole,
        IndexRole,
        VisibleRole,
        LockedRole,
        MutedRole,
        SoloRole,
        HeightPxRole,  // `trackRowHeightPx`: the authored `heightPx`, default 64
        TypedIndexRole,  // 1-based index within the track type (V1, A1)
    };

    explicit TrackListModel(QObject* parent = nullptr);

    void reset(const nt::Timeline* timeline);
    // The same tracks in a new snapshot (a clip edit): no row changes.
    void rebind(const nt::Timeline* timeline);
    const nt::Track* trackAt(int row) const;

    int rowCount(const QModelIndex& parent = QModelIndex()) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

private:
    const nt::Timeline* m_timeline = nullptr;
    std::vector<const nt::Track*> m_rows;
    std::vector<int> m_typedIndex;
};
