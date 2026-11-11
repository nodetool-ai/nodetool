#pragma once
#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
#include <QVariantMap>

// The rows of the current Library folder. apply() changes only the rows that differ,
// so views keep their delegates, thumbnails and scroll position across server polls.
class AssetListModel : public QAbstractListModel {
    Q_OBJECT
    Q_PROPERTY(int count READ count NOTIFY countChanged)
    // Increments on every change to the rows, for bindings that read through get().
    Q_PROPERTY(int revision READ revision NOTIFY revisionChanged)
public:
    enum Role { AssetRole = Qt::UserRole + 1, IdRole, NameRole, ContentTypeRole };
    using QAbstractListModel::QAbstractListModel;
    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    int count() const { return static_cast<int>(m_rows.size()); }
    int revision() const { return m_revision; }
    const QJsonArray& rows() const { return m_rows; }
    Q_INVOKABLE QVariantMap get(const QString& id) const;
    Q_INVOKABLE int indexOf(const QString& id) const;
    // Returns true when the rows changed. reset replaces every row in one model reset.
    bool apply(const QJsonArray& next, bool reset = false);
signals:
    void countChanged();
    void revisionChanged();
private:
    QJsonArray m_rows;
    int m_revision = 0;
};
