#include "server/projectfolder/ProjectFolderState.h"

#include "server/ServerSource.h"

#include <QDesktopServices>
#include <QFileInfo>
#include <QJsonArray>

namespace {
bool loose(const QString& projectId) { return projectId.isEmpty() || projectId == u"default"; }

// The projects.list row of `projectId`, or Personal's for a loose timeline.
std::optional<QJsonObject> findProject(const QJsonArray& rows, const QString& projectId) {
    for (const auto& value : rows) {
        const auto row = value.toObject();
        if (loose(projectId) ? row.value("isPersonal").toBool() : row.value("id").toString() == projectId) {
            return row;
        }
    }
    return std::nullopt;
}
}  // namespace

void ProjectFolderState::Worker::run() {
    nt::server::ServerClient client(m_target.server, m_target.token, 10000);
    client.setExpectedInstance(m_target.expectedInstance);
    result = m_work(client);
}

ProjectFolderState::ProjectFolderState(QObject* parent)
    : QObject(parent), m_target(nt::server::serverSaveTarget()) {}

ProjectFolderState::~ProjectFolderState() {
    if (auto* thread = m_thread.data()) {
        disconnect(thread, nullptr, this, nullptr);
        thread->requestInterruption();
        if (!thread->wait(1000)) {
            // The worker reads only what it captured. Never delete a running
            // thread: it deletes itself when it finishes.
            thread->setParent(nullptr);
            connect(thread, &QThread::finished, thread, &QObject::deleteLater);
            if (thread->isFinished()) { thread->deleteLater(); }
        }
    }
}

void ProjectFolderState::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::timelineChanged, this, &ProjectFolderState::documentChanged);
    }
    emit timelineChanged();
    documentChanged();
}

void ProjectFolderState::setAutosave(QObject* object) {
    auto* autosave = qobject_cast<nt::server::AutosaveController*>(object);
    if (m_autosave == autosave) { return; }
    if (m_autosave) { disconnect(m_autosave, nullptr, this, nullptr); }
    m_autosave = autosave;
    if (autosave) {
        connect(autosave, &nt::server::AutosaveController::documentFileChanged, this, [this](const QJsonObject& resource) {
            if (!documentTimeline().isEmpty() && resource.value("id").toString() == documentTimeline()) { refresh(); }
        });
    }
    emit autosaveChanged();
}

QString ProjectFolderState::documentProject() const {
    return m_timeline ? m_timeline->timeline().raw.value("projectId").toString() : QString{};
}

QString ProjectFolderState::documentTimeline() const {
    return m_timeline ? m_timeline->timeline().raw.value("id").toString() : QString{};
}

void ProjectFolderState::documentChanged() {
    // Every edit notifies. Only a new project or timeline asks the server again.
    if (m_wanted && documentProject() + QChar(0) + documentTimeline() != m_requestKey) { refresh(); }
}

bool ProjectFolderState::canReveal() const {
    return !m_folderPath.isEmpty() && QFileInfo(m_folderPath).isDir();
}

QString ProjectFolderState::revealLabel() {
#if defined(Q_OS_MACOS)
    return QStringLiteral("Reveal in Finder");
#elif defined(Q_OS_WIN)
    return QStringLiteral("Show in File Explorer");
#else
    return QStringLiteral("Show in file manager");
#endif
}

bool ProjectFolderState::reveal() {
    return canReveal() && QDesktopServices::openUrl(QUrl::fromLocalFile(m_folderPath));
}

void ProjectFolderState::refresh() {
    m_wanted = true;
    if (!m_target || !m_timeline) { return; }
    if (busy()) {
        m_refreshPending = true;
        return;
    }
    m_requestKey = documentProject() + QChar(0) + documentTimeline();
    run([project = documentProject(), timeline = documentTimeline()](nt::server::ServerClient& client) {
        Result result;
        const auto projects = client.query(QStringLiteral("projects.list"), {});
        if (!projects.ok()) {
            result.error = projects.describe();
            return result;
        }
        result.project = findProject(projects.data.toArray(), project);
        if (!result.project || timeline.isEmpty()) { return result; }
        const auto documents = client.query(QStringLiteral("projects.documents"),
                                            {{"id", result.project->value("id").toString()}});
        if (!documents.ok()) {
            result.error = documents.describe();
            return result;
        }
        result.fileAsked = true;
        for (const auto& value : documents.data.toArray()) {
            const auto entry = value.toObject();
            if (entry.value("type").toString() == u"timeline" && entry.value("ref").toString() == timeline) {
                if (entry.value("file").isObject()) { result.file = entry.value("file").toObject(); }
                break;
            }
        }
        return result;
    });
}

void ProjectFolderState::locate(const QUrl& folder) {
    if (!m_target || busy() || !m_loaded) { return; }
    const auto path = folder.isLocalFile() ? folder.toLocalFile() : folder.toString();
    const auto project = m_projectId;
    run([project, path](nt::server::ServerClient& client) {
        Result result;
        result.call = Call::Locate;
        const auto response = client.mutate(QStringLiteral("projects.relocate"), {{"project_id", project}, {"path", path}});
        if (!response.ok()) {
            result.error = QStringLiteral("Could not locate the folder: %1").arg(response.error.message);
            return result;
        }
        result.project = response.data.toObject();
        result.refreshAfter = true;
        return result;
    });
}

void ProjectFolderState::restoreFile() {
    if (!m_target || busy() || documentTimeline().isEmpty()) { return; }
    run([timeline = documentTimeline()](nt::server::ServerClient& client) {
        Result result;
        result.call = Call::Restore;
        const auto response = client.mutate(QStringLiteral("projects.restoreDocumentFile"),
                                            {{"type", "timeline"}, {"ref", timeline}});
        if (!response.ok()) {
            result.error = QStringLiteral("The file was not restored: %1").arg(response.error.message);
            return result;
        }
        result.fileAsked = true;
        result.file = response.data.toObject().value("file").toObject();
        return result;
    });
}

void ProjectFolderState::run(Work work) {
    auto* worker = new Worker(std::move(work), *m_target, this);  // parent: this, until it finishes
    m_thread = worker;
    connect(worker, &QThread::finished, this, [this, guard = QPointer<Worker>(worker)] {
        if (!guard) { return; }
        const Result result = guard->result;
        guard->deleteLater();
        m_thread.clear();
        receive(result);
        if (m_refreshPending || result.refreshAfter) {
            m_refreshPending = false;
            refresh();
        }
        emit changed();
    });
    emit changed();
    worker->start();
}

void ProjectFolderState::receive(const Result& result) {
    switch (result.call) {
    case Call::Refresh: m_error = result.error; break;
    case Call::Locate: m_locateError = result.error; break;
    case Call::Restore: m_restoreError = result.error; break;
    }
    if (!result.error.isEmpty()) { return; }
    m_loaded = true;
    const auto project = result.project.value_or(QJsonObject{});
    m_projectId = project.value("id").toString();
    m_projectName = project.value("name").toString();
    const auto folder = project.value("folder").toObject();
    m_workspaceId = folder.value("workspace_id").toString();
    m_folderPath = folder.value("path").toString();
    m_folderAccessible = folder.isEmpty() || folder.value("is_accessible").toBool(true);
    if (result.fileAsked) {
        const auto file = result.file.value_or(QJsonObject{});
        m_fileState = file.value("state").toString();
        m_filePath = file.value("path").toString();
        m_fileError = file.value("error").toString();
    }
}
