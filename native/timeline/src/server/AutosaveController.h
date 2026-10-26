#pragma once

// Saving a server timeline (PLAN.md M5b; DESIGN.md D4, D31, D34).
//
// A save is `POST /trpc/timeline.update` with `{id, baseUpdatedAt, document}`.
// `document` is the raw sequence the editor holds (every field the server
// sent, edited clips included) without the sequence-row fields (id, name,
// fps, size, duration, timestamps). The server compares `baseUpdatedAt` and
// swaps atomically:
//   - success: the response's `updatedAt` becomes the next base, and the sent
//     content becomes the acknowledged content. A non-empty `stripped` list is
//     a warning: the server dropped those fields. The sent document is kept
//     as `<id>.stripped.json` in the backup folder or a fallback folder.
//   - conflict (`error.data.apiCode` ALREADY_EXISTS, or `code` CONFLICT):
//     the current local document is written to `<id>.local.json`, and
//     server writes stop. Later committed edits keep updating the local
//     copy on the debounce. A conflict is never retried on the server.
//   - any other failure: the current document is written to
//     `<id>.recovery.json`; a transient one (no answer, 5xx, 429) is retried
//     with a doubling delay, up to 30 s.
// A recovery or conflict file that cannot be written is reported
// (`recoveryError`, `lastError`). The client never saves without a base.
//
// Dirty compares the current document with the acknowledged content (a hash
// of the saved JSON), so a merged command, an undo during a save, or a branch
// cannot pass for saved. The undo stack's clean state follows it, for the UI.
// Autosave runs 750 ms after the last command (D34) while the document is
// dirty. A document differing from the last undo-stack notification is a
// gesture preview: timers wait and recheck until it is committed or cancelled.
// Explicit saves also refuse previews. `flushBeforeQuit` saves what is pending
// within a bounded elapsed time, or leaves a recovery file (in a fallback
// folder when the backup folder takes none). Fallbacks are namespaced by
// serverKey/userKey. Acknowledged content is preserved only if the server
// kept every field or a written copy holds it. `keptCopy` names only the
// current raw document. Recovery stays until a replacement is written.
// If every folder rejects quit recovery, compact JSON goes to stderr between
// explicit markers. No file was kept, so the exit code still reports loss.
//
// Startup archives earlier recovery/local files with a timestamp and unique
// suffix, preserving their kind. Backup and namespaced fallback folders are
// scanned, including archives from older launches. `earlierCopy` offers one
// at a time. Restore applies document content through one restoreDocument
// edit, preserving the loaded sequence row and save base. Even after server
// acknowledgement the archive stays offered until explicit Discard.

#include "server/ServerClient.h"

#include <QJsonObject>
#include <QObject>
#include <QSet>
#include <QStringList>
#include <QTimer>
#include <QUrl>

#include <cstdio>
#include <functional>
#include <memory>

class QUndoStack;

namespace nt::server {

struct SaveTarget {
    QUrl server;
    QString token;
    QString timelineId;
    QString backupDir;  // the folder that holds `<id>.json`, the raw backup of the last load
    // When set, a save goes only to the server that answers with this
    // instance token (ServerClient::setExpectedInstance).
    QString expectedInstance = {};
};

struct SaveResult {
    bool ok = false;
    bool conflict = false;
    QString updatedAt;
    QStringList stripped;
    QString error;
    QString keptCopy;  // the local document written on a conflict or a strip
    QString recoveryError;  // a recovery or conflict file that could not be written
};

// The document part of a raw sequence: everything but the sequence-row fields.
QJsonObject documentForSave(const QJsonObject& rawSequence);

class AutosaveController : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool dirty READ dirty NOTIFY stateChanged)
    Q_PROPERTY(bool saving READ saving NOTIFY stateChanged)
    Q_PROPERTY(bool conflict READ conflict NOTIFY stateChanged)
    Q_PROPERTY(QStringList stripped READ stripped NOTIFY stateChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY stateChanged)
    // A written copy of the current raw document, or empty.
    Q_PROPERTY(QString keptCopy READ keptCopy NOTIFY stateChanged)
    // Why that copy could not be written; empty when it was.
    Q_PROPERTY(QString recoveryError READ recoveryError NOTIFY stateChanged)
    Q_PROPERTY(QString earlierCopy READ earlierCopy NOTIFY stateChanged)
    Q_PROPERTY(QString earlierCopyError READ earlierCopyError NOTIFY stateChanged)

