#include "export/ExportController.h"
#include "export/ExportCapabilities.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUrl>

ExportController::ExportController(QObject* parent) : QObject(parent) {
    connect(&m_process, &QProcess::stateChanged, this, &ExportController::runningChanged);
    connect(&m_process, &QProcess::readyReadStandardError, this, &ExportController::readProgress);
    connect(&m_process, &QProcess::finished, this, [self = QPointer<ExportController>(this)](int code, QProcess::ExitStatus status) {
        if (!self) return;
        self->readProgress();
        const bool success = code == 0 && status == QProcess::NormalExit;
        if (!success && !(self->m_cancelled && code == 3)) {
            self->m_error = QString::fromUtf8(self->m_diagnostics).trimmed();
            if (self->m_error.isEmpty()) self->m_error = QStringLiteral("Export failed");
            emit self->errorChanged();
        }
        self->m_job.reset();
        emit self->finished(success);
    });
    connect(&m_process, &QProcess::errorOccurred, this, [self = QPointer<ExportController>(this)](QProcess::ProcessError error) {
        if (self && error == QProcess::FailedToStart) {
            self->m_job.reset();
            self->fail(self->m_process.errorString());
        }
    });
}
ExportController::~ExportController() {
    if (running()) {
        cancel();
        // The child owns the transactional output. Let its cancellation path
        // remove that output before removing the snapshot and cancel token.
        m_process.waitForFinished(-1);
    }
}
bool ExportController::mp4Supported() const { return nt::exporting::mp4Available(); }
void ExportController::setTimeline(TimelineModel* model) {
    if (m_timeline == model) return;
    m_timeline = model;
    emit timelineChanged();
}
void ExportController::open() { if (!running()) emit openRequested(); }
void ExportController::fail(const QString& message) {
    m_error = message;
    emit errorChanged();
    emit finished(false);
}
void ExportController::start(const QString& output, const QString& format, bool alpha) {
    if (running()) return;
    if (!m_timeline) { fail(QStringLiteral("Open a timeline before exporting.")); return; }
    m_job = std::make_unique<QTemporaryDir>();
    if (!m_job->isValid()) { fail(QStringLiteral("Cannot create export snapshot")); return; }
    auto raw = QJsonDocument::fromJson(m_timeline->documentJson()).object();
    QJsonArray clips;
    for (const auto& clip : m_timeline->timeline().clips) {
        auto json = clip.raw;
        if (!clip.mediaPath.empty()) json.insert("mediaPath", QString::fromStdString(clip.mediaPath));
        if (!clip.audioPath.empty()) json.insert("audioPath", QString::fromStdString(clip.audioPath));
        clips.append(json);
    }
    raw.insert("clips", clips);
    QFile snapshot(m_job->filePath("timeline.json"));
    const auto bytes = QJsonDocument(raw).toJson(QJsonDocument::Compact);
    if (!snapshot.open(QIODevice::WriteOnly) || snapshot.write(bytes) != bytes.size()) {
        m_job.reset(); fail(QStringLiteral("Cannot write export snapshot")); return;
    }
    snapshot.close();
    m_error.clear();
    m_pending.clear();
    m_diagnostics.clear();
    m_cancelled = false;
    m_phase = QStringLiteral("preparing");
    m_frame = m_total = 0;
    m_ratio = 0;
    emit errorChanged();
    emit progressChanged();
    QString path = output;
    if (QUrl(output).isLocalFile()) path = QUrl(output).toLocalFile();
    QStringList args{snapshot.fileName(), "--export", path, "--format", format, "--cancel-file", m_job->filePath("cancel"), "--json"};
    if (alpha) args.append("--alpha");
    m_process.start(m_executable.isEmpty() ? QCoreApplication::applicationFilePath() : m_executable, args);
}
void ExportController::cancel() {
    if (!m_job || !running()) return;
    m_cancelled = true;
    QFile token(m_job->filePath("cancel"));
    if (!token.open(QIODevice::WriteOnly)) fail(QStringLiteral("Cannot cancel export"));
}
void ExportController::readProgress() {
    m_pending += m_process.readAllStandardError();
    for (;;) {
        const auto end = m_pending.indexOf('\n');
        if (end < 0) break;
        const auto line = m_pending.left(end);
        m_pending.remove(0, end + 1);
        if (line.startsWith("export-progress ")) {
            const auto progress = QJsonDocument::fromJson(line.mid(16)).object();
            m_phase = progress.value("phase").toString();
            m_frame = progress.value("frame").toInteger();
            m_total = progress.value("totalFrames").toInteger();
            m_ratio = progress.value("ratio").toDouble();
            emit progressChanged();
        } else {
            m_diagnostics += line + '\n';
            if (m_diagnostics.size() > 8192) m_diagnostics = m_diagnostics.right(8192);
        }
    }
}
