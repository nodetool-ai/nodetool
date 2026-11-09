#include "AssetListModel.h"
#include <QSet>

namespace {
QString rowId(const QJsonValue& value) { return value.toObject().value("id").toString(); }
bool uniqueIds(const QJsonArray& rows) {
    QSet<QString> ids;
    ids.reserve(rows.size());
    for (const auto& value : rows) { ids.insert(rowId(value)); }
    return ids.size() == rows.size();
}
}

int AssetListModel::rowCount(const QModelIndex& parent) const {
    return parent.isValid() ? 0 : count();
}

QVariant AssetListModel::data(const QModelIndex& index, int role) const {
    if (!checkIndex(index, CheckIndexOption::IndexIsValid | CheckIndexOption::ParentIsInvalid)) { return {}; }
    const auto row = m_rows.at(index.row()).toObject();
    switch (role) {
    case AssetRole: return row.toVariantMap();
    case IdRole: return row.value("id").toString();
    case NameRole: return row.value("name").toString();
    case ContentTypeRole: return row.value("content_type").toString();
    default: return {};
    }
}

QHash<int, QByteArray> AssetListModel::roleNames() const {
    return {{AssetRole, "asset"}, {IdRole, "assetId"}, {NameRole, "name"}, {ContentTypeRole, "contentType"}};
}

QVariantMap AssetListModel::get(const QString& id) const {
    const auto row = indexOf(id);
    return row < 0 ? QVariantMap{} : m_rows.at(row).toObject().toVariantMap();
}

int AssetListModel::indexOf(const QString& id) const {
    if (id.isEmpty()) { return -1; }
    for (qsizetype i = 0; i < m_rows.size(); ++i) {
        if (rowId(m_rows.at(i)) == id) { return static_cast<int>(i); }
    }
    return -1;
}

bool AssetListModel::apply(const QJsonArray& next, bool reset) {
    if (next == m_rows) { return false; }
    const auto oldCount = m_rows.size();
    if (reset || m_rows.isEmpty() || next.isEmpty() || !uniqueIds(next) || !uniqueIds(m_rows)) {
        beginResetModel();
        m_rows = next;
        endResetModel();
    } else {
        QSet<QString> wanted;
        wanted.reserve(next.size());
        for (const auto& value : next) { wanted.insert(rowId(value)); }
        // Remove rows that left, in contiguous runs from the end.
        for (auto i = m_rows.size() - 1; i >= 0;) {
            if (wanted.contains(rowId(m_rows.at(i)))) { --i; continue; }
            auto first = i;
            while (first > 0 && !wanted.contains(rowId(m_rows.at(first - 1)))) { --first; }
            beginRemoveRows({}, static_cast<int>(first), static_cast<int>(i));
            for (auto k = i; k >= first; --k) { m_rows.removeAt(k); }
            endRemoveRows();
            i = first - 1;
        }
        QSet<QString> present;
        present.reserve(m_rows.size());
        for (const auto& value : m_rows) { present.insert(rowId(value)); }
        for (qsizetype i = 0; i < next.size(); ++i) {
            const auto id = rowId(next.at(i));
            if (!present.contains(id)) {
                // Insert the run of new rows that starts here in one step.
                auto last = i;
                while (last + 1 < next.size() && !present.contains(rowId(next.at(last + 1)))) { ++last; }
                beginInsertRows({}, static_cast<int>(i), static_cast<int>(last));
                for (auto k = i; k <= last; ++k) {
                    m_rows.insert(k, next.at(k));
                    present.insert(rowId(next.at(k)));
                }
                endInsertRows();
                i = last;
                continue;
            }
            if (rowId(m_rows.at(i)) != id) {
                qsizetype from = i + 1;
                while (rowId(m_rows.at(from)) != id) { ++from; }
                beginMoveRows({}, static_cast<int>(from), static_cast<int>(from), {}, static_cast<int>(i));
                m_rows.insert(i, m_rows.takeAt(from));
                endMoveRows();
            }
            if (m_rows.at(i) != next.at(i)) {
                m_rows[i] = next.at(i);
                const auto changed = index(static_cast<int>(i));
                emit dataChanged(changed, changed);
            }
        }
    }
    if (m_rows.size() != oldCount) { emit countChanged(); }
    ++m_revision;
    emit revisionChanged();
    return true;
}
