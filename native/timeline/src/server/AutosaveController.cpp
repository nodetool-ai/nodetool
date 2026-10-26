#include "server/AutosaveController.h"

#include "server/AssetCache.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUndoStack>
#include <QUuid>

#include <algorithm>
#include <cstdio>

namespace nt::server {
namespace {

QByteArray contentHash(const QJsonObject& document) {
    return QCryptographicHash::hash(QJsonDocument(document).toJson(QJsonDocument::Compact), QCryptographicHash::Sha256);
}

// No answer, a server error or throttling: worth another try. A conflict or
// a rejected document is not.
bool transient(const QueryResult& r) {
    if (r.error.code == u"WRONG_SERVER") return false;  // never written, never retried
    const int status = r.error.httpStatus;
    return r.error.code == u"NETWORK" || r.error.code == u"TIMEOUT" || r.error.code == u"TOO_MANY_REQUESTS" ||
           r.error.code == u"INTERNAL_SERVER_ERROR" || status == 0 || status == 429 || status >= 500;
}

}  // namespace

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
    m_client->setExpectedInstance(m_target.expectedInstance);
    m_ackHash = currentHash();  // the loaded content is what the server holds
    m_committedHash = m_ackHash;
    const QString appData = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    if (!appData.isEmpty()) m_fallbackDirs << QDir(appData).filePath(QStringLiteral("recovery"));
    m_fallbackDirs << QDir(QDir::tempPath()).filePath(QStringLiteral("nodetool-timeline-recovery"));
    findEarlierCopies();
    m_timer.setSingleShot(true);
    m_timer.setInterval(750);  // D34
    connect(&m_timer, &QTimer::timeout, this, &AutosaveController::debounceExpired);
    m_retry.setSingleShot(true);
    connect(&m_retry, &QTimer::timeout, this, [this]() {
        if (dirty() && !m_conflict && !m_saving) saveNow();
    });
    connect(m_undo, &QUndoStack::indexChanged, this, &AutosaveController::documentChanged);
    connect(m_undo, &QUndoStack::cleanChanged, this, &AutosaveController::stateChanged);
}

QByteArray AutosaveController::currentHash() const { return contentHash(documentForSave(m_document())); }

bool AutosaveController::dirty() const { return currentHash() != m_ackHash; }

QString AutosaveController::keptCopy() const {
    return contentHash(m_document()) == m_copyHash ? m_keptCopy : QString();
}

QString AutosaveController::recoveryError() const {
    if (!m_keptCopy.isEmpty() && keptCopy().isEmpty()) {
        return QStringLiteral("the recovery copy does not contain the current document");
    }
    return m_recoveryError;
}

void AutosaveController::syncClean() {
    if (m_syncing) return;
    m_syncing = true;
    if (!dirty()) {
        m_undo->setClean();
    } else if (m_undo->isClean()) {
        m_undo->resetClean();  // this index's content is not the saved content
    }
    m_syncing = false;
}

void AutosaveController::documentChanged() {
    if (m_syncing) return;
    m_committedHash = currentHash();
    syncClean();
    scheduleSave();
    emit stateChanged();
}

void AutosaveController::setAutosave(bool on) {
    m_autosave = on;
    if (!on) m_timer.stop();
}

void AutosaveController::scheduleSave() {
    if (m_autosave) m_timer.start();  // restarts: 750 ms after the last command
}

void AutosaveController::debounceExpired() {
    if (!m_autosave || m_saving) return;
    if (currentHash() != m_committedHash) {
        // replaceClips previews emit no undo notification. Cancellation also
        // emits none, so keep checking until the committed content returns.
        m_timer.start();
        return;
    }
    syncClean();
    if (m_conflict) {
        keepConflictCopy();
    } else if (dirty()) {
        saveNow();
    }
    emit stateChanged();
}

QStringList AutosaveController::copyDirs() const {
    QStringList dirs;
    if (!m_target.backupDir.isEmpty()) dirs << m_target.backupDir;
    for (const auto& root : m_fallbackDirs) {
        dirs << QDir(root).filePath(safePathPart(m_client->serverKey()) + u'/' + safePathPart(m_client->userKey()));
    }
    dirs.removeDuplicates();
    return dirs;
}

