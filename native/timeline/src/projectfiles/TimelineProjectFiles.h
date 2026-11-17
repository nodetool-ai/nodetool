#pragma once

// The Files dock's tree for the timeline: a NodeTool.Files ProjectFiles that
// follows the open timeline's project folder (ProjectFolderState) and the
// autosave socket's `workspacefile` pushes. It talks to the server the
// timeline was opened from, with that server's token. Credentials stay in the
// ProjectFiles it owns.
//
// UI thread only. It owns m_files by value. The folder and the autosave
// controller belong to the editor, so they are held as QPointer and their
// connections end in the destructor.

#include "ProjectFiles.h"

#include <QObject>
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

#include "server/projectfolder/ProjectFolderState.h"

class TimelineProjectFiles : public QObject {
    Q_OBJECT
    QML_ELEMENT
    // The nodetool::files::ProjectFiles that FilesPanel.qml takes.
    Q_PROPERTY(QObject* files READ files CONSTANT)
    Q_PROPERTY(ProjectFolderState* folder READ folder WRITE setFolder NOTIFY folderChanged)
    // The AutosaveController of the open server timeline, or null.
    Q_PROPERTY(QObject* autosave READ autosave WRITE setAutosave NOTIFY autosaveChanged)
public:
    explicit TimelineProjectFiles(QObject* parent = nullptr);
    ~TimelineProjectFiles() override;

    QObject* files() { return &m_files; }
    nodetool::files::ProjectFiles& model() { return m_files; }
    ProjectFolderState* folder() const { return m_folder; }
    void setFolder(ProjectFolderState* folder);
    QObject* autosave() const { return m_autosave; }
    void setAutosave(QObject* autosave);

signals:
    void folderChanged();
    void autosaveChanged();

private:
    void syncFolder();
    nodetool::files::ProjectFiles m_files;
    QPointer<ProjectFolderState> m_folder;
    QPointer<QObject> m_autosave;
    QMetaObject::Connection m_folderConnection, m_autosaveConnection;
};
