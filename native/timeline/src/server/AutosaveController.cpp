#include "server/AutosaveController.h"

#include "server/AssetCache.h"

#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QUndoStack>

#include <cstdio>

namespace nt::server {

QJsonObject documentForSave(const QJsonObject& raw) {
    QJsonObject doc = raw;
    // The sequence row, not the document (`timelineSequenceResponse` minus
    // `timelineDocument`). The size, rate and name are not edited here.
    for (const char* key : {"id", "projectId", "workflowId", "name", "fps", "width", "height", "durationMs",
                            "createdAt", "updatedAt"}) {
        doc.remove(QLatin1String(key));
    }
    return doc;
}

AutosaveController::AutosaveController(SaveTarget target, QUndoStack* undo, DocumentFn document,
                                       QString baseUpdatedAt, QObject* parent)
    : QObject(parent),
      m_target(std::move(target)),
      m_undo(undo),
      m_document(std::move(document)),
      m_base(std::move(baseUpdatedAt)),
      m_client(std::make_unique<ServerClient>(m_target.server, m_target.token)) {
    m_timer.setSingleShot(true);
    m_timer.setInterval(750);  // D34
    connect(&m_timer, &QTimer::timeout, this, [this]() {
        if (m_autosave && dirty() && !m_conflict && !m_saving) saveNow();
    });
    connect(m_undo, &QUndoStack::indexChanged, this, [this]() {
        scheduleSave();
        emit stateChanged();
    });
    connect(m_undo, &QUndoStack::cleanChanged, this, &AutosaveController::stateChanged);
}

bool AutosaveController::dirty() const { return !m_undo->isClean(); }

void AutosaveController::setAutosave(bool on) {
    m_autosave = on;
    if (!on) m_timer.stop();
}

void AutosaveController::scheduleSave() {
    if (m_autosave && !m_conflict) m_timer.start();  // restarts: 750 ms after the last command
}

QString AutosaveController::writeCopy(const QString& suffix, const QJsonObject& doc) const {
    if (m_target.backupDir.isEmpty()) return {};
    QDir().mkpath(m_target.backupDir);
    const QString path =
        QDir(m_target.backupDir).filePath(safePathPart(m_target.timelineId) + u'.' + suffix + QStringLiteral(".json"));
    QSaveFile f(path);
    if (!f.open(QIODevice::WriteOnly)) return {};
    const QByteArray bytes = QJsonDocument(doc).toJson(QJsonDocument::Indented);
    if (f.write(bytes) != bytes.size()) {
        f.cancelWriting();
        return {};
    }
    return f.commit() ? path : QString();
}

SaveResult AutosaveController::saveNow() {
    SaveResult result;
    if (m_saving) {
        result.error = QStringLiteral("a save is in flight");
        return result;
    }
    if (m_conflict) {
        result.conflict = true;
        result.error = QStringLiteral("a conflict is open; the local document is kept");
        return result;
    }
    if (m_base.isEmpty()) {
        // Without a base the server would take the save whatever it holds.
        result.error = QStringLiteral("no baseUpdatedAt: refusing to save over the server copy");
        m_lastError = result.error;
        emit stateChanged();
        return result;
    }
    m_saving = true;
    emit stateChanged();
    const int indexAtSend = m_undo->index();
    const QJsonObject raw = m_document();
    const QJsonObject input{{QStringLiteral("id"), m_target.timelineId},
                            {QStringLiteral("baseUpdatedAt"), m_base},
                            {QStringLiteral("document"), documentForSave(raw)}};
    const QueryResult r = m_client->mutate(QStringLiteral("timeline.update"), input);
    m_saving = false;
    if (r.ok()) {
        const QJsonObject data = r.data.toObject();
        result.ok = true;
        result.updatedAt = data.value(u"updatedAt").toString();
        for (const QJsonValue& p : data.value(u"stripped").toArray()) result.stripped << p.toString();
        m_base = result.updatedAt;
        m_lastError.clear();
        m_stripped = result.stripped;
        if (!result.stripped.isEmpty()) {
            // D4: the server dropped these; the sent document keeps them.
            result.keptCopy = writeCopy(QStringLiteral("stripped"), raw);
            std::fprintf(stderr, "save: warning: the server dropped %d field(s): %s; sent document kept in %s\n",
                         static_cast<int>(result.stripped.size()), qPrintable(result.stripped.join(u", ")),
                         qPrintable(result.keptCopy));
            emit strippedWarning(result.stripped);
        }
        // An edit made while the save was in flight is not in the server copy.
        if (m_undo->index() == indexAtSend) {
            m_undo->setClean();
        } else {
            scheduleSave();
        }
        emit saved(result.updatedAt);
        emit stateChanged();
        return result;
    }
    if (r.error.apiCode == u"ALREADY_EXISTS" || r.error.code == u"CONFLICT") {
        m_conflict = true;
        m_timer.stop();
        result.conflict = true;
        result.error = r.error.message;
        result.keptCopy = writeCopy(QStringLiteral("local"), raw);
        m_lastError = QStringLiteral("conflict: %1").arg(r.error.message);
        std::fprintf(stderr, "save: conflict: the server copy changed since the load; local document kept in %s\n",
                     qPrintable(result.keptCopy));
        emit conflictDetected();
        emit stateChanged();
        return result;
    }
    result.error = r.describe();
    m_lastError = result.error;
    emit stateChanged();
    return result;
}

}  // namespace nt::server