public:
    using DocumentFn = std::function<QJsonObject()>;

    AutosaveController(SaveTarget target, QUndoStack* undo, DocumentFn document, QString baseUpdatedAt,
                       QObject* parent = nullptr);

    bool dirty() const;
    bool saving() const { return m_saving; }
    bool conflict() const { return m_conflict; }
    QStringList stripped() const { return m_stripped; }
    QString lastError() const { return m_lastError; }
    QString keptCopy() const;
    QString recoveryError() const;
    QString baseUpdatedAt() const { return m_base; }
    QString earlierCopy() const { return m_earlierCopies.value(0); }
    QString earlierCopyError() const { return m_earlierCopyError; }
    Q_INVOKABLE bool restoreEarlierCopy(QObject* timeline);
    Q_INVOKABLE bool discardEarlierCopy();

    void setDebounceMs(int ms) { m_timer.setInterval(ms); }
    void setAutosave(bool on);
    void setRetryBaseMs(int ms) { m_retryBaseMs = ms; }
    // Fallback roots for quit recovery and strip copies, each with server/user
    // subfolders. Default: the app's local data folder, then the temp folder.
    void setQuitFallbackDirs(const QStringList& dirs);
    // Borrowed stream for the final quit recovery log.
    void setLastResortStream(FILE* stream) { m_lastResortStream = stream; }

    // Saves now, dirty or not. Blocks until the server answers.
    SaveResult saveNow();
    // Before the app quits: saves pending edits within `timeoutMs` of elapsed
    // time. Returns true when the server holds the current document; otherwise
    // the current document is in `<id>.recovery.json` (or `<id>.local.json` on
    // a conflict), in the backup folder or else a fallback folder; `keptCopy`
    // names it, and is empty when no folder took it. A clean but unpreserved
    // strip writes a copy without another server save. Total write failure
    // also logs the full document to the last-resort stream.
    bool flushBeforeQuit(int timeoutMs);
    // The document changed outside the undo stack's index (a merge).
    void documentChanged();

signals:
    void stateChanged();
    void saved(const QString& updatedAt);
    void conflictDetected();
    void strippedWarning(const QStringList& paths);

private:
    void scheduleSave();
    void debounceExpired();
    void findEarlierCopies();
    QStringList copyDirs() const;
    SaveResult keepConflictCopy();
    SaveResult save(ServerClient& client);
    QByteArray currentHash() const;
    void syncClean();
    // Writes `doc` to `<id>.<suffix>.json`; returns the path, or sets `error`.
    QString writeCopy(const QString& suffix, const QJsonObject& doc, QString* error = nullptr);
    QString writeCopyWithFallbacks(const QString& suffix, const QJsonObject& doc, QString* error);
    QString writeCopyIn(const QString& dir, const QString& suffix, const QJsonObject& doc, QString* error);
    QString copyPath(const QString& suffix) const;  // in the backup folder; empty without one
    void removeCopy(const QString& suffix) const;

    SaveTarget m_target;
    QUndoStack* m_undo;
    DocumentFn m_document;
    QString m_base;
    std::unique_ptr<ServerClient> m_client;
    QTimer m_timer;
    QTimer m_retry;
    int m_retryBaseMs = 1000;
    int m_retryAttempt = 0;
    QByteArray m_ackHash;  // the content the server acknowledged (or the load)
    QByteArray m_committedHash;  // updated only by committed-change notifications
    bool m_ackComplete = true;  // false when the server stripped fields
    QByteArray m_copyHash;  // the raw document in m_keptCopy
    bool m_syncing = false;
    bool m_autosave = true;
    bool m_saving = false;
    bool m_conflict = false;
    QStringList m_stripped;
    QString m_lastError;
    QString m_keptCopy;
    QString m_recoveryError;
    QStringList m_fallbackDirs;
    QStringList m_earlierCopies;
    QString m_earlierCopyError;
    QSet<QString> m_sessionCopies;
    FILE* m_lastResortStream = stderr;
};

// main()'s exit code after the window closed: flushes `autosave` (may be
// null), keeps `rc` when the server or a copy on disk holds the edits, and
// returns kExitUnsavedEditsLost when nothing does.
inline constexpr int kExitUnsavedEditsLost = 4;
int exitCodeAfterQuit(AutosaveController* autosave, int rc, int timeoutMs);

}  // namespace nt::server
