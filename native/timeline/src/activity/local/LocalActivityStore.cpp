#include "LocalActivityStore.h"
#include "server/ServerSource.h"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLockFile>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUuid>
#include <cmath>

namespace nt::activity {
QString localScope(const QJsonObject& document) {
    const auto project = document.value("projectId").toString(document.value("project_id").toString());
    const auto timeline = document.value("id").toString();
    QString identity = QStringLiteral("file");
    if (const auto target = nt::server::serverSaveTarget()) {
        const nt::server::ServerClient client(target->server, target->token);
        identity = client.serverKey() + u'/' + client.userKey() + u'/' + target->expectedInstance;
    }
    const auto scope = identity + u'/' + (project.isEmpty() ? QStringLiteral("timeline/") + timeline : QStringLiteral("project/") + project);
    return QString::fromLatin1(QCryptographicHash::hash(scope.toUtf8(), QCryptographicHash::Sha256).toHex());
}
LocalActivityStore::LocalActivityStore(QString root, QObject* parent) : QObject(parent), m_root(std::move(root)) {}
LocalActivityStore& LocalActivityStore::instance() {
    static auto* store = [] {
        auto root = qEnvironmentVariable("NODETOOL_TIMELINE_ACTIVITY_DIR");
        if (root.isEmpty()) {
            const auto preferences = qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES");
            const auto base = preferences.isEmpty() ? QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
                                                    : QFileInfo(preferences).absolutePath();
            root = QDir(base).filePath("activity/local");
        }
        return new LocalActivityStore(root, QCoreApplication::instance());
    }();
    return *store;
}
QString LocalActivityStore::path(const QString& scope) const {
    return QDir(m_root).filePath(QString::fromLatin1(QCryptographicHash::hash(scope.toUtf8(), QCryptographicHash::Sha256).toHex()) + QStringLiteral(".json"));
}
void LocalActivityStore::load(const QString& scope) {
    if (m_rows.contains(scope)) { return; }
    m_rows.insert(scope, {});
    QFile file(path(scope));
    if (!file.exists()) { return; }
    if (!file.open(QIODevice::ReadOnly)) {
        m_unreadableScopes.insert(scope);
        m_error = QStringLiteral("Cannot read local render history: %1").arg(file.errorString());
        return;
    }
    QJsonParseError parse;
    const auto document = QJsonDocument::fromJson(file.readAll(), &parse);
    const auto raw = document.object();
    if (parse.error != QJsonParseError::NoError || raw.value("version").toInt() != 1 || raw.value("scope").toString() != scope || !raw.value("rows").isArray()) {
        m_unreadableScopes.insert(scope);
        m_error = QStringLiteral("Local render history is invalid. The existing file has been kept.");
        return;
    }
    auto& rows = m_rows[scope];
    for (const auto& value : raw.value("rows").toArray()) {
        auto row = value.toObject().toVariantMap();
        const auto id = row.value("id").toString();
        if (id.isEmpty() || row.value("source").toString() != u"Local" || row.value("kind").toString() != u"Render") { continue; }
        row.insert("cancellable", false);
        rows.append(row);
    }
}
QVariantList LocalActivityStore::rows(const QString& scope) {
    load(scope);
    auto result = m_rows.value(scope);
    for (auto& value : result) {
        auto row = value.toMap();
        const auto id = row.value("id").toString();
        if (row.value("status").toString() == "running" && !m_scopes.contains(id)) {
            row.insert("status", "unobserved");
            row.insert("detail", "Result unknown: this app session is not attached to the render.");
            row.insert("cancellable", false);
        }
        value = row;
    }
    return result;
}
void LocalActivityStore::save(const QString& scope) {
    if (m_unreadableScopes.contains(scope)) { return; }
    if (!QDir().mkpath(m_root)) {
        m_error = QStringLiteral("Cannot create the local render history folder.");
        return;
    }
    QLockFile lock(path(scope) + QStringLiteral(".lock"));
    if (!lock.tryLock(1000)) {
        m_error = QStringLiteral("Local render history is busy in another app session. This update has not been saved.");
        return;
    }
    QFile existing(path(scope));
    if (existing.exists()) {
        if (!existing.open(QIODevice::ReadOnly)) {
            m_error = QStringLiteral("Cannot read local render history before saving: %1").arg(existing.errorString());
            return;
        }
        QJsonParseError parse;
        const auto saved = QJsonDocument::fromJson(existing.readAll(), &parse).object();
        if (parse.error != QJsonParseError::NoError || saved.value("version").toInt() != 1 ||
            saved.value("scope").toString() != scope || !saved.value("rows").isArray()) {
            m_unreadableScopes.insert(scope);
            m_error = QStringLiteral("Local render history is invalid. The existing file has been kept.");
            return;
        }
        auto& rows = m_rows[scope];
        QHash<QString, qsizetype> indices;
        for (qsizetype index = 0; index < rows.size(); ++index) {
            indices.insert(rows.at(index).toMap().value("id").toString(), index);
        }
        const auto terminal = [](const QString& status) {
            return status == "completed" || status == "failed" || status == "cancelled";
        };
        for (const auto& value : saved.value("rows").toArray()) {
            const auto disk = value.toObject().toVariantMap();
            const auto id = disk.value("id").toString();
            if (id.isEmpty() || disk.value("source").toString() != "Local" || disk.value("kind").toString() != "Render") { continue; }
            const auto found = indices.constFind(id);
            if (found == indices.cend()) {
                indices.insert(id, rows.size());
                rows.append(disk);
                continue;
            }
            const auto memory = rows.at(*found).toMap();
            const auto diskTime = disk.value("updatedAt").toString();
            const auto memoryTime = memory.value("updatedAt").toString();
            if (diskTime > memoryTime || (diskTime == memoryTime && terminal(disk.value("status").toString()) && !terminal(memory.value("status").toString()))) {
                rows[*found] = disk;
            }
        }
        existing.close();
    }
    QSaveFile file(path(scope));
    const auto bytes = QJsonDocument(QJsonObject{{"version", 1}, {"scope", scope}, {"rows", QJsonArray::fromVariantList(m_rows.value(scope))}}).toJson(QJsonDocument::Compact);
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        m_error = QStringLiteral("Cannot save local render history: %1").arg(file.errorString());
    } else {
        m_error.clear();
    }
}
QString LocalActivityStore::begin(const QString& scope, const QString& title, QObject* target, const QString& output) {
    load(scope);
    const auto id = QUuid::createUuid().toString(QUuid::Id128);
    m_scopes.insert(id, scope);
    m_targets.insert(id, target);
    const auto now = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
    m_rows[scope].prepend(QVariantMap{{"id", id}, {"title", title}, {"kind", "Render"}, {"source", "Local"},
        {"output", output}, {"status", "running"}, {"detail", "Preparing"}, {"progress", -1.0}, {"cost", "Not reported"},
        {"cancellable", target != nullptr}, {"createdAt", now}, {"updatedAt", now}});
    save(scope);
    emit changed();
    return id;
}
void LocalActivityStore::progress(const QString& id, const QString& phase, double ratio) {
    if (!m_scopes.contains(id)) { return; }
    const auto scope = m_scopes.value(id);
    for (auto& item : m_rows[scope]) {
        auto row = item.toMap();
        if (row.value("id").toString() != id) { continue; }
        row.insert("detail", phase);
        row.insert("progress", std::isfinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : -1.0);
        item = row;
        break;
    }
    // Progress is transient. The durable running entry is enough to recover an interrupted render.
    emit changed();
}
void LocalActivityStore::finish(const QString& id, bool success, bool cancelled, const QString& error) {
    if (!m_scopes.contains(id)) { return; }
    const auto scope = m_scopes.take(id);
    m_targets.remove(id);
    for (auto& item : m_rows[scope]) {
        auto row = item.toMap();
        if (row.value("id").toString() != id) { continue; }
        row.insert("status", success ? "completed" : cancelled ? "cancelled" : "failed");
        row.insert("detail", success ? row.value("output").toString() : error);
        row.insert("cancellable", false);
        const auto now = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
        row.insert("finishedAt", now);
        row.insert("updatedAt", now);
        item = row;
        break;
    }
    save(scope);
    emit changed();
}
bool LocalActivityStore::cancel(const QString& id) {
    const auto target = m_targets.value(id);
    if (!target) { return false; }
    return QMetaObject::invokeMethod(target, "cancel", Qt::DirectConnection);
}
}
