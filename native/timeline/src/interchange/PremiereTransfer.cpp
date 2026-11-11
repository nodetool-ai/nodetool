#include "interchange/PremiereTransfer.h"

#include "interchange/PremiereArchive.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"

#include <QCoreApplication>
#include <QDesktopServices>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QProcess>
#include <QSaveFile>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QUrl>

namespace {
using nt::server::ServerClient;

// The server's `{"detail": "..."}` error body, or a plain status line.
QString serverMessage(int status, const QByteArray& body) {
    const auto document = QJsonDocument::fromJson(body);
    const QString detail = document.isObject() ? document.object().value("detail").toString() : QString();
    if (!detail.isEmpty()) return detail;
    if (status == 401 || status == 403) return QStringLiteral("The server did not accept this account (HTTP %1).").arg(status);
    return QStringLiteral("The server answered HTTP %1.").arg(status);
}

// An upload error reads "upload: HTTP 400: {body}". Keep the server's own words.
QString uploadMessage(const nt::server::QueryResult& result) {
    const QString text = result.error.message;
    const qsizetype brace = text.indexOf(u'{');
    if (brace > 0) {
        const auto document = QJsonDocument::fromJson(text.mid(brace).toUtf8());
        const QString detail = document.isObject() ? document.object().value("detail").toString() : QString();
        if (!detail.isEmpty()) return detail;
    }
    return result.describe();
}

QString networkMessage(const nt::server::HttpResponse& response) {
    if (response.networkErrorCode == u"TIMEOUT") return QStringLiteral("The server stopped answering.");
    return response.networkError.isEmpty() ? QStringLiteral("The server could not be reached.") : response.networkError;
}
// Web's export reads only the keyframe animation, so it cannot report `paramCurves`.
QString paramCurveNote(const nt::Timeline& timeline) {
    QStringList names;
    int clips = 0;
    for (const auto& clip : timeline.clips) {
        const auto curves = clip.raw.value(u"paramCurves").toArray();
        clips += curves.isEmpty() ? 0 : 1;
        for (const auto& curve : curves) {
            const auto property = curve.toObject().value(u"property").toString();
            const QString name = property == u"volumeDb"       ? QStringLiteral("Volume")
                                 : property == u"depthPx"      ? QStringLiteral("Depth")
                                 : property == u"perspective"  ? QStringLiteral("Perspective")
                                 : property.startsWith(u"crop") ? QStringLiteral("Crop")
                                 : property == u"borderRadius" ? QStringLiteral("Corners")
                                 : property.startsWith(u"effect:") ? QStringLiteral("effect parameters")
                                                               : property;
            if (!names.contains(name)) names.append(name);
        }
    }
    if (clips == 0) return {};
    names.sort();
    return QStringLiteral("Premiere XML has no keyframes for %1 on %2 %3, so the XML carries the static values.")
        .arg(names.join(QStringLiteral(", ")), QString::number(clips), clips == 1 ? QStringLiteral("clip") : QStringLiteral("clips"));
}
}  // namespace

PremiereTransfer::PremiereTransfer(QObject* parent) : QObject(parent) {}

PremiereTransfer::~PremiereTransfer() {
    ++m_epoch;
    if (m_worker) {
        m_worker->requestInterruption();
        m_worker->wait();
    }
}

void PremiereTransfer::setTimeline(TimelineModel* value) {
    if (m_timeline == value) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    m_timeline = value;
    const auto refresh = [this] {
        if (!m_explicitTarget) m_target = nt::server::serverSaveTarget();
        emit changed();
    };
    if (value) connect(value, &TimelineModel::documentReplaced, this, refresh);
    refresh();
}

void PremiereTransfer::setTarget(std::optional<nt::server::SaveTarget> target) {
    m_explicitTarget = true;
    m_target = std::move(target);
    emit changed();
}

QString PremiereTransfer::unavailableReason() const {
    if (m_target) return {};
    return QStringLiteral(
        "Premiere Pro export and import work on a timeline from a NodeTool server, because the server stores the media. "
        "This timeline was opened from a file. Open it from a server to use them.");
}

QString PremiereTransfer::projectId() const {
    return m_timeline ? m_timeline->timeline().raw.value("projectId").toString() : QString();
}

QString PremiereTransfer::localPath(const QString& location) {
    const QUrl url(location);
    return url.isLocalFile() ? url.toLocalFile() : location;
}

QString PremiereTransfer::suggestedExportPath() const {
    QString name = m_timeline ? m_timeline->name().trimmed() : QString();
    name.replace(QRegularExpression(QStringLiteral("[^\\w.-]+")), QStringLiteral("_"));
    name.remove(QRegularExpression(QStringLiteral("^_+|_+$")));
    if (name.isEmpty()) name = QStringLiteral("timeline");
    return QDir(QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)).filePath(name + QStringLiteral("-premiere.zip"));
}