void AutosaveController::findEarlierCopies() {
    const QString stem = safePathPart(m_target.timelineId);
    QSet<QString> found(m_earlierCopies.cbegin(), m_earlierCopies.cend());
    for (const auto& dir : copyDirs()) {
        for (const auto& kind : {QStringLiteral("recovery"), QStringLiteral("local")}) {
            const QString prefix = stem + u'.' + kind;
            const QString path = QDir(dir).filePath(prefix + QStringLiteral(".json"));
            if (QFileInfo(path).isFile() && !m_sessionCopies.contains(path) && !found.contains(path)) {
                const QString archived = QDir(dir).filePath(prefix + u'.' +
                    QDateTime::currentDateTimeUtc().toString(QStringLiteral("yyyyMMddTHHmmsszzz")) + u'.' +
                    QUuid::createUuid().toString(QUuid::Id128) + QStringLiteral(".json"));
                if (QFile::rename(path, archived)) {
                    m_earlierCopies << archived;
                    found.insert(archived);
                } else {
                    // Refuse to overwrite or remove the original if moving
                    // it failed. It can still be restored or discarded.
                    m_earlierCopies << path;
                    found.insert(path);
                    m_earlierCopyError = QStringLiteral("Could not move the earlier copy: %1").arg(path);
                }
            }
            const auto archives = QDir(dir).entryList({prefix + QStringLiteral(".*.json")}, QDir::Files, QDir::Name);
            for (const auto& file : archives) {
                const QString archived = QDir(dir).filePath(file);
                if (!found.contains(archived)) {
                    m_earlierCopies << archived;
                    found.insert(archived);
                }
            }
        }
    }
}

void AutosaveController::setQuitFallbackDirs(const QStringList& dirs) {
    m_fallbackDirs = dirs;
    findEarlierCopies();
    emit stateChanged();
}

bool AutosaveController::restoreEarlierCopy(QObject* timeline) {
    const auto fail = [this](const QString& error) {
        m_earlierCopyError = error;
        emit stateChanged();
        return false;
    };
    if (!timeline || earlierCopy().isEmpty() || m_saving || currentHash() != m_committedHash) {
        return fail(QStringLiteral("The earlier copy cannot be restored during an edit or save."));
    }
    QFile file(earlierCopy());
    if (!file.open(QIODevice::ReadOnly)) return fail(file.errorString());
    QJsonParseError error{};
    const auto json = QJsonDocument::fromJson(file.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !json.isObject()) {
        return fail(QStringLiteral("The earlier copy is not a timeline document."));
    }
    const auto raw = json.object();
    if (!raw.value("clips").isArray() || !raw.value("tracks").isArray() ||
        (!raw.value("id").toString().isEmpty() && raw.value("id").toString() != m_target.timelineId)) {
        return fail(QStringLiteral("The earlier copy is not a copy of this timeline."));
    }
    const QJsonObject payload{{QStringLiteral("document"), documentForSave(raw)}};
    bool applied = false;
    const bool invoked = QMetaObject::invokeMethod(timeline, "applyEdit", Qt::DirectConnection,
        Q_RETURN_ARG(bool, applied), Q_ARG(QString, QStringLiteral("restoreDocument")), Q_ARG(QJsonObject, payload));
    if (!invoked || !applied) return fail(QStringLiteral("The earlier copy made no change or could not be restored."));
    m_earlierCopyError.clear();
    emit stateChanged();
    return true;
}

bool AutosaveController::discardEarlierCopy() {
    if (earlierCopy().isEmpty()) return false;
    if (!QFile::remove(earlierCopy())) {
        m_earlierCopyError = QStringLiteral("Could not delete the earlier copy: %1").arg(earlierCopy());
        emit stateChanged();
        return false;
    }
    m_earlierCopies.removeFirst();
    m_earlierCopyError.clear();
    emit stateChanged();
    return true;
}

QString AutosaveController::copyPath(const QString& suffix) const {
    if (m_target.backupDir.isEmpty()) return {};
    return QDir(m_target.backupDir).filePath(safePathPart(m_target.timelineId) + u'.' + suffix + QStringLiteral(".json"));
}

QString AutosaveController::writeCopy(const QString& suffix, const QJsonObject& doc, QString* error) {
    return writeCopyIn(m_target.backupDir, suffix, doc, error);
}

QString AutosaveController::writeCopyIn(const QString& dir, const QString& suffix, const QJsonObject& doc,
                                        QString* error) {
    const auto fail = [&](const QString& why) {
        if (error) *error = why;
        return QString();
    };
    if (dir.isEmpty()) return fail(QStringLiteral("no folder for the %1 copy").arg(suffix));
    if (!QDir().mkpath(dir)) return fail(QStringLiteral("cannot create %1").arg(dir));
    const QString path = QDir(dir).filePath(safePathPart(m_target.timelineId) + u'.' + suffix + QStringLiteral(".json"));
    if (m_earlierCopies.contains(path)) return fail(QStringLiteral("an earlier session still owns %1").arg(path));
    QSaveFile f(path);
    if (!f.open(QIODevice::WriteOnly)) return fail(QStringLiteral("cannot open %1: %2").arg(path, f.errorString()));
    const QByteArray bytes = QJsonDocument(doc).toJson(QJsonDocument::Indented);
    if (f.write(bytes) != bytes.size()) {
        f.cancelWriting();
        return fail(QStringLiteral("cannot write %1").arg(path));
    }
    if (!f.commit()) return fail(QStringLiteral("cannot save %1: %2").arg(path, f.errorString()));
    m_sessionCopies.insert(path);
    return path;
}

