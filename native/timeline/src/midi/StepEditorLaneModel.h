#pragma once
#include <QAbstractListModel>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

// UI thread only. QML parents and owns this descriptor model. Event edits do
// not reset its rows, so scrolling keeps the delegates and their canvases.
class StepEditorLaneModel : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
public:
    using QAbstractListModel::QAbstractListModel;
    int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : int(m_lanes.size()); }
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override { return {{Qt::UserRole, "lane"}}; }
    Q_INVOKABLE void setLanes(const QVariantList& lanes);
private:
    QVariantList m_lanes;
};
