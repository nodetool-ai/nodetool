#include "server/projectfolder/ProjectFolderState.h"

#include "server/BundledServer.h"
#include "server/ServerSource.h"

#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QRegularExpression>

namespace {
constexpr qint64 MaxProjectMetadataBytes = 64 * 1024;

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

std::optional<ProjectFolderState::LocalProject> ProjectFolderState::findEnclosingProjectFolder(const QString& filePath) {
    if (filePath.isEmpty()) { return std::nullopt; }
    const QFileInfo startInfo(filePath);
    QDir dir = startInfo.isDir() ? QDir(startInfo.absoluteFilePath()) : startInfo.absoluteDir();
    if (!dir.exists()) { return std::nullopt; }
    while (true) {
        const QFileInfo metaInfo(dir.filePath(QStringLiteral(".nodetool/project.json")));
        if (metaInfo.isFile() && metaInfo.size() <= MaxProjectMetadataBytes) {
            QFile file(metaInfo.filePath());
            if (file.open(QIODevice::ReadOnly)) {
                QJsonParseError parseError{};
                const QJsonDocument doc = QJsonDocument::fromJson(file.readAll(), &parseError);
                if (parseError.error == QJsonParseError::NoError && doc.isObject()) {
                    const QJsonObject obj = doc.object();
                    const QJsonValue version = obj.value(u"version");
                    const QString id = obj.value(u"id").toString().trimmed();
                    if (obj.value(u"format").toString() == u"nodetool.project"
                        && version.isDouble() && version.toDouble() == 1.0 && !id.isEmpty()) {
                        QString name = obj.value(u"name").toString().trimmed();
                        if (name.isEmpty()) { name = dir.dirName(); }
                        const QString canonical = QFileInfo(dir.absolutePath()).canonicalFilePath();
                        return LocalProject{id, name, canonical.isEmpty() ? dir.absolutePath() : canonical};
                    }
                }
            }
        }
        if (!dir.cdUp()) { break; }
    }
    return std::nullopt;
}

void ProjectFolderState::Worker::run() {
    nt::server::ServerClient client(m_target.server, m_target.token, 10000);
    client.setExpectedInstance(m_target.expectedInstance);
    result = m_work(client);
}

QUrl ProjectFolderState::bundledServerUrl() { return nt::server::bundledServerUrl(); }

bool ProjectFolderState::canTransfer() const {
    // A project folder has a generated id. Personal and a loose timeline have none to link.
    static const QRegularExpression fullId(QStringLiteral("^[0-9a-f]{32}$"));
    const auto bundled = bundledServerUrl();
    return m_loaded && m_target && hasFolder() && bundled.isValid() && !bundled.isEmpty()
           && m_target->server.adjusted(QUrl::StripTrailingSlash) == bundled.adjusted(QUrl::StripTrailingSlash)
           && fullId.match(m_projectId).hasMatch();
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

QString ProjectFolderState::documentSourcePath() const {
    return m_timeline ? m_timeline->sourcePath() : QString{};
}

QString ProjectFolderState::documentKey() const {
    return (m_target ? m_target->server.toString() : QString{}) + QChar(0) + documentProject() + QChar(0)
           + documentTimeline() + QChar(0) + documentSourcePath();
}

void ProjectFolderState::documentChanged() {
    if (!m_explicitTarget) {
        m_target = nt::server::serverSaveTarget();
    }
    // Every edit notifies. Only a new server, project, timeline or local file refreshes.
    if (m_wanted && documentKey() != m_requestKey) { refresh(); }
}

void ProjectFolderState::applyLocalFolder() {
    m_requestKey = documentKey();
    m_error.clear();
    m_locateError.clear();
    m_restoreError.clear();
    m_workspaceId.clear();
    m_fileState.clear();
    m_filePath.clear();
    m_fileError.clear();
    if (const auto local = findEnclosingProjectFolder(documentSourcePath())) {
        m_loaded = true;
        m_localFolder = true;
        m_projectId = local->id;
        m_projectName = local->name;
        m_folderPath = local->folderPath;
        m_folderAccessible = QFileInfo(m_folderPath).isDir();
    } else {
        m_loaded = false;
        m_localFolder = false;
        m_projectId.clear();
        m_projectName.clear();
        m_folderPath.clear();
        m_folderAccessible = true;
    }
    emit changed();
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
    if (!m_timeline) { return; }
    if (!m_target) {
        applyLocalFolder();
        return;
    }
    if (busy()) {
        m_refreshPending = true;
        return;
    }
    m_requestKey = documentKey();
    run([project = documentProject(), timeline = documentTimeline()](nt::server::ServerClient& client) {
        Result result;
        const auto projects = client.query(QStringLiteral("projects.list"), {});
        if (!projects.ok()) {
            result.error = projects.describe();
            return result;
        }
        result.project = findProject(projects.data.toArray(), project);
        if (!result.project && !loose(project)) {
            const auto archived = client.query(QStringLiteral("projects.archived"), {});
            if (archived.ok()) {
                result.project = findProject(archived.data.toArray(), project);
            }
        }
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
    m_localFolder = false;
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