QString AutosaveController::writeCopyWithFallbacks(const QString& suffix, const QJsonObject& doc,
                                                   QString* error) {
    QString why;
    QString path = writeCopy(suffix, doc, &why);
    QStringList failures;
    if (path.isEmpty()) failures << why;
    for (const QString& fallback : m_fallbackDirs) {
        if (!path.isEmpty()) break;
        const QString dir = QDir(fallback).filePath(safePathPart(m_client->serverKey()) + u'/' +
                                                   safePathPart(m_client->userKey()));
        path = writeCopyIn(dir, suffix, doc, &why);
        if (path.isEmpty()) failures << why;
    }
    *error = path.isEmpty() ? failures.join(QStringLiteral("; ")) : QString();
    return path;
}

void AutosaveController::removeCopy(const QString& suffix) const {
    const QString path = copyPath(suffix);
    if (m_sessionCopies.contains(path) && !m_earlierCopies.contains(path)) QFile::remove(path);
}

SaveResult AutosaveController::saveNow() { return save(*m_client); }

SaveResult AutosaveController::keepConflictCopy() {
    SaveResult result;
    result.conflict = true;
    result.error = QStringLiteral("a conflict is open; edits are kept locally, not on the server");
    const auto current = m_document();
    result.keptCopy = writeCopyWithFallbacks(QStringLiteral("local"), current, &result.recoveryError);
    m_keptCopy = result.keptCopy;
    m_copyHash = contentHash(current);
    m_recoveryError = result.recoveryError;
    emit stateChanged();
    return result;
}

SaveResult AutosaveController::save(ServerClient& client) {
    SaveResult result;
    if (m_saving) {
        result.error = QStringLiteral("a save is in flight");
        return result;
    }
    if (currentHash() != m_committedHash) {
        result.error = QStringLiteral("an uncommitted preview is active; save waits for commit or cancellation");
        scheduleSave();
        return result;
    }
    if (m_conflict) return keepConflictCopy();
    if (m_base.isEmpty()) {
        // Without a base the server would take the save whatever it holds.
        result.error = QStringLiteral("no baseUpdatedAt: refusing to save over the server copy");
        m_lastError = result.error;
        emit stateChanged();
        return result;
    }
    m_saving = true;
    m_timer.stop();
    emit stateChanged();
    const QJsonObject raw = m_document();
    const QJsonObject sent = documentForSave(raw);
    const QByteArray sentHash = contentHash(sent);
    const QJsonObject input{{QStringLiteral("id"), m_target.timelineId},
                            {QStringLiteral("baseUpdatedAt"), m_base},
                            {QStringLiteral("document"), sent}};
    const QueryResult r = client.mutate(QStringLiteral("timeline.update"), input);
    m_saving = false;
    if (r.ok()) {
        const QJsonObject data = r.data.toObject();
        result.ok = true;
        result.updatedAt = data.value(u"updatedAt").toString();
        for (const QJsonValue& p : data.value(u"stripped").toArray()) result.stripped << p.toString();
        m_base = result.updatedAt;
        m_ackHash = sentHash;  // acknowledged even when fields were dropped
        m_ackComplete = result.stripped.isEmpty();
        m_retryAttempt = 0;
        m_retry.stop();
        m_lastError.clear();
        m_stripped = result.stripped;
        bool stripCopyWritten = false;
        if (!result.stripped.isEmpty()) {
            // D4: the server dropped these; the sent document keeps them.
            QString why;
            const QJsonObject current = m_document();
            const QString previousCopy = keptCopy();
            result.keptCopy = writeCopyWithFallbacks(QStringLiteral("stripped"), current, &why);
            stripCopyWritten = !result.keptCopy.isEmpty();
            if (!stripCopyWritten) result.keptCopy = previousCopy;
            result.recoveryError = why;
            m_keptCopy = result.keptCopy;
            m_copyHash = contentHash(current);
            m_recoveryError = why;
            std::fprintf(stderr, "save: warning: the server dropped %d field(s): %s; sent document kept in %s\n",
                         static_cast<int>(result.stripped.size()), qPrintable(result.stripped.join(u", ")),
                         qPrintable(result.keptCopy.isEmpty() ? why : result.keptCopy));
            emit strippedWarning(result.stripped);
        }
        syncClean();
        // A recovery copy stays until a copy that replaces it is written: the
        // server copy, or the strip copy of what the server dropped.
        // An edit made while the save was in flight is not in the server copy.
        if (dirty()) {
            scheduleSave();
        } else if (result.stripped.isEmpty() || stripCopyWritten) {
            removeCopy(QStringLiteral("recovery"));
        }
        if (result.stripped.isEmpty() && !dirty()) {
            m_keptCopy.clear();
            m_copyHash.clear();
            m_recoveryError.clear();
        }
        emit saved(result.updatedAt);
        emit stateChanged();
        return result;
    }
    // The current document, edits made during the request included.
    const QJsonObject current = m_document();
    QString why;
    if (r.error.apiCode == u"ALREADY_EXISTS" || r.error.code == u"CONFLICT") {
        m_conflict = true;
        m_retry.stop();
        result.conflict = true;
        result.error = r.error.message;
        result.keptCopy = writeCopyWithFallbacks(QStringLiteral("local"), current, &why);
        result.recoveryError = why;
        m_keptCopy = result.keptCopy;
        m_copyHash = contentHash(current);
        m_recoveryError = why;
        m_lastError = QStringLiteral("conflict: %1").arg(r.error.message);
        if (!why.isEmpty()) m_lastError += QStringLiteral("; the local recovery copy failed: %1").arg(why);
        std::fprintf(stderr, "save: conflict: the server copy changed since the load; local document %s\n",
                     result.keptCopy.isEmpty() ? qPrintable(QStringLiteral("NOT kept: ") + why)
                                               : qPrintable(QStringLiteral("kept in ") + result.keptCopy));
        emit conflictDetected();
        emit stateChanged();
        return result;
    }
    result.error = r.describe();
    result.keptCopy = writeCopy(QStringLiteral("recovery"), current, &why);
    result.recoveryError = why;
    m_keptCopy = result.keptCopy;
    m_copyHash = contentHash(current);
    m_recoveryError = why;
    m_lastError = result.error;
    if (!why.isEmpty()) m_lastError += QStringLiteral("; the recovery copy failed: %1").arg(why);
    std::fprintf(stderr, "save: failed: %s; %s\n", qPrintable(result.error),
                 result.keptCopy.isEmpty() ? qPrintable(QStringLiteral("recovery copy NOT written: ") + why)
                                           : qPrintable(QStringLiteral("recovery copy in ") + result.keptCopy));
    if (transient(r)) {
        const int delay = std::min(30000, m_retryBaseMs << std::min(m_retryAttempt, 15));
        ++m_retryAttempt;
        m_retry.start(delay);
    }
    emit stateChanged();
    return result;
}

