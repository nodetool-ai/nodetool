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
//     next to the raw backup of the last load (`<id>.stripped.json`), so the
//     dropped data is recoverable.
//   - conflict (`error.data.apiCode` ALREADY_EXISTS, or `code` CONFLICT):
//     the current local document is written to `<id>.local.json`, and
//     autosave stops. Nothing overwrites the server copy, and a conflict is
//     never retried.
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
// dirty and no conflict is open. `flushBeforeQuit` saves what is pending
// within a bounded elapsed time, or leaves a recovery file (in a fallback
// folder when the backup folder takes none). A recovery file stays until a
// save replaces it: a clean save, or a strip whose copy was written.

#include "server/ServerClient.h"

#include <QJsonObject>
#include <QObject>
#include <QStringList>
#include <QTimer>
#include <QUrl>

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
    // The copy of the local document written on a conflict, a strip or a
    // failed save; empty when none is pending (a clean save removes it).
    Q_PROPERTY(QString keptCopy READ keptCopy NOTIFY stateChanged)
    // Why that copy could not be written; empty when it was.
    Q_PROPERTY(QString recoveryError READ recoveryError NOTIFY stateChanged)

public:
    using DocumentFn = std::function<QJsonObject()>;

    AutosaveController(SaveTarget target, QUndoStack* undo, DocumentFn document, QString baseUpdatedAt,
                       QObject* parent = nullptr);

    bool dirty() const;
    bool saving() const { return m_saving; }
    bool conflict() const { return m_conflict; }
    QStringList stripped() const { return m_stripped; }
    QString lastError() const { return m_lastError; }
    QString keptCopy() const { return m_keptCopy; }
    QString recoveryError() const { return m_recoveryError; }
    QString baseUpdatedAt() const { return m_base; }

    void setDebounceMs(int ms) { m_timer.setInterval(ms); }
    void setAutosave(bool on);
    void setRetryBaseMs(int ms) { m_retryBaseMs = ms; }
    // Where `flushBeforeQuit` writes the recovery copy when the backup folder
    // takes no file. Default: the app's local data folder, then the temp folder.
    void setQuitFallbackDirs(const QStringList& dirs) { m_fallbackDirs = dirs; }

    // Saves now, dirty or not. Blocks until the server answers.
    SaveResult saveNow();
    // Before the app quits: saves pending edits within `timeoutMs` of elapsed
    // time. Returns true when the server holds the current document; otherwise
    // the current document is in `<id>.recovery.json` (or `<id>.local.json` on
    // a conflict), in the backup folder or else a fallback folder; `keptCopy`
    // names it, and is empty when no folder took it.
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
    SaveResult save(ServerClient& client);
    QByteArray currentHash() const;
    void syncClean();
    // Writes `doc` to `<id>.<suffix>.json`; returns the path, or sets `error`.
    QString writeCopy(const QString& suffix, const QJsonObject& doc, QString* error = nullptr) const;
    QString writeCopyIn(const QString& dir, const QString& suffix, const QJsonObject& doc, QString* error) const;
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
    bool m_syncing = false;
    bool m_autosave = true;
    bool m_saving = false;
    bool m_conflict = false;
    QStringList m_stripped;
    QString m_lastError;
    QString m_keptCopy;
    QString m_recoveryError;
    QStringList m_fallbackDirs;
};

// main()'s exit code after the window closed: flushes `autosave` (may be
// null), keeps `rc` when the server or a copy on disk holds the edits, and
// returns kExitUnsavedEditsLost when nothing does.
inline constexpr int kExitUnsavedEditsLost = 4;
int exitCodeAfterQuit(AutosaveController* autosave, int rc, int timeoutMs);

}  // namespace nt::server
