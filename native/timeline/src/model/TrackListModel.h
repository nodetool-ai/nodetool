#pragma once

#include "model/TimelineTypes.h"

#include <QAbstractListModel>
#include <QtQmlIntegration/qqmlintegration.h>

// One row per track, sorted by `index` (row 0 is the top track). The `clips`
// role is a list of plain maps: the lanes only read it.
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
        ClipsRole,
    };

    explicit TrackListModel(QObject* parent = nullptr);

    void reset(const nt::Timeline* timeline);

    int rowCount(const QModelIndex& parent = QModelIndex()) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

private:
    const nt::Timeline* m_timeline = nullptr;
    std::vector<const nt::Track*> m_rows;
};
