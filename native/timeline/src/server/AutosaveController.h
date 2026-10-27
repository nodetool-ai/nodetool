#pragma once

// Saving a server timeline (PLAN.md M5b; DESIGN.md D4, D31, D34).
//
// A save is `POST /trpc/timeline.update` with `{id, baseUpdatedAt, document, fps, width, height}`.
// `document` is the raw sequence the editor holds (every field the server
// sent, edited clips included) without the sequence-row fields (id, name,
// fps, size, duration, timestamps). The server compares `baseUpdatedAt` and
// swaps atomically:
//   - success: the response's `updatedAt` becomes the next base, and the sent
//     content becomes the acknowledged content. A non-empty `stripped` list is
//     a warning: the server dropped those fields. The sent document is kept
//     as `<id>.stripped.json` in the backup folder or a fallback folder.
//   - conflict (`error.data.apiCode` ALREADY_EXISTS, or `code` CONFLICT):
//     write the current local document to `<id>.local.json`, fetch and merge
//     the newer server copy without ops, then retry on the
//     debounce (D34). Stop only if recovery fails, the revision does not
//     advance, or five recoveries in one chain do not settle the conflict.
//     In that stopped state, failed fetches retry with the doubling delay.
//     A committed edit, notice or reconnect refresh starts a new chain.
//     Committed edits keep the local copy current until saving succeeds.
//     Remove only this session's local copy once a save leaves it clean.
//     The conflict property stays true throughout recovery until the merged
//     document is saved or clean again, and while recovery is stopped.
//   - any other failure: the current document is written to
//     `<id>.recovery.json`; a transient one (no answer, 5xx, 429) is retried
//     with a doubling delay, up to 30 s.
// A recovery or conflict file that cannot be written is reported
// (`recoveryError`, `lastError`). The client never saves without a base.
//
// Dirty compares the document and editable row settings (fps, width, height)
// with acknowledged content, so a merged command, an undo during a save, or a branch
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
// External sync starts on a zero-delay timer, unless setExternalSync(false)
// disables it first. Updated notices ignore own echoes and coalesce during
// saves/fetches. Reconnect/resync fetches once, merging without ops. Fetches
// resolve assets and probe media off the GUI thread. Only newer copies apply,
// after any gesture preview ends. Clean editors adopt without a save. Dirty
// editors merge against the last loaded/adopted/saved document, acknowledge
// the server content, retain refused units' previous merge base, and debounce
// a save of the merged draft. Refused values are offered as externalConflicts.
// Accept is one undoable acceptExternalUnit edit. Discard keeps the draft.
// Known difference from web rebaseTimelineSnapshots: setTimeline clears native
// undo history on adopt/merge, making external work the new base. Rebasing
// native history requires a TimelineModel API outside this controller.
// A missing applier or invalid merge keeps the draft and a local copy, with
// an error. A deleted sequence stops server writes and keeps committed work
// locally. Quit allows one synchronous CAS recovery within its total budget.
//
// Startup archives earlier recovery/local files with a timestamp and unique
// suffix, preserving their kind. Backup and namespaced fallback folders are
// scanned, including archives from older launches. `earlierCopy` offers one
// at a time. Restore applies document content through one restoreDocument
// edit, preserving the loaded sequence row and save base. Even after server
// acknowledgement the archive stays offered until explicit Discard.

#include "server/ServerClient.h"
#include "server/ServerTimeline.h"
#include "server/sync/ResourceChangeClient.h"
#include "server/sync/TimelineMerge.h"

#include <QElapsedTimer>
#include <QDeadlineTimer>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QStringList>
#include <QTimer>
#include <QUrl>
#include <QVariantList>

#include <cstdio>
#include <functional>
#include <memory>
#include <vector>

class QUndoStack;
class QThread;

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
    Q_PROPERTY(QString externalState READ externalState NOTIFY stateChanged)
    Q_PROPERTY(QVariantList externalConflicts READ externalConflicts NOTIFY stateChanged)
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
    ~AutosaveController() override;

    // Test seam: scheduled or running fetch workers, across controllers.
    static int liveFetchWorkers();

    QString externalState() const { return m_externalState; }
    QVariantList externalConflicts() const;
    Q_INVOKABLE bool acceptExternalConflict(const QString& id, QObject* timeline);
    Q_INVOKABLE bool discardExternalConflict(const QString& id);
    Q_INVOKABLE void setExternalSync(bool on);
    // Test seam: overrides only the WebSocket origin, before deferred startup.
    void setExternalSyncUrl(const QUrl& url) { m_syncUrl = url; }
    Q_INVOKABLE void externalChanged(QString event, QString updatedAt, QJsonArray ops, bool hasOps);
    Q_INVOKABLE void refreshExternal();
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
    void restartStoppedChain();
    void startExternalSync();
    void queueExternal(const QJsonArray& ops, bool hasOps, bool withoutOps);
    void processExternal();
    void fetchExternal(bool recovery);
    bool applyFetched();
    void syncFailure(const QString& error, bool recovery);
    void clearLocalCopyIfClean();
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
    bool m_retryRecovery = false;
    QPointer<QThread> m_fetchWorker;
    QTimer m_externalRetry;
    std::unique_ptr<sync::ResourceChangeClient> m_changes;
    QUrl m_syncUrl;
    QJsonObject m_mergeBase;
    struct ExternalConflict {
        sync::MergeConflict unit;
        std::vector<nt::Clip> media;
    };
    QList<ExternalConflict> m_externalConflicts;
    QString m_externalState = QStringLiteral("idle");
    bool m_externalSync = true;
    bool m_fetching = false;
    bool m_deleted = false;
    bool m_pendingExternal = false;
    bool m_pendingHasOps = true;
    bool m_pendingWithoutOps = false;
    QJsonArray m_pendingOps;
    bool m_activeHasOps = false;
    bool m_activeWithoutOps = false;
    QJsonArray m_activeOps;
    bool m_recovering = false;
    int m_casRecoveries = 0;
    bool m_flushing = false;
    std::optional<QDeadlineTimer> m_quitDeadline;
    std::optional<nt::Timeline> m_fetched;
    QElapsedTimer m_fetchElapsed;
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
    bool m_recoveryStopped = false;
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
