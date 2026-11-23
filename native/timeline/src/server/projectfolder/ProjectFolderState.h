#pragma once

// The folder of the open timeline's project and the state of the timeline's
// file in it (docs/project-folders/prd.md). UI thread only. Server calls run
// on one worker thread at a time, which reads only the values it captured.
//
// - `projects.list` gives the project's folder: its path, whether the server
//   can reach it, and the workspace whose files it holds. A loose timeline
//   (no project, or "default") is in Personal.
// - `projects.documents` gives the timeline's file: `ok`, `invalid` (a file
//   edit was refused, with the error) or `missing`.
// - locate: `projects.relocate` points the project at the folder's new place.
// - restoreFile: `projects.restoreDocumentFile` writes a missing file again.
// After the first refresh(), a new project or timeline in the document, a
// successful Locate, and the autosave socket's `documentfile` push for this
// timeline refresh the state. A refresh asked while a call runs runs once
// after it.
// - lock: the project lock `.nodetool/open.lock` (WP2.13). While another app
//   holds it the timeline is read-only and ProjectLockBanner names the
//   holder. The timeline app opens one timeline per process, so this object
//   keeps the process's ProjectLocks.

#include "model/TimelineModel.h"
#include "server/AutosaveController.h"

#include "nodetool/account/project_lock.h"
#include "nodetool/account/qt/ProjectLockState.h"

#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QThread>
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <optional>

class ProjectFolderState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    // The AutosaveController of the open server timeline, or null.
    Q_PROPERTY(QObject* autosave READ autosave WRITE setAutosave NOTIFY autosaveChanged)
    Q_PROPERTY(bool configured READ configured NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool loaded READ loaded NOTIFY changed)
    // The project the server answered for: Personal for a loose timeline.
    Q_PROPERTY(QString projectId READ projectId NOTIFY changed)
    Q_PROPERTY(QString projectName READ projectName NOTIFY changed)
    // False until the project is known, and for a project without a folder.
    Q_PROPERTY(bool hasFolder READ hasFolder NOTIFY changed)
    // True when a local timeline file opened from disk sits inside a folder with
    // `.nodetool/project.json` and there is no server save target.
    Q_PROPERTY(bool localFolder READ isLocalFolder NOTIFY changed)
    // Absolute on the server's disk; empty for a cloud folder.
    Q_PROPERTY(QString folderPath READ folderPath NOTIFY changed)
    Q_PROPERTY(bool folderAccessible READ folderAccessible NOTIFY changed)
    Q_PROPERTY(QString workspaceId READ workspaceId NOTIFY changed)
    // The folder exists on this machine, so the file manager can show it.
    Q_PROPERTY(bool canReveal READ canReveal NOTIFY changed)
    // "ok", "invalid", "missing", or empty when the timeline has no file.
    Q_PROPERTY(QString fileState READ fileState NOTIFY changed)
    Q_PROPERTY(QString filePath READ filePath NOTIFY changed)
    Q_PROPERTY(QString fileError READ fileError NOTIFY changed)
    // Why the last refresh failed, why Locate was refused, why Restore failed.
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QString locateError READ locateError NOTIFY changed)
    Q_PROPERTY(QString restoreError READ restoreError NOTIFY changed)
    // The open timeline's server and its token, which run a transfer of the project.
    Q_PROPERTY(QUrl serverUrl READ serverUrl NOTIFY changed)
    Q_PROPERTY(QString serverToken READ serverToken NOTIFY changed)
    // The server this launch of the app started or joined, or empty.
    Q_PROPERTY(QUrl bundledServerUrl READ bundledServerUrl NOTIFY changed)
    // The project is a folder on that bundled server, so File > Publish to
    // Cloud and Synchronize can open the review sheet for it.
    Q_PROPERTY(bool canTransfer READ canTransfer NOTIFY changed)
    // The project lock of the folder on this computer.
    Q_PROPERTY(nodetool::account::qt::ProjectLockState* lock READ lock CONSTANT)