bool AutosaveController::flushBeforeQuit(int timeoutMs) {
    m_timer.stop();
    m_retry.stop();
    if (!dirty() && m_ackComplete) return true;
    if (dirty() && !m_conflict) {
        // `timeoutMs` bounds the elapsed time; the transfer timeout only
        // bounds silence, which a slow answer never reaches.
        ServerClient bounded(m_target.server, m_target.token, timeoutMs);
        bounded.setExpectedInstance(m_target.expectedInstance);
        bounded.setDeadlineMs(timeoutMs);
        const SaveResult r = save(bounded);
        m_retry.stop();
        if (r.ok && !dirty() && m_ackComplete) return true;
    }
    if (!dirty() && !keptCopy().isEmpty()) return false;
    const QString suffix = m_conflict ? QStringLiteral("local")
                                     : !dirty() && !m_ackComplete ? QStringLiteral("stripped")
                                                                  : QStringLiteral("recovery");
    const QJsonObject doc = m_document();
    const QString path = writeCopyWithFallbacks(suffix, doc, &m_recoveryError);
    m_keptCopy = path;
    m_copyHash = contentHash(doc);
    emit stateChanged();
    if (path.isEmpty()) {
        std::fprintf(stderr, "save: error: quitting with unsaved edits that no folder took: %s\n",
                     qPrintable(m_recoveryError));
        const QByteArray json = QJsonDocument(doc).toJson(QJsonDocument::Compact);
        std::fprintf(m_lastResortStream, "save: BEGIN unsaved document %s\n", qPrintable(m_target.timelineId));
        std::fwrite(json.constData(), 1, static_cast<size_t>(json.size()), m_lastResortStream);
        std::fprintf(m_lastResortStream, "\nsave: END unsaved document %s\n", qPrintable(m_target.timelineId));
        std::fflush(m_lastResortStream);
    } else {
        std::fprintf(stderr, "save: quitting with unsaved edits; current document kept in %s\n", qPrintable(path));
    }
    return false;
}

int exitCodeAfterQuit(AutosaveController* autosave, int rc, int timeoutMs) {
    if (!autosave || autosave->flushBeforeQuit(timeoutMs)) return rc;
    // A copy on disk is the designed path for unsaved edits; none is a loss.
    return autosave->keptCopy().isEmpty() ? kExitUnsavedEditsLost : rc;
}

}  // namespace nt::server
