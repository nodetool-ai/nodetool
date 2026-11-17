#include "TimelineProjectFiles.h"

#include "server/AutosaveController.h"
#include "server/ServerSource.h"
#include "server/projectfolder/ProjectFolderState.h"

TimelineProjectFiles::TimelineProjectFiles(QObject* parent) : QObject(parent) {
    // A fixture timeline has no server, so the tree shows that it has no folder.
    if (const auto target = nt::server::serverSaveTarget()) { m_files.configure(target->server, target->token, {}); }
}

TimelineProjectFiles::~TimelineProjectFiles() {
    disconnect(m_folderConnection);
    disconnect(m_autosaveConnection);
}

void TimelineProjectFiles::setFolder(ProjectFolderState* folder) {
    if (folder == m_folder) { return; }
    disconnect(m_folderConnection);
    m_folder = folder;
    if (folder) { m_folderConnection = connect(folder, &ProjectFolderState::changed, this, &TimelineProjectFiles::syncFolder); }
    syncFolder();
    emit folderChanged();
}

void TimelineProjectFiles::setAutosave(QObject* autosave) {
    if (autosave == m_autosave) { return; }
    disconnect(m_autosaveConnection);
    m_autosave = autosave;
    if (auto* controller = qobject_cast<nt::server::AutosaveController*>(autosave)) {
        m_autosaveConnection = connect(controller, &nt::server::AutosaveController::workspaceFilesChanged, &m_files,
                                       &nodetool::files::ProjectFiles::workspaceFilesChanged);
    }
    emit autosaveChanged();
}

void TimelineProjectFiles::syncFolder() {
    if (!m_folder) {
        m_files.setFolder({});
        return;
    }
    m_files.setProject(m_folder->projectId());
    // Reveal needs the folder on this machine, as ProjectFolderState::canReveal says.
    m_files.setFolder(m_folder->workspaceId(), m_folder->canReveal() ? m_folder->folderPath() : QString());
}
