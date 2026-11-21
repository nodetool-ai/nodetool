#pragma once

// The Files dock's tree for the timeline: a NodeTool.Files ProjectFiles that
// follows the open timeline's project folder (ProjectFolderState) and the
// autosave socket's `workspacefile` pushes. It talks to the server the
// timeline was opened from, with that server's token. Credentials stay in the
// ProjectFiles it owns.
//
// UI thread only. It owns m_files by value and at most one LookupWorker
// QThread at a time while resolving a clicked .timeline.json file via
// projects.documentByFile. The destructor interrupts and waits on any running
// lookup worker. The folder, autosave controller, and session belong to the
// editor/app, so they are held as QPointer and their connections end in the
// destructor.

#include "ProjectFiles.h"

#include <QObject>
#include <QPointer>
#include <QThread>
#include <QtQmlIntegration/qqmlintegration.h>

#include "server/projectfolder/ProjectFolderState.h"

namespace nt::server {
class TimelineSession;
}

class TimelineProjectFiles : public QObject {
    Q_OBJECT
    QML_ELEMENT
    // The nodetool::files::ProjectFiles that FilesPanel.qml takes.
    Q_PROPERTY(QObject* files READ files CONSTANT)
    Q_PROPERTY(ProjectFolderState* folder READ folder WRITE setFolder NOTIFY folderChanged)
    // The AutosaveController of the open server timeline, or null.
    Q_PROPERTY(QObject* autosave READ autosave WRITE setAutosave NOTIFY autosaveChanged)
    // The active window's TimelineSession for opening timeline files in place.
    Q_PROPERTY(QObject* session READ session WRITE setSession NOTIFY sessionChanged)
    Q_PROPERTY(bool opening READ opening NOTIFY openStateChanged)
    Q_PROPERTY(QString openError READ openError NOTIFY openStateChanged)
public:
    explicit TimelineProjectFiles(QObject* parent = nullptr);
    ~TimelineProjectFiles() override;

    QObject* files() { return &m_files; }
    nodetool::files::ProjectFiles& model() { return m_files; }
    ProjectFolderState* folder() const { return m_folder; }
    void setFolder(ProjectFolderState* folder);
    QObject* autosave() const { return m_autosave; }
    void setAutosave(QObject* autosave);
    QObject* session() const;
    void setSession(QObject* session);
    bool opening() const { return !m_lookup.isNull() || m_awaitingSwitch; }
    QString openError() const { return m_openError; }
    Q_INVOKABLE void clearOpenError();
    // Retries folder resolution when the project folder could not be loaded,
    // or refreshes the file listing otherwise.
    Q_INVOKABLE void retry();

signals:
    void folderChanged();
    void autosaveChanged();
    void sessionChanged();
    void openStateChanged();

private:
    class LookupWorker : public QThread {
    public:
        LookupWorker(QUrl server, QString token, QString expectedInstance, QString projectId, QString path,
                     QObject* parent)
            : QThread(parent),
              m_server(std::move(server)),
              m_token(std::move(token)),
              m_expectedInstance(std::move(expectedInstance)),
              m_projectId(std::move(projectId)),
              m_path(std::move(path)) {}
        QString timelineId;
        QString timelineName;
        QString error;

    protected:
        void run() override;

    private:
        QUrl m_server;
        QString m_token;
        QString m_expectedInstance;
        QString m_projectId;
        QString m_path;
    };

    void syncFolder();
    void openFile(const QString& relativePath);
    void setOpenError(const QString& error);
    void stopLookup();
    nodetool::files::ProjectFiles m_files;
    QPointer<ProjectFolderState> m_folder;
    QPointer<QObject> m_autosave;
    QPointer<nt::server::TimelineSession> m_session;
    QPointer<LookupWorker> m_lookup;
    quint64 m_lookupGeneration = 0;
    bool m_awaitingSwitch = false;
    QString m_openError;
    QUrl m_configuredOrigin;
    QString m_configuredToken;
    QMetaObject::Connection m_folderConnection, m_autosaveConnection, m_sessionSwitched, m_sessionFailed;
};
