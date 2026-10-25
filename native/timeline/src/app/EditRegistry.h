#pragma once
#include <QHash>
#include <QJsonObject>
#include <functional>

namespace nt::app {
using Edit = std::function<QJsonObject(QJsonObject, const QJsonObject&)>;
inline QHash<QString, Edit>& edits() {
    static QHash<QString, Edit> value;
    return value;
}
inline QHash<QString, Edit>& editOverrides() {
    static QHash<QString, Edit> value;
    return value;
}
inline bool overrideEdit(const QString& name, Edit edit) {
    if (name.isEmpty() || !edit || editOverrides().contains(name)) {
        return false;
    }
    editOverrides().insert(name, std::move(edit));
    return true;
}
inline bool registerEdit(const QString& name, Edit edit) {
    if (name.isEmpty() || !edit || edits().contains(name)) {
        return false;
    }
    edits().insert(name, std::move(edit));
    return true;
}
inline Edit findEdit(const QString& name) {
    const auto override = editOverrides().constFind(name);
    return override != editOverrides().cend() ? *override : edits().value(name);
}
}
