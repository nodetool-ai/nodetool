#include "export/FrameCapture.h"
#include "assets/AssetMedia.h"
#include "export/ExportController.h"
#include <QCoreApplication>
#include <QDir>
#include <QEvent>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QProcessEnvironment>
#include <QSaveFile>
#include <cmath>
#include <limits>

struct FrameCapture::Snapshot {
    QString path;
    QString error;
    std::vector<nt::assets::MediaProtection::Lease> leases;
    bool ready = false;
};

FrameCapture::FrameCapture(QObject* parent) : QObject(parent) {
    m_pool.setMaxThreadCount(1);
    m_idle.setSingleShot(true);
    m_idle.setInterval(60000);
    connect(&m_idle, &QTimer::timeout, this, [this] {
        if (m_process.state() != QProcess::NotRunning) {
            m_closing = true;
            m_process.closeWriteChannel();
            // Requests made while it closes wait for it to end, so it must.
            QTimer::singleShot(5000, &m_process, [this] { if (m_closing) m_process.kill(); });
        }
    });
    connect(&m_process, &QProcess::started, this, &FrameCapture::sendRequests);
    connect(&m_process, &QProcess::readyReadStandardOutput, this, &FrameCapture::readResponses);
    connect(&m_process, &QProcess::readyReadStandardError, this, [this] {
        m_stderr += m_process.readAllStandardError();
        m_stderr = m_stderr.right(8192);
    });
    connect(&m_process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) childFailed(QStringLiteral("Cannot start frame capture: %1").arg(m_process.errorString()));
    });
    connect(&m_process, &QProcess::finished, this, [this](int, QProcess::ExitStatus) {
        if (m_destroying) return;
        readResponses();
        if (m_closing) {
            m_closing = false;
            sendRequests();
        } else {
            childFailed(QStringLiteral("Frame capture process stopped. %1").arg(QString::fromUtf8(m_stderr).trimmed()));
        }
    });
}
FrameCapture::~FrameCapture() {
    m_destroying = true;
    m_idle.stop();
    m_process.disconnect(this);
    if (m_process.state() != QProcess::NotRunning) {
        m_process.closeWriteChannel();
        if (!m_process.waitForFinished(1000)) {
            m_process.kill();
            m_process.waitForFinished(1000);
        }
    }
    m_requests.clear();
    m_snapshot.reset();
    m_pool.waitForDone();
    // Queued snapshot payloads must release their pool-backed deleters while the pool exists.
    QCoreApplication::removePostedEvents(this, QEvent::MetaCall);
    m_pool.waitForDone();
}
void FrameCapture::setTimeline(TimelineModel* model) {
    if (m_timeline == model) return;
    if (m_timeline) disconnect(m_timeline, nullptr, this, nullptr);
    const auto ids = m_requests.keys();
    for (int id : ids) {
        if (m_requests[id].sequence) cancel(id);
    }
    m_timeline = model;
    invalidateSnapshot();
    if (model) {
        connect(model, &TimelineModel::timelineChanged, this, &FrameCapture::invalidateSnapshot);
        connect(model, &TimelineModel::previewChanged, this, &FrameCapture::invalidateSnapshot);
        connect(model, &TimelineModel::markersChanged, this, &FrameCapture::invalidateSnapshot);
        connect(model, &QObject::destroyed, this, [this] {
            invalidateSnapshot();
            const auto ids = m_requests.keys();
            for (int id : ids) {
                if (m_requests[id].sequence) cancel(id);
            }
            emit timelineChanged();
        });
    }
    emit timelineChanged();
}
void FrameCapture::invalidateSnapshot() { m_snapshot.reset(); }
int FrameCapture::captureSequence(double timeMs) { return captureSequence(timeMs, {}); }
int FrameCapture::captureSource(const QString& path, double timeMs) { return captureSource(path, timeMs, {}); }
int FrameCapture::captureSequence(double timeMs, Callback callback) { return request(true, {}, timeMs, std::move(callback)); }
int FrameCapture::captureSource(const QString& path, double timeMs, Callback callback) { return request(false, path, timeMs, std::move(callback)); }
int FrameCapture::request(bool sequence, const QString& path, double timeMs, Callback callback) {
    do {
        m_nextId = m_nextId == std::numeric_limits<int>::max() ? 1 : m_nextId + 1;
    } while (m_requests.contains(m_nextId));
    const int id = m_nextId;
    Request entry;
    entry.timeMs = timeMs;
    entry.path = path;
    entry.callback = std::move(callback);
    entry.sequence = sequence;
    m_requests.insert(id, std::move(entry));
    m_idle.stop();
    QString error;
    if (!std::isfinite(timeMs) || timeMs < 0) error = QStringLiteral("Frame time must be finite and nonnegative.");
    else if (sequence && !m_timeline) error = QStringLiteral("Open a timeline before capturing a frame.");
    else if (!sequence && path.isEmpty()) error = QStringLiteral("Choose a source file before capturing a frame.");
    else if (!m_directory.isValid()) error = QStringLiteral("Cannot create the frame capture directory.");
    if (!error.isEmpty()) {
        complete({id, {}, timeMs, error});
    } else {
        if (sequence) {
            if (!m_snapshot) prepareSnapshot();
            m_requests[id].snapshot = m_snapshot;
        }
        QMetaObject::invokeMethod(this, [this] { sendRequests(); }, Qt::QueuedConnection);
    }
    emit pendingChanged();
    return id;
}
void FrameCapture::prepareSnapshot() {
    auto snapshot = std::shared_ptr<Snapshot>(new Snapshot, [this](Snapshot* value) {
        m_pool.start([value] { QFile::remove(value->path); delete value; });
    });
    snapshot->path = m_directory.filePath(QStringLiteral("sequence-%1.json").arg(++m_snapshotSerial));
    snapshot->leases = nt::assets::MediaProtection::leasePaths(m_timeline->resolvedMediaPaths());
    m_snapshot = snapshot;
    const auto raw = nt::exporting::exportSnapshot(*m_timeline);
    const auto timeline = m_timeline->timeline();
    m_pool.start([this, snapshot, raw, timeline] {
        QString error = nt::exporting::unavailableOriginalMedia(timeline);
        if (error.isEmpty()) {
            const auto bytes = QJsonDocument(raw).toJson(QJsonDocument::Compact);
            QSaveFile file(snapshot->path);
            if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
                error = QStringLiteral("Cannot write the frame capture snapshot.");
            }
        }
        QMetaObject::invokeMethod(this, [this, snapshot, error] {
            snapshot->error = error;
            snapshot->ready = true;
            // The file may be there next time, with no change to the document.
            if (!error.isEmpty() && m_snapshot == snapshot) m_snapshot.reset();
            sendRequests();
        }, Qt::QueuedConnection);
    });
}
void FrameCapture::send(const QJsonObject& object) {
    m_process.write(QJsonDocument(object).toJson(QJsonDocument::Compact) + '\n');
}
void FrameCapture::sendRequests() {
    if (m_destroying || m_closing) return;
    bool waiting = false;
    const auto ids = m_requests.keys();
    for (int id : ids) {
        auto& entry = m_requests[id];
        if (entry.ending || entry.sent) continue;
        if (entry.snapshot) {
            if (!entry.snapshot->ready) continue;
            if (!entry.snapshot->error.isEmpty()) {
                complete({id, {}, entry.timeMs, entry.snapshot->error});
                continue;
            }
        }
        waiting = true;
        if (m_process.state() != QProcess::Running) continue;
        QJsonObject json{{"id", id}, {"kind", entry.sequence ? "sequence" : "source"},
            {"timeMs", entry.timeMs}, {"dir", m_directory.path()}};
        json.insert(entry.sequence ? "snapshot" : "path", entry.sequence ? entry.snapshot->path : entry.path);
        entry.sent = true;
        send(json);
    }
    if (waiting && m_process.state() == QProcess::NotRunning) {
        m_stdout.clear();
        m_stderr.clear();
        auto env = QProcessEnvironment::systemEnvironment();
        env.remove("QT_QUICK_BACKEND");
        m_process.setProcessEnvironment(env);
        m_process.start(m_executable.isEmpty() ? QCoreApplication::applicationFilePath() : m_executable, {"--frame-server"});
    }
    if (m_requests.empty() && m_process.state() == QProcess::Running) m_idle.start();
}
void FrameCapture::complete(FrameCaptureResult result) {
    const auto it = m_requests.find(result.requestId);
    if (it == m_requests.end() || it->ending || m_destroying) return;
    it->ending = true;
    const int id = result.requestId;
    it->result = std::move(result);
    QMetaObject::invokeMethod(this, [this, id] {
        auto it = m_requests.find(id);
        if (it == m_requests.end()) return;
        const auto result = std::move(it->result);
        auto callback = std::move(it->callback);
        m_requests.erase(it);
        if (m_requests.empty() && m_process.state() == QProcess::Running) m_idle.start();
        QPointer<FrameCapture> self(this);
        emit pendingChanged();
        if (!self) return;
        if (result.cancelled) emit frameCancelled(result.requestId);
        else if (result.ok()) emit frameReady(result.requestId, result.image, result.timeMs);
        else emit frameFailed(result.requestId, result.error);
        if (self && callback) callback(result);
    }, Qt::QueuedConnection);
}
void FrameCapture::cancel(int id) {
    const auto it = m_requests.find(id);
    if (it == m_requests.end()) return;
    if (it->sent && m_process.state() == QProcess::Running) send({{"cancel", id}});
    FrameCaptureResult result{id, {}, it->timeMs, {}, true};
    if (it->ending) it->result = std::move(result);
    else complete(std::move(result));
}
void FrameCapture::childFailed(const QString& error) {
    const auto ids = m_requests.keys();
    for (int id : ids) complete({id, {}, m_requests[id].timeMs, error});
}
void FrameCapture::readResponses() {
    m_stdout += m_process.readAllStandardOutput();
    for (;;) {
        const auto end = m_stdout.indexOf('\n');
        if (end < 0) break;
        const auto json = QJsonDocument::fromJson(m_stdout.left(end)).object();
        m_stdout.remove(0, end + 1);
        const int id = json.value("id").toInt();
        const auto it = m_requests.constFind(id);
        const auto path = json.value("file").toString();
        const bool discard = it == m_requests.cend() || it->ending;
        if (path.isEmpty()) {
            if (!discard) complete({id, {}, it->timeMs, json.value("error").toString(), json.value("cancelled").toBool()});
            continue;
        }
        const double time = discard ? 0 : it->timeMs;
        const auto directory = m_directory.path();
        m_pool.start([this, json, id, path, time, directory, discard] {
            FrameCaptureResult result{id, {}, time, {}};
            if (QFileInfo(path).absolutePath() != directory) {
                result.error = QStringLiteral("Invalid captured frame path.");
            } else {
                if (!discard) {
                    QFile file(path);
                    const int width = json.value("width").toInt();
                    const int height = json.value("height").toInt();
                    const qint64 stride = json.value("stride").toInteger();
                    if (width <= 0 || height <= 0 || stride < qint64(width) * 4 ||
                        stride > std::numeric_limits<int>::max() || stride * height > std::numeric_limits<int>::max() ||
                        !file.open(QIODevice::ReadOnly) || file.size() != stride * height) {
                        result.error = QStringLiteral("Cannot read the captured frame.");
                    } else {
                        const auto bytes = file.readAll();
                        if (bytes.size() == stride * height) {
                            result.image = QImage(reinterpret_cast<const uchar*>(bytes.constData()), width, height,
                                stride, QImage::Format_RGBA8888).copy();
                        }
                        if (result.image.isNull()) result.error = QStringLiteral("Cannot load the captured frame.");
                    }
                }
                QFile::remove(path);
            }
            if (!discard) QMetaObject::invokeMethod(this, [this, result = std::move(result)] { complete(result); }, Qt::QueuedConnection);
        });
    }
}
