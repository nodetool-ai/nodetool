#include "server/AutosaveController.h"
#include "server/AssetCache.h"
#include "server/sync/DocumentApplier.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QEventLoop>
#include <QPointer>
#include <QScopeGuard>
#include <QThread>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUndoStack>
#include <QUuid>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <stdexcept>
#include <utility>

namespace nt::server {
namespace {

std::atomic<int> liveWorkers{0};

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
    m_mergeBase = sync::mergeDocumentOf(m_document());
    const QString appData = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    if (!appData.isEmpty()) m_fallbackDirs << QDir(appData).filePath(QStringLiteral("recovery"));
    m_fallbackDirs << QDir(QDir::tempPath()).filePath(QStringLiteral("nodetool-timeline-recovery"));
    findEarlierCopies();
    m_timer.setSingleShot(true);
    m_timer.setInterval(750);  // D34
    connect(&m_timer, &QTimer::timeout, this, &AutosaveController::debounceExpired);
    m_retry.setSingleShot(true);
    connect(&m_retry, &QTimer::timeout, this, [this]() {
        if (m_retryRecovery && !m_deleted && !m_fetching && !m_saving) {
            m_retryRecovery = false;
            m_conflict = false;
            fetchExternal(true);
        } else if (dirty() && !m_conflict && !m_saving) {
            saveNow();
        }
    });
    connect(m_undo, &QUndoStack::indexChanged, this, &AutosaveController::documentChanged);
    connect(m_undo, &QUndoStack::cleanChanged, this, &AutosaveController::stateChanged);
    m_externalRetry.setSingleShot(true);
    m_externalRetry.setInterval(25);
    connect(&m_externalRetry, &QTimer::timeout, this, &AutosaveController::processExternal);
    QTimer::singleShot(0, this, &AutosaveController::startExternalSync);
}

AutosaveController::~AutosaveController() {
    m_changes.reset();
    // ServerClient defaults to 30 s of transfer inactivity. Wait twice that
    // (60 s elapsed here), but this is based on an inactivity bound, not an
    // elapsed fetch deadline: openServerTimeline has no deadline and can make
    // several requests or keep receiving bytes. A worker still running after
    // this wait is logged and left to finish on its own. It owns its inputs
    // and result, holds no controller pointer, and deletes itself on finish.
    if (m_fetchWorker && !m_fetchWorker->wait(2 * 30000UL)) {
        std::fprintf(stderr, "sync: fetch worker still running after 60000 ms shutdown wait\n");
    }
}

void AutosaveController::restartStoppedChain() {
    if (!m_conflict || m_deleted) return;
    m_conflict = false;
    m_casRecoveries = 0;
    m_retryAttempt = 0;
    m_retryRecovery = false;
    m_retry.stop();
}

int AutosaveController::liveFetchWorkers() { return liveWorkers.load(); }

void AutosaveController::setExternalSync(bool on) {
    m_externalSync = on;
    if (!on) {
        m_changes.reset();
    } else {
        startExternalSync();
    }
}

void AutosaveController::startExternalSync() {
    if (!m_externalSync || m_changes || m_deleted) return;
    m_changes = std::make_unique<sync::ResourceChangeClient>(m_syncUrl.isEmpty() ? m_target.server : m_syncUrl,
        m_target.timelineId, m_target.token);
    connect(m_changes.get(), &sync::ResourceChangeClient::changed, this, &AutosaveController::externalChanged);
    connect(m_changes.get(), &sync::ResourceChangeClient::refreshNeeded, this, &AutosaveController::refreshExternal);
    connect(m_changes.get(), &sync::ResourceChangeClient::stateChanged, this, [this] {
        if (m_changes->state() == sync::ResourceChangeClient::State::Connected) {
            std::fprintf(stderr, "sync: listening for %s\n", qPrintable(m_target.timelineId));
        }
        if (m_changes->state() == sync::ResourceChangeClient::State::Failed) {
            syncFailure(m_changes->reason(), false);
        }
        emit stateChanged();
    });
    m_changes->start();
}

void AutosaveController::externalChanged(QString event, QString updatedAt, QJsonArray ops, bool hasOps) {
    if (event == u"deleted") {
        m_deleted = true;
        m_pendingExternal = false;
        m_fetched.reset();
        m_timer.stop();
        m_retry.stop();
        keepConflictCopy();
        m_externalState = QStringLiteral("deleted");
        m_lastError = m_keptCopy.isEmpty()
            ? QStringLiteral("The server timeline was deleted and could not be kept locally: %1").arg(m_recoveryError)
            : QStringLiteral("The server timeline was deleted. Edits are kept locally.");
        std::fprintf(stderr, "sync: failed: %s\n", qPrintable(m_lastError));
        emit stateChanged();
        return;
    }
    // web/src/stores/documentSync.ts:317-337: only updates, ignore own echo.
    if (event != u"updated" || (!updatedAt.isEmpty() && updatedAt == m_base) || m_deleted) return;
    queueExternal(ops, hasOps, false);
}

void AutosaveController::refreshExternal() {
    if (!m_deleted) queueExternal({}, false, true);
}

void AutosaveController::queueExternal(const QJsonArray& ops, bool hasOps, bool withoutOps) {
    restartStoppedChain();
    m_pendingExternal = true;
    m_pendingHasOps = m_pendingHasOps && hasOps;
    m_pendingWithoutOps = m_pendingWithoutOps || withoutOps;
    for (const auto& op : ops) m_pendingOps.append(op);
    processExternal();
}

void AutosaveController::processExternal() {
    if (m_deleted || m_saving) return;
    if (m_fetched) {
        if (currentHash() != m_committedHash) {
            m_externalRetry.start();
            return;
        }
        const bool recovery = m_recovering;
        const bool applied = applyFetched();
        m_fetched.reset();
        m_fetching = false;
        m_recovering = false;
        if (recovery && applied) {
            clearLocalCopyIfClean();
            if (m_casRecoveries >= 5 && dirty()) {
                syncFailure(QStringLiteral("CAS recovery limit reached"), true);
            } else if (dirty()) {
                scheduleSave();
            }
        }
        if (!m_conflict && dirty()) scheduleSave();
        emit stateChanged();
    }
    if (m_fetching || !m_pendingExternal || m_conflict) return;
    if (currentHash() != m_committedHash) {
        m_externalRetry.start();
        return;
    }
    m_activeOps = std::exchange(m_pendingOps, {});
    m_activeHasOps = std::exchange(m_pendingHasOps, true);
    m_activeWithoutOps = std::exchange(m_pendingWithoutOps, false);
    m_pendingExternal = false;
    fetchExternal(false);
}

void AutosaveController::fetchExternal(bool recovery) {
    if (m_fetching || m_deleted) return;
    m_fetching = true;
    m_recovering = recovery;
    if (recovery) {
        m_activeOps = {};
        m_activeHasOps = false;
        m_activeWithoutOps = true;
    }
    m_timer.stop();
    m_retry.stop();
    m_externalState = recovery ? QStringLiteral("recovering") : QStringLiteral("fetching");
    m_fetchElapsed.start();
    // serverSaveTarget: backupDir is cacheRoot/serverKey/userKey/timelines.
    const QString cacheRoot = QFileInfo(m_target.backupDir).fileName() == u"timelines"
        ? QDir::cleanPath(m_target.backupDir + QStringLiteral("/../../.."))
        : m_target.backupDir; // standalone library callers can supply a plain backup folder
    const ServerOpenOptions options{m_target.server, m_target.timelineId, cacheRoot, m_target.token, true};
    auto result = std::make_shared<ServerOpenResult>();
    const QPointer<AutosaveController> guard(this);
    ++liveWorkers;
    auto* worker = QThread::create([options, result] {
        const auto finished = qScopeGuard([] { --liveWorkers; });
        // openServerTimeline owns its ServerClient on this worker thread.
        *result = openServerTimeline(options);
    });
    connect(worker, &QThread::finished, this, [guard, result, recovery] {
        if (!guard) return;
        if (guard->m_deleted) {
            guard->m_fetching = false;
            emit guard->stateChanged();
            return;
        }
        if (!result->timeline) {
            guard->m_fetching = false;
            guard->m_recovering = false;
            guard->syncFailure(result->error, recovery);
            if (recovery) {
                // ServerOpenResult has no error classification. Every failed
                // recovery fetch remains stopped, with its local copy, until
                // this recovery retry or a new chain starts.
                const int delay = std::min(30000, guard->m_retryBaseMs << std::min(guard->m_retryAttempt, 15));
                ++guard->m_retryAttempt;
                guard->m_retryRecovery = true;
                guard->m_retry.start(delay);
            }
            if (!guard->m_conflict && guard->dirty()) guard->scheduleSave();
            if (guard->m_pendingExternal) guard->m_externalRetry.start();
            return;
        }
        guard->m_fetched = std::move(result->timeline);
        guard->processExternal();
    }, Qt::QueuedConnection);
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    m_fetchWorker = worker;
    worker->start();
    emit stateChanged();
}

bool AutosaveController::applyFetched() {
    const auto& resolved = *m_fetched;
    const auto& serverRaw = resolved.raw;
    const QString revision = serverRaw.value("updatedAt").toString();
    // web/src/stores/timeline/TimelineStore.ts:1998-2006, and
    // useTimelineExternalSync.ts:107-131: recheck revision AND dirty after fetch.
    const auto candidate = QDateTime::fromString(revision, Qt::ISODateWithMs);
    const auto current = QDateTime::fromString(m_base, Qt::ISODateWithMs);
    if (revision.isEmpty() || revision == m_base || (candidate.isValid() && current.isValid() && candidate < current)) {
        if (m_recovering) syncFailure(QStringLiteral("server revision did not advance"), true);
        else m_externalState = QStringLiteral("idle");
        if (dirty()) scheduleSave();
        return false;
    }
    const bool wasDirty = dirty();
    auto raw = serverRaw;
    auto nextBase = sync::mergeDocumentOf(serverRaw);
    QList<sync::MergeConflict> conflicts;
    if (wasDirty) {
        // web/src/hooks/timeline/useTimelineExternalSync.ts:132-184 and
        // web/src/hooks/timeline/useTimelineAutosave.ts:234-281.
        // Refused units retain their prior base, so a later write offers them again.
        auto ops = m_activeOps;
        for (const auto& op : m_pendingOps) ops.append(op);
        const bool hasOps = m_activeHasOps && (!m_pendingExternal || m_pendingHasOps);
        try {
            const auto merged = sync::mergeTimelineDocuments(m_mergeBase, sync::mergeDocumentOf(m_document()),
                sync::mergeDocumentOfSequence(serverRaw, m_mergeBase),
                hasOps ? std::optional{ops} : std::nullopt, m_activeWithoutOps);
            raw = sync::applyMergeDocument(serverRaw, merged.doc);
            nextBase = sync::mergeDocumentOf(merged.nextBase);
            conflicts = merged.conflicts;
        } catch (const std::invalid_argument& error) {
            syncFailure(QString::fromUtf8(error.what()), m_recovering);
            return false;
        }
    }
    // Block indexChanged from setTimeline clearing history. A failed applier
    // must leave both the model and this controller's base untouched.
    m_syncing = true;
    const bool applied = sync::applyDocument(m_undo, raw, resolved);
    m_syncing = false;
    if (!applied) {
        syncFailure(QStringLiteral("cannot apply external timeline: no document applier or invalid document"), m_recovering);
        return false;
    }
    m_base = revision;
    m_ackHash = contentHash(documentForSave(serverRaw));
    m_ackComplete = true;
    m_mergeBase = nextBase;
    m_committedHash = currentHash();
    for (auto conflict : conflicts) {
        if (conflict.id.isEmpty()) conflict.id = conflict.kind;
        m_externalConflicts.removeIf([&](const sync::MergeConflict& old) { return old.id == conflict.id && old.kind == conflict.kind; });
        m_externalConflicts.append(conflict);
    }
    m_externalState = wasDirty ? QStringLiteral("merged") : QStringLiteral("adopted");
    m_lastError.clear();
    syncClean();
    if (m_casRecoveries > 0) keepConflictCopy();
    if (dirty()) scheduleSave();
    std::fprintf(stderr, "sync: %s %s in %lld ms\n", m_recovering ? "recovered" : wasDirty ? "merged" : "adopted",
        qPrintable(revision), static_cast<long long>(m_fetchElapsed.elapsed()));
    emit stateChanged();
    return true;
}

void AutosaveController::syncFailure(const QString& error, bool recovery) {
    keepConflictCopy();
    if (recovery) m_conflict = true;
    m_externalState = QStringLiteral("error");
    m_lastError = (recovery ? QStringLiteral("conflict: ") : QStringLiteral("sync: ")) + error;
    if (!m_recoveryError.isEmpty()) m_lastError += QStringLiteral("; ") + m_recoveryError;
    std::fprintf(stderr, "sync: failed: %s\n", qPrintable(m_lastError));
    emit stateChanged();
}

QVariantList AutosaveController::externalConflicts() const {
    QVariantList list;
    for (const auto& conflict : m_externalConflicts) {
        list.append(QVariantMap{{"kind", conflict.kind}, {"id", conflict.id},
            {"label", conflict.label}, {"reason", conflict.reason}});
    }
    return list;
}

bool AutosaveController::acceptExternalConflict(const QString& id, QObject* timeline) {
    if (!timeline || m_saving || m_fetching || currentHash() != m_committedHash) return false;
    for (qsizetype i = 0; i < m_externalConflicts.size(); ++i) {
        const auto& conflict = m_externalConflicts[i];
        if (conflict.id != id) continue;
        const QJsonObject payload{{"kind", conflict.kind}, {"id", conflict.id},
            {"reason", conflict.reason}, {"external", conflict.external}};
        bool applied = false;
        const bool invoked = QMetaObject::invokeMethod(timeline, "applyEdit", Qt::DirectConnection,
            Q_RETURN_ARG(bool, applied), Q_ARG(QString, QStringLiteral("acceptExternalUnit")), Q_ARG(QJsonObject, payload));
        if (!invoked || !applied) return false;
        m_externalConflicts.removeAt(i);
        emit stateChanged();
        return true;
    }
    return false;
}

void AutosaveController::discardExternalConflicts() {
    m_externalConflicts.clear();
    emit stateChanged();
}

void AutosaveController::clearLocalCopyIfClean() {
    if (dirty()) return;
    // A successful stripped save resolves CAS too, provided its complete
    // document has reached the strip copy. Keep the local file if that failed.
    if (!m_ackComplete && (keptCopy().isEmpty() || !m_keptCopy.endsWith(QStringLiteral(".stripped.json")))) return;
    m_casRecoveries = 0;
    // Only this session's files. Never touch earlierCopy archives.
    for (const auto& path : m_sessionCopies) {
        if (QFileInfo(path).fileName() == safePathPart(m_target.timelineId) + QStringLiteral(".local.json") &&
            !m_earlierCopies.contains(path)) QFile::remove(path);
    }
    if (!m_keptCopy.isEmpty() && !QFile::exists(m_keptCopy)) {
        m_keptCopy.clear();
        m_copyHash.clear();
        m_recoveryError.clear();
    }
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
    const auto committed = currentHash();
    const bool newEdit = committed != m_committedHash;
    m_committedHash = committed;
    syncClean();
    if (m_deleted || m_casRecoveries > 0 || m_conflict) keepConflictCopy();
    if (newEdit) restartStoppedChain();
    scheduleSave();
    if (m_fetched || m_pendingExternal) m_externalRetry.start();
    emit stateChanged();
}

void AutosaveController::setAutosave(bool on) {
    m_autosave = on;
    if (!on) m_timer.stop();
    else if (dirty()) scheduleSave();
}

void AutosaveController::scheduleSave() {
    if (m_autosave) m_timer.start();  // restarts: 750 ms after the last command
}

void AutosaveController::debounceExpired() {
    if (!m_autosave || m_saving || m_fetching || m_flushing) return;
    if (currentHash() != m_committedHash) {
        // replaceClips previews emit no undo notification. Cancellation also
        // emits none, so keep checking until the committed content returns.
        m_timer.start();
        return;
    }
    syncClean();
    if (m_conflict || m_deleted) {
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
    quint64 token = 0;
    const bool invoked = QMetaObject::invokeMethod(timeline, "applyEdit", Qt::DirectConnection,
        Q_RETURN_ARG(quint64, token), Q_ARG(QString, QStringLiteral("restoreDocument")), Q_ARG(QJsonObject, payload));
    if (!invoked || token == 0) return fail(QStringLiteral("The earlier copy made no change or could not be restored."));
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
    if (m_saving || m_fetching) {
        result.error = QStringLiteral("a save is in flight");
        return result;
    }
    if (currentHash() != m_committedHash) {
        result.error = QStringLiteral("an uncommitted preview is active; save waits for commit or cancellation");
        scheduleSave();
        return result;
    }
    if (m_conflict || m_deleted) return keepConflictCopy();
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
    if (m_pendingExternal) m_externalRetry.start();
    if (m_deleted) return keepConflictCopy();
    if (r.ok()) {
        const QJsonObject data = r.data.toObject();
        result.ok = true;
        result.updatedAt = data.value(u"updatedAt").toString();
        for (const QJsonValue& p : data.value(u"stripped").toArray()) result.stripped << p.toString();
        m_base = result.updatedAt;
        m_mergeBase = sync::mergeDocumentOf(raw);
        m_casRecoveries = 0;
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
        clearLocalCopyIfClean();
        emit saved(result.updatedAt);
        emit stateChanged();
        return result;
    }
    // The current document, edits made during the request included.
    const QJsonObject current = m_document();
    QString why;
    if (r.error.apiCode == u"ALREADY_EXISTS" || r.error.code == u"CONFLICT") {
        result = keepConflictCopy();
        m_retry.stop();
        m_lastError = QStringLiteral("conflict: %1").arg(r.error.message);
        emit conflictDetected();
        // web/src/stores/documentSync.ts:76,138-166 bounds a CAS chain.
        if (m_casRecoveries >= 5 || (m_flushing && m_casRecoveries > 0)) {
            syncFailure(m_flushing ? QStringLiteral("closing flush already used its recovery")
                                  : QStringLiteral("CAS recovery limit reached"), true);
        } else {
            ++m_casRecoveries;
            fetchExternal(true);
        }
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
    QElapsedTimer budget;
    budget.start();
    m_flushing = true;
    const auto finishFlush = qScopeGuard([this] { m_flushing = false; });
    m_timer.stop();
    m_retry.stop();
    if (!dirty() && m_ackComplete && !m_deleted) return true;
    if (dirty() && !m_conflict && !m_deleted) {
        // `timeoutMs` bounds the elapsed time; the transfer timeout only
        // bounds silence, which a slow answer never reaches.
        ServerClient bounded(m_target.server, m_target.token, timeoutMs);
        bounded.setExpectedInstance(m_target.expectedInstance);
        bounded.setDeadlineMs(timeoutMs);
        save(bounded);
        // The explicit closing flush may wait for one worker recovery. Normal
        // external fetches never spin a nested event loop on the GUI thread.
        if (m_fetching && budget.elapsed() < timeoutMs) {
            QEventLoop wait;
            QTimer deadline;
            deadline.setSingleShot(true);
            connect(&deadline, &QTimer::timeout, &wait, &QEventLoop::quit);
            connect(this, &AutosaveController::stateChanged, &wait, [this, &wait] {
                if (!m_fetching) wait.quit();
            });
            deadline.start(timeoutMs - static_cast<int>(budget.elapsed()));
            wait.exec();
            if (!m_fetching && !m_conflict && !m_deleted && dirty() && budget.elapsed() < timeoutMs) {
                const int remaining = timeoutMs - static_cast<int>(budget.elapsed());
                ServerClient retry(m_target.server, m_target.token, remaining);
                retry.setExpectedInstance(m_target.expectedInstance);
                retry.setDeadlineMs(remaining);
                save(retry);
            }
        }
        m_retry.stop();
        if (!dirty() && m_ackComplete && !m_deleted) return true;
    }
    if (!dirty() && !keptCopy().isEmpty()) return false;
    const QString suffix = m_conflict || m_deleted || m_casRecoveries > 0 ? QStringLiteral("local")
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
