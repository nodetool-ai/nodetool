#pragma once
#include <QDebug>
#include <QHash>
#include <QJsonObject>
#include <QList>
#include <functional>
#include <source_location>

namespace nt::app {
using Edit = std::function<QJsonObject(QJsonObject, const QJsonObject&)>;
struct EditRegistration {
    QString name;
    QString registrar;
    bool override = false;
};
struct EditRefusal {
    EditRegistration attempted;
    QString existingRegistrar;
    QString reason;
};
namespace detail {
inline QList<EditRegistration>& registrations() {
    static QList<EditRegistration> value;
    return value;
}
inline QList<EditRefusal>& refusals() {
    static QList<EditRefusal> value;
    return value;
}
inline QString registrar(const std::source_location& location) {
    auto file = QString::fromUtf8(location.file_name());
    file.replace('\\', '/');
    const auto src = file.lastIndexOf("/src/");
    if (src >= 0) {
        file = file.mid(src + 1);
    }
    return file + ':' + QString::number(location.line());
}
inline bool recordEdit(const QString& name, const Edit& edit, bool override, bool duplicate,
                       const std::source_location& location) {
    const EditRegistration attempt{name, registrar(location), override};
    if (!name.isEmpty() && edit && !duplicate) {
        registrations().append(attempt);
        return true;
    }
    QString existing;
    for (const auto& record : registrations()) {
        if (record.name == name && record.override == override) {
            existing = record.registrar;
            break;
        }
    }
    const QString reason = name.isEmpty() ? "empty name" : !edit ? "empty edit" : "duplicate";
    refusals().append({attempt, existing, reason});
    qWarning().noquote() << "Refused edit:" << name << "from" << attempt.registrar
                         << "existing:" << existing << "reason:" << reason;
    return false;
}
} // namespace detail
inline const QList<EditRegistration>& editRegistrations() { return detail::registrations(); }
inline const QList<EditRefusal>& editRefusals() { return detail::refusals(); }
inline QHash<QString, Edit>& edits() {
    static QHash<QString, Edit> value;
    return value;
}
inline QHash<QString, Edit>& editOverrides() {
    static QHash<QString, Edit> value;
    return value;
}
inline bool overrideEdit(const QString& name, Edit edit,
                         std::source_location location = std::source_location::current()) {
    if (!detail::recordEdit(name, edit, true, editOverrides().contains(name), location)) {
        return false;
    }
    editOverrides().insert(name, std::move(edit));
    return true;
}
inline bool registerEdit(const QString& name, Edit edit,
                         std::source_location location = std::source_location::current()) {
    if (!detail::recordEdit(name, edit, false, edits().contains(name), location)) {
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
