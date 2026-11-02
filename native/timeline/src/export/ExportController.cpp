#include "export/ExportController.h"
#include "activity/local/LocalActivityStore.h"
#include "assets/AssetMedia.h"
#include "export/ExportCapabilities.h"
#include "preview/effects/Masks.h"
#include <QCoreApplication>
#include <QFile>
#include <QFileInfo>
#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUrl>
#include <algorithm>

QJsonObject nt::exporting::exportSnapshot(const TimelineModel& model) {
    auto raw = model.timeline().raw;
    QJsonArray clips;
    double duration = model.timeline().clips.empty() ? model.timeline().durationMs : 0;
    for (const auto& clip : model.timeline().clips) {
        duration = std::max(duration, clip.endMs());
        auto json = clip.raw;
        const auto& picture = clip.originalMediaPath.empty() ? clip.mediaPath : clip.originalMediaPath;
        if (!picture.empty()) json.insert("mediaPath", QString::fromStdString(picture));
        if (!clip.originalMediaPath.empty()) json.insert("originalMediaPath", QString::fromStdString(clip.originalMediaPath));
        if (!clip.audioPath.empty()) json.insert("audioPath", QString::fromStdString(clip.audioPath));
        const auto mattePath = nt::effects::resolvedGeneratedMattePath(clip);
        if (!mattePath.isEmpty()) {
            auto matte = json.value("generatedMatte").toObject();
            matte.insert("mediaPath", mattePath);
            json.insert("generatedMatte", matte);
        }
        clips.append(json);
    }
    raw.insert("clips", clips);
    raw.insert("durationMs", duration);
    return raw;
}

QString nt::exporting::unavailableOriginalMedia(const nt::Timeline& timeline, bool videoOutput) {
    for (const auto& clip : timeline.clips) {
        const auto label = QString::fromStdString(clip.name.empty() ? clip.id : clip.name);
        if (videoOutput && (clip.mediaType == nt::MediaType::Video || clip.mediaType == nt::MediaType::Image)) {
            const auto assetId = clip.raw.value("currentAssetId").toString();
            if (!assetId.isEmpty() && clip.originalMediaPath.empty()) {
                return QStringLiteral("The original media for %1 is unavailable. Reconnect and reload the timeline before exporting.").arg(label);
            }
            if (!clip.originalMediaPath.empty() && !QFileInfo::exists(QString::fromStdString(clip.originalMediaPath))) {
                return QStringLiteral("The original media for %1 is missing from the cache. Reconnect and reload the timeline before exporting.").arg(label);
            }
        }
        const auto matte = clip.raw.value("generatedMatte").toObject();
        if (videoOutput && !matte.value("assetId").toString().isEmpty() && matte.value("mediaPath").toString().isEmpty() &&
            matte.value("status").toString("ready") == "ready") {
            if (clip.generatedMattePath.empty() || !QFileInfo::exists(QString::fromStdString(clip.generatedMattePath))) {
                return QStringLiteral("The original generated matte for %1 is unavailable. Reconnect and reload the timeline before exporting.").arg(label);
            }
        }
    }
    return {};
}

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
        self->m_staging.reset();
        self->m_mediaLeases.clear();
        nt::activity::LocalActivityStore::instance().finish(self->m_activityId, success, self->m_cancelled && code == 3, self->m_error);
        self->m_activityId.clear();
        emit self->finished(success);
    });
    connect(&m_process, &QProcess::errorOccurred, this, [self = QPointer<ExportController>(this)](QProcess::ProcessError error) {
        if (self && error == QProcess::FailedToStart) {
            self->m_job.reset();
            self->m_staging.reset();
            self->m_mediaLeases.clear();
            self->fail(self->m_process.errorString());
        }
    });
}
ExportController::~ExportController() {
    if (running()) {
        cancel();
        // Keep the parent-owned staging directory until the child stops,
        // including a decoder or encoder that cannot cooperate with cancel.
        if (!m_process.waitForFinished(5000)) {
            m_process.kill();
            m_process.waitForFinished(1000);
        }
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
    if (!running()) {
        m_mediaLeases.clear();
        nt::activity::LocalActivityStore::instance().finish(m_activityId, false, false, m_error);
        m_activityId.clear();
    }
    emit finished(false);
}
void ExportController::start(const QString& output, const QString& format, bool alpha) {
    if (running()) return;
    if (!m_timeline) { fail(QStringLiteral("Open a timeline before exporting.")); return; }
    const bool videoOutput = format != u"wav" && format != u"mp3";
    const auto unavailable = nt::exporting::unavailableOriginalMedia(m_timeline->timeline(), videoOutput);
    if (!unavailable.isEmpty()) { fail(unavailable); return; }
    m_mediaLeases = nt::assets::MediaProtection::leasePaths(m_timeline->resolvedMediaPaths());
    m_activityId = nt::activity::LocalActivityStore::instance().begin(
        nt::activity::localScope(m_timeline->timeline().raw), QStringLiteral("Export %1").arg(m_timeline->name()), this, output);
    m_job = std::make_unique<QTemporaryDir>();
    if (!m_job->isValid()) { fail(QStringLiteral("Cannot create export snapshot")); return; }
    const auto raw = nt::exporting::exportSnapshot(*m_timeline);
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
    m_staging = std::make_unique<QTemporaryDir>(QFileInfo(path).dir().filePath(".nt-export-XXXXXX"));
    if (!m_staging->isValid()) {
        m_job.reset(); m_staging.reset(); fail(QStringLiteral("Cannot create temporary export output")); return;
    }
    QStringList args{snapshot.fileName(), "--export", path, "--format", format, "--cancel-file", m_job->filePath("cancel"), "--staging-directory", m_staging->path(), "--json"};
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
            nt::activity::LocalActivityStore::instance().progress(m_activityId, m_phase,
                progress.value("ratio").isDouble() ? progress.value("ratio").toDouble() : -1.0);
            emit progressChanged();
        } else {
            m_diagnostics += line + '\n';
            if (m_diagnostics.size() > 8192) m_diagnostics = m_diagnostics.right(8192);
        }
    }
}