public:
    explicit ProjectFolderState(QObject* parent = nullptr);
    ~ProjectFolderState() override;

    struct LocalProject {
        QString id;
        QString name;
        QString folderPath;
    };
    // Walks up from a local file path looking for `.nodetool/project.json`.
    static std::optional<LocalProject> findEnclosingProjectFolder(const QString& filePath);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QObject* autosave() const { return m_autosave; }
    void setAutosave(QObject* autosave);
    bool configured() const { return m_target.has_value(); }
    bool busy() const { return !m_thread.isNull(); }
    bool loaded() const { return m_loaded; }
    QString projectId() const { return m_projectId; }
    QString projectName() const { return m_projectName; }
    bool hasFolder() const { return !m_workspaceId.isEmpty() || m_localFolder; }
    bool isLocalFolder() const { return m_localFolder; }
    QString folderPath() const { return m_folderPath; }
    bool folderAccessible() const { return m_folderAccessible; }
    QString workspaceId() const { return m_workspaceId; }
    bool canReveal() const;
    QString fileState() const { return m_fileState; }
    QString filePath() const { return m_filePath; }
    QString fileError() const { return m_fileError; }
    QString error() const { return m_error; }
    QString locateError() const { return m_locateError; }
    QString restoreError() const { return m_restoreError; }
    QUrl serverUrl() const { return m_target ? m_target->server : QUrl(); }
    QString serverToken() const { return m_target ? m_target->token : QString(); }
    static QUrl bundledServerUrl();
    bool canTransfer() const;
    nodetool::account::qt::ProjectLockState* lock() { return &m_lock; }

    Q_INVOKABLE void refresh();
    // Opens the folder in the platform's file manager. False when it is not on this machine.
    Q_INVOKABLE bool reveal();
    Q_INVOKABLE void locate(const QUrl& folder);
    Q_INVOKABLE void restoreFile();
    // The label of reveal() on this platform.
    Q_INVOKABLE static QString revealLabel();

    // Test seam: the server, instead of the open timeline's (serverSaveTarget).
    void setTarget(const nt::server::SaveTarget& target) {
        m_explicitTarget = true;
        m_target = target;
        emit changed();
    }

signals:
    void timelineChanged();
    void autosaveChanged();
    void changed();

private:
    enum class Call { Refresh, Locate, Restore };
    struct Result {
        Call call = Call::Refresh;
        std::optional<QJsonObject> project;  // the projects.list row, when found
        std::optional<QJsonObject> file;     // the timeline's file, when the call asked
        bool fileAsked = false;
        bool refreshAfter = false;
        QString error;
    };
    using Work = std::function<Result(nt::server::ServerClient&)>;
    // Runs one call on its own thread with its own client. The result is
    // read on the UI thread after `finished`.
    class Worker : public QThread {
    public:
        Worker(Work work, nt::server::SaveTarget target, QObject* parent)
            : QThread(parent), m_work(std::move(work)), m_target(std::move(target)) {}
        Result result;
    protected:
        void run() override;
    private:
        Work m_work;
        nt::server::SaveTarget m_target;
    };
    void run(Work work);
    void receive(const Result& result);
    void applyLocalFolder();
    void documentChanged();
    QString documentProject() const;
    QString documentTimeline() const;
    QString documentSourcePath() const;
    QString documentKey() const;
    // Names the folder to the lock when it is on this computer.
    void updateLock();
    // The timeline is read-only while another app holds the lock.
    void applyLock();

    std::optional<nt::server::SaveTarget> m_target;
    bool m_explicitTarget = false;
    QPointer<TimelineModel> m_timeline;
    QPointer<nt::server::AutosaveController> m_autosave;
    QPointer<Worker> m_thread;  // a child of this object while it runs
    bool m_refreshPending = false;
    bool m_wanted = false;  // refresh() was asked once, so document changes refresh
    bool m_loaded = false;
    bool m_localFolder = false;
    QString m_requestKey;  // the project and timeline the last refresh asked for
    QString m_projectId;  // the project the server answered for, Personal for a loose timeline
    QString m_projectName;
    QString m_folderPath;
    bool m_folderAccessible = true;
    QString m_workspaceId;
    QString m_fileState;
    QString m_filePath;
    QString m_fileError;
    QString m_error;
    QString m_locateError;
    QString m_restoreError;
    bool m_lockedTimeline = false;  // applyLock() made m_timeline read-only
    // Declared last, so the lock state gives back its count before the
    // locks it borrows are destroyed.
    nodetool::account::ProjectLocks m_locks{"timeline"};
    nodetool::account::qt::ProjectLockState m_lock{&m_locks};
};
