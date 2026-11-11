// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "FrameExporter.h"
#include "assets/AssetClip.h"
#include "assets/AssetImport.h"
#include "assets/AssetMedia.h"
#include "edit/ClipOps.h"
#include "server/ServerSource.h"
#include <QDir>
#include <QFileInfo>
#include <QImageWriter>
#include <QRegularExpression>
#include <QSaveFile>
#include <algorithm>
#include <memory>
#include <utility>

namespace {
QString& sessionFolder() { static QString folder = QDir::homePath(); return folder; }
QString cleanName(QString name) {
    return name.trimmed().replace(QRegularExpression(QStringLiteral(R"([/\\:*?"<>|])")), "_");
}
QString writeImage(const QImage& image, const QString& path, const QString& format) {
    if (QThread::currentThread()->isInterruptionRequested()) { return "Frame export was cancelled."; }
    QSaveFile file(path);
    file.setDirectWriteFallback(false);
    if (!file.open(QIODevice::WriteOnly)) { return "The frame could not be saved. Choose a writable folder."; }
    QImageWriter writer(&file, format == "png" ? "png" : "jpeg");
    writer.setQuality(format == "png" ? -1 : 95);
    if (!writer.write(image.convertToFormat(QImage::Format_RGB888))) { return "The frame could not be encoded."; }
    if (QThread::currentThread()->isInterruptionRequested()) { file.cancelWriting(); return "Frame export was cancelled."; }
    if (!file.commit()) { return "The frame could not be saved. Choose a writable folder."; }
    return {};
}
bool validFormat(const QString& format) { return format == "png" || format == "jpeg"; }
}
FrameExporter::FrameExporter(QObject* parent) : QObject(parent) {}
FrameExporter::~FrameExporter() { cancel(); }
void FrameExporter::cancel() {
    ++m_serial;
    if (m_request) { m_capture.cancel(m_request); m_request = 0; }
    // The worker captures no pointer to this object. It may be waiting on another download's
    // cache lock, which does not see an interruption, so the GUI thread leaves it to finish alone.
    if (auto* thread = std::exchange(m_worker, nullptr)) {
        disconnect(thread, nullptr, this, nullptr);
        connect(thread, &QThread::finished, thread, &QObject::deleteLater);
        thread->requestInterruption();
        if (thread->isFinished()) { thread->deleteLater(); }
    }
}
void FrameExporter::worker(std::function<void()> work, std::function<void()> finish) {
    const auto serial = m_serial;
    auto* thread = QThread::create(std::move(work));
    m_worker = thread;
    connect(thread, &QThread::finished, this, [this, thread, serial, finish = std::move(finish)] {
        if (serial != m_serial || m_worker != thread) { return; }
        thread->wait();
        m_worker = nullptr;
        thread->deleteLater();
        finish();
    });
    thread->start();
}
void FrameExporter::setTimeline(TimelineModel* model) {
    if (model == timeline()) { return; }
    reset();
    m_capture.setTimeline(model);
    emit timelineChanged();
}
bool FrameExporter::libraryAvailable() const { return nt::server::serverSaveTarget().has_value(); }
QString FrameExporter::lastFolder() const { return sessionFolder(); }
void FrameExporter::beginCapture(double timeMs) {
    cancel();
    m_image = {}; m_error.clear(); m_savedPath.clear(); m_savedAsset.clear();
    m_timeMs = timeMs; m_state = "capturing";
}
void FrameExporter::captured(const FrameCaptureResult& result, quint64 serial) {
    if (serial != m_serial) { return; }
    m_request = 0;
    m_image = result.image;
    m_error = result.cancelled ? QStringLiteral("The timeline closed before the frame was ready.") : result.error;
    m_state = result.ok() ? "ready" : "failed";
    emit changed();
}
void FrameExporter::captureProgram(double timeMs) {
    beginCapture(timeMs);
    const auto serial = m_serial;
    m_request = m_capture.captureSequence(timeMs, [self = QPointer<FrameExporter>(this), serial](const auto& result) {
        if (self) { self->captured(result, serial); }
    });
    emit changed();
}
void FrameExporter::captureSource(const QVariantMap& asset, const QString& previewPath, double sourceMs) {
    beginCapture(sourceMs);
    const auto raw = QJsonObject::fromVariantMap(asset);
    const auto type = raw.value("mediaType").toString(nt::assets::assetMediaType(raw));
    if (type == "audio") {
        m_state = "failed"; m_error = "This asset has no picture to export."; emit changed(); return;
    }
    const auto target = nt::server::serverSaveTarget();
    if (target && !raw.value("id").toString().isEmpty()) {
        const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
        const auto serial = m_serial;
        auto protection = std::make_shared<nt::assets::MediaProtection>();
        auto resolved = std::make_shared<nt::server::FetchResult>();
        worker([target = *target, cacheRoot, id = raw.value("id").toString(), protection, resolved] {
            nt::server::ServerClient client(target.server, target.token);
            client.setExpectedInstance(target.expectedInstance);
            *resolved = nt::assets::resolveOriginalMedia(client, cacheRoot, id, *protection);
        }, [this, serial, sourceMs, type, protection, resolved] {
            if (!resolved->ok()) {
                m_state = "failed"; m_error = "The original media could not be downloaded. Reconnect and try again.";
                emit changed(); return;
            }
            m_request = m_capture.captureSource(resolved->path, type == "image" ? 0 : sourceMs,
                [self = QPointer<FrameExporter>(this), serial, protection](const auto& result) {
                    if (self) { self->captured(result, serial); }
                });
        });
        emit changed(); return;
    }
    const auto serial = m_serial;
    m_request = m_capture.captureSource(previewPath, type == "image" ? 0 : sourceMs,
        [self = QPointer<FrameExporter>(this), serial](const auto& result) {
            if (self) { self->captured(result, serial); }
        });
    emit changed();
}
void FrameExporter::saveToFile(const QUrl& file, const QString& format) {
    if (m_image.isNull() || m_state == "saving" || m_state == "capturing") { return; }
    m_error.clear();
    if (!file.isLocalFile() || !validFormat(format)) {
        m_state = "ready"; m_error = "Choose a local file and a PNG or JPEG format."; emit changed(); return;
    }
    m_state = "saving";
    const auto image = m_image;
    const auto path = file.toLocalFile();
    auto error = std::make_shared<QString>();
    worker([image, path, format, error] { *error = writeImage(image, path, format); }, [this, path, error] {
        m_error = *error;
        m_state = error->isEmpty() ? "saved" : "ready";
        if (error->isEmpty()) { m_savedPath = path; m_savedAsset.clear(); sessionFolder() = QFileInfo(path).absolutePath(); }
        const QPointer<FrameExporter> self(this);
        emit changed();
        if (self && error->isEmpty()) { emit saved(); }
    });
    emit changed();
}
void FrameExporter::saveToLibrary(const QString& name, const QString& format, const QString& folderId) {
    if (m_image.isNull() || m_state == "saving" || m_state == "capturing") { return; }
    m_error.clear(); m_state = "ready";
    const auto cleaned = cleanName(name);
    const auto target = nt::server::serverSaveTarget();
    if (cleaned.isEmpty()) { m_error = "Enter a name for the frame."; }
    else if (!validFormat(format)) { m_error = "Choose PNG or JPEG for the frame."; }
    else if (!target) { m_error = "Connect to a server to save the frame to the Library."; }
    if (!m_error.isEmpty()) { emit changed(); return; }
    m_state = "saving";
    const auto image = m_image;
    const auto project = timeline() ? timeline()->timeline().raw.value("projectId").toString() : QString{};
    struct Saved { QString error; QJsonObject asset; };
    auto result = std::make_shared<Saved>();
    worker([image, cleaned, format, target = *target, project, folderId, result] {
        QTemporaryDir directory;
        if (!directory.isValid()) { result->error = "A temporary folder for the frame could not be created."; return; }
        const auto path = QDir(directory.path()).filePath(cleaned + (format == "png" ? ".png" : ".jpg"));
        result->error = writeImage(image, path, format);
        if (!result->error.isEmpty() || QThread::currentThread()->isInterruptionRequested()) { return; }
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        const auto imported = nt::assets::importFile(client, path, {{"project_id", project}, {"parent_id", folderId}});
        result->asset = imported.asset;
        if (!imported.ok()) { result->error = "The frame could not be saved to the Library. " + imported.error; }
    }, [this, result] {
        m_error = result->error;
        m_state = m_error.isEmpty() ? "saved" : "ready";
        if (m_error.isEmpty()) { m_savedAsset = result->asset.toVariantMap(); m_savedPath.clear(); }
        const QPointer<FrameExporter> self(this);
        emit changed();
        if (self && result->error.isEmpty()) { emit saved(); }
    });
    emit changed();
}
bool FrameExporter::fileExists(const QUrl& file) const { return file.isLocalFile() && QFileInfo::exists(file.toLocalFile()); }
QUrl FrameExporter::fileUrl(const QString& folder, const QString& name, const QString& format) const {
    const auto cleaned = cleanName(name);
    if (cleaned.isEmpty() || !validFormat(format)) { return {}; }
    return QUrl::fromLocalFile(QDir(folder).filePath(cleaned + (format == "png" ? ".png" : ".jpg")));
}
QString FrameExporter::localPath(const QUrl& folder) const { return folder.toLocalFile(); }
QUrl FrameExporter::folderUrl(const QString& folder) const { return QUrl::fromLocalFile(folder); }
QVariantMap FrameExporter::startFramePlacement() const {
    if (m_savedAsset.isEmpty() || !timeline()) { return {}; }
    const auto raw = timeline()->timeline().raw;
    auto tracks = raw.value("tracks").toArray().toVariantList();
    std::stable_sort(tracks.begin(), tracks.end(), [](const QVariant& a, const QVariant& b) {
        return a.toMap().value("index").toDouble() < b.toMap().value("index").toDouble();
    });
    QString trackId;
    for (const auto& value : tracks) {
        const auto track = value.toMap();
        if (track.value("type") == "video" && !track.value("locked").toBool()) { trackId = track.value("id").toString(); break; }
    }
    return {{"asset", m_savedAsset}, {"inMs", 0}, {"outMs", 0}, {"videoTrackId", trackId}, {"audioTrackId", QString{}},
        {"newVideoTrack", trackId.isEmpty()}, {"newAudioTrack", false}, {"startMs", timeline()->contentEndMs()},
        {"mode", "overlap"}, {"snapMs", 0}, {"videoClipId", nt::edit::newId()}};
}
void FrameExporter::reset() {
    cancel(); m_state = "idle"; m_error.clear(); m_image = {}; m_timeMs = 0;
    m_savedPath.clear(); m_savedAsset.clear(); emit changed();
}