void PremiereTransfer::begin(const QString& mode, const QString& phase) {
    m_mode = mode;
    m_phase = phase;
    m_ratio = -1;
    m_transferred = 0;
    m_error.clear();
    m_done = false;
    m_outputPath.clear();
    m_notes.clear();
    m_omitted = 0;
    m_clipsExported = 0;
    m_importedId.clear();
    m_importedName.clear();
    m_importedMedia = m_importedClips = m_missingClips = 0;
}

void PremiereTransfer::apply(const Progress& progress) {
    m_phase = progress.phase;
    m_ratio = progress.ratio;
    m_transferred = progress.bytes;
    emit changed();
}

void PremiereTransfer::conclude(const Outcome& outcome) {
    m_done = outcome.ok;
    m_error = outcome.cancelled ? QString() : outcome.error;
    m_outputPath = outcome.outputPath;
    m_clipsExported = outcome.clipsExported;
    m_notes = outcome.notes;
    m_omitted = outcome.omitted;
    m_importedId = outcome.importedId;
    m_importedName = outcome.importedName;
    m_importedMedia = outcome.importedMedia;
    m_importedClips = outcome.importedClips;
    m_missingClips = outcome.missingClips;
    m_ratio = outcome.ok ? 1 : -1;
    m_phase.clear();
    if (outcome.cancelled) m_mode.clear();
    m_running = false;
    emit changed();
    emit finished(outcome.ok);
}

void PremiereTransfer::run(std::function<Outcome(const std::function<void(Progress)>&)> work) {
    const quint64 epoch = ++m_epoch;
    m_running = true;
    emit changed();
    // native-rules #12: lambda captures raw this and runs on a worker thread
    auto* worker = QThread::create([this, epoch, work = std::move(work)] {
        QElapsedTimer sinceReport;
        sinceReport.start();
        qint64 reported = -1000;
        // Progress is rate-limited so a fast transfer does not flood the event loop.
        const auto report = [&](Progress progress) {
            if (sinceReport.elapsed() - reported < 100 && progress.ratio < 1) return;
            reported = sinceReport.elapsed();
            QMetaObject::invokeMethod(this, [this, epoch, progress] {
                if (epoch == m_epoch) apply(progress);
            }, Qt::QueuedConnection);
        };
        Outcome outcome = work(report);
        QMetaObject::invokeMethod(this, [this, epoch, outcome] {
            if (epoch == m_epoch) conclude(outcome);
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    m_worker = worker;
    worker->start();
}

void PremiereTransfer::exportTo(const QString& location) {
    if (m_running) return;
    begin(QStringLiteral("export"), QStringLiteral("transferring"));
    QString path = localPath(location);
    if (!m_target) {
        m_error = unavailableReason();
    } else if (path.trimmed().isEmpty()) {
        m_error = QStringLiteral("Choose where to save the export.");
    }
    if (!m_error.isEmpty()) {
        m_phase.clear();
        emit changed();
        emit finished(false);
        return;
    }
    if (QFileInfo(path).suffix().isEmpty()) path += QStringLiteral(".zip");
    const auto target = *m_target;
    const QString keysNote = m_timeline ? paramCurveNote(m_timeline->timeline()) : QString();
    run([target, path, keysNote](const std::function<void(Progress)>& progress) {
        Outcome outcome;
        QSaveFile file(path);
        if (!file.open(QIODevice::WriteOnly)) {
            outcome.error = QStringLiteral("Cannot save to %1: %2").arg(path, file.errorString());
            return outcome;
        }
        ServerClient client(target.server, target.token, 600000);
        // Probing the media happens before the first byte, so the first answer can take a while.
        const auto response = client.download(QStringLiteral("/api/timelines/%1/export-premiere").arg(target.timelineId), file,
            [&progress](qint64 received, qint64 total) {
                progress({QStringLiteral("transferring"), total > 0 ? double(received) / double(total) : -1.0, received});
            });
        if (response.networkErrorCode == u"CANCELLED") {
            file.cancelWriting();
            outcome.cancelled = true;
            outcome.error = QStringLiteral("Cancelled.");
            return outcome;
        }
        if (!response.networkError.isEmpty() || response.status == 0) {
            file.cancelWriting();
            outcome.error = networkMessage(response);
            return outcome;
        }
        if (response.status != 200) {
            file.cancelWriting();
            outcome.error = serverMessage(response.status, response.body);
            return outcome;
        }
        progress({QStringLiteral("finishing"), 1.0, file.size()});
        if (!file.commit()) {
            outcome.error = QStringLiteral("Cannot save to %1: %2").arg(path, file.errorString());
            return outcome;
        }
        outcome.ok = true;
        outcome.outputPath = QFileInfo(path).absoluteFilePath();
        const auto report = QJsonDocument::fromJson(QUrl::fromPercentEncoding(response.header("x-nodetool-export-report")).toUtf8());
        const auto object = report.object();
        outcome.clipsExported = object.value("clipsExported").toInt();
        outcome.omitted = object.value("omitted").toInt();
        for (const auto& message : object.value("warnings").toArray()) outcome.notes.append(message.toString());
        if (!keysNote.isEmpty()) outcome.notes.append(keysNote);
        return outcome;
    });
}

void PremiereTransfer::importFrom(const QString& location) {
    if (m_running) return;
    const QString path = localPath(location);
    const QString suffix = QFileInfo(path).suffix().toLower();
    begin(QStringLiteral("import"), suffix == u"xml" ? QStringLiteral("packing") : QStringLiteral("transferring"));
    if (!m_target) {
        m_error = unavailableReason();
    } else if (!QFileInfo(path).isFile()) {
        m_error = QStringLiteral("Choose the sequence XML that Premiere Pro exports, or a zip that holds it and its media.");
    } else if (suffix != u"xml" && suffix != u"zip") {
        m_error = QStringLiteral("%1 is not a sequence XML or a zip.").arg(QFileInfo(path).fileName());
    }
    if (!m_error.isEmpty()) {
        m_phase.clear();
        emit changed();
        emit finished(false);
        return;
    }
    const auto target = *m_target;
    const QString project = projectId();
    run([target, path, project, suffix](const std::function<void(Progress)>& progress) {
        Outcome outcome;
        QTemporaryDir staging;
        QString archive = path;
        if (suffix == u"xml") {
            if (!staging.isValid()) {
                outcome.error = QStringLiteral("Cannot make a temporary folder to pack the media in.");
                return outcome;
            }
            archive = staging.filePath(QStringLiteral("premiere-import.zip"));
            const auto packed = nt::interchange::writeImportArchive(path, archive, [&progress](int done, int total) {
                progress({QStringLiteral("packing"), total > 0 ? double(done) / double(total) : -1.0, 0});
                return !QThread::currentThread()->isInterruptionRequested();
            });
            if (!packed.ok) {
                outcome.cancelled = QThread::currentThread()->isInterruptionRequested();
                outcome.error = packed.error;
                return outcome;
            }
            if (!packed.missing.isEmpty()) {
                const auto count = packed.missing.size();
                outcome.notes.append((count == 1 ? QStringLiteral("1 media file named in the XML was not found on this disk, so its clips are left out: %1")
                                                  : QStringLiteral("%1 media files named in the XML were not found on this disk, so their clips are left out: %2").arg(count))
                                         .arg(packed.missing.join(QStringLiteral(", "))));
            }
        }
        progress({QStringLiteral("transferring"), -1.0, QFileInfo(archive).size()});
        ServerClient client(target.server, target.token, 600000);
        client.setExpectedInstance(target.expectedInstance);
        // A large archive can take longer than any fixed limit. The transfer timeout still ends a stalled one.
        client.setDeadlineMs(0);
        QJsonObject fields;
        if (!project.isEmpty()) fields.insert(QStringLiteral("project_id"), project);
        const auto result = client.upload(fields, archive, QStringLiteral("application/zip"), QStringLiteral("/api/timelines/import-zip"));
        if (!result.ok()) {
            outcome.cancelled = result.error.code == u"CANCELLED";
            outcome.error = outcome.cancelled ? QStringLiteral("Cancelled.") : uploadMessage(result);
            return outcome;
        }
        const auto data = result.data.toObject();
        const auto timeline = data.value("timeline").toObject();
        outcome.importedId = timeline.value("id").toString();
        outcome.importedName = timeline.value("name").toString();
        if (outcome.importedId.isEmpty()) {
            outcome.error = QStringLiteral("The server did not name the new timeline.");
            return outcome;
        }
        outcome.importedMedia = data.value("imported").toInt();
        outcome.importedClips = static_cast<int>(timeline.value("clips").toArray().size());
        outcome.missingClips = data.value("missing_clips").toInt();
        for (const auto& warning : data.value("warnings").toArray()) outcome.notes.append(warning.toString());
        outcome.ok = true;
        return outcome;
    });
}

void PremiereTransfer::cancel() {
    if (m_running && m_worker) m_worker->requestInterruption();
}

void PremiereTransfer::dismiss() {
    if (m_running) return;
    begin(QString(), QString());
    emit changed();
}

bool PremiereTransfer::openImported() {
    if (m_importedId.isEmpty() || !m_target) return false;
    const QString server = m_target->server.toString(QUrl::RemoveUserInfo | QUrl::RemoveQuery | QUrl::RemoveFragment);
    return QProcess::startDetached(QCoreApplication::applicationFilePath(), {QStringLiteral("--server"), server, QStringLiteral("--timeline"), m_importedId});
}

bool PremiereTransfer::reveal(const QString& path) const {
    const QFileInfo info(path);
    return info.exists() && QDesktopServices::openUrl(QUrl::fromLocalFile(info.absolutePath()));
}
