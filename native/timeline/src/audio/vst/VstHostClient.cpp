#include "audio/vst/VstHostClient.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPointer>
#include <QProcess>
#include <QStandardPaths>
#include <QTimer>
#include <QUuid>

#include <algorithm>
#include <condition_variable>
#include <cstring>
#include <unordered_map>

namespace nt::audio::vst {
namespace {

QString hostBinaryName() {
#ifdef Q_OS_WIN
    return QStringLiteral("NodeToolVstHost.exe");
#else
    return QStringLiteral("NodeToolVstHost");
#endif
}

bool isExecutableFile(const QString& path) {
    if (path.isEmpty()) return false;
    const QFileInfo info(path);
    return info.exists() && info.isFile() && info.isExecutable();
}

QString tempPlanarPath(const char* prefix) {
    return QDir::temp().filePath(QStringLiteral("nodetool-vst-%1-%2.f32")
                                     .arg(QLatin1String(prefix), QUuid::createUuid().toString(QUuid::Id128)));
}

bool writePlanarFromInterleaved(const QString& path, std::span<const float> interleaved) {
    const std::size_t frames = interleaved.size() / 2;
    std::vector<float> planar(frames * 2);
    for (std::size_t i = 0; i < frames; ++i) {
        planar[i] = interleaved[i * 2];
        planar[frames + i] = interleaved[i * 2 + 1];
    }
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) return false;
    const qint64 bytes = static_cast<qint64>(planar.size()) * qint64{sizeof(float)};
    return file.write(reinterpret_cast<const char*>(planar.data()), bytes) == bytes && file.flush();
}

bool readInterleavedFromPlanar(const QString& path, std::int64_t frames, std::vector<float>* interleavedOut) {
    if (!interleavedOut || frames < 0) return false;
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) return false;
    const qint64 expected = frames * 2 * static_cast<qint64>(sizeof(float));
    const QByteArray raw = file.readAll();
    if (raw.size() != expected) return false;
    std::vector<float> planar(static_cast<std::size_t>(frames) * 2);
    if (expected > 0) {
        std::memcpy(planar.data(), raw.constData(), static_cast<std::size_t>(expected));
    }
    interleavedOut->resize(static_cast<std::size_t>(frames) * 2);
    const std::size_t n = static_cast<std::size_t>(frames);
    for (std::size_t i = 0; i < n; ++i) {
        (*interleavedOut)[i * 2] = planar[i];
        (*interleavedOut)[i * 2 + 1] = planar[n + i];
    }
    return true;
}

std::vector<VstPluginInfo> parsePlugins(const QJsonObject& reply) {
    std::vector<VstPluginInfo> out;
    const QJsonArray arr = reply.value(u"plugins").toArray();
    out.reserve(static_cast<std::size_t>(arr.size()));
    for (const auto& entry : arr) {
        if (!entry.isObject()) continue;
        const QJsonObject obj = entry.toObject();
        VstPluginInfo info;
        info.uid = obj.value(u"uid").toString();
        info.name = obj.value(u"name").toString();
        info.vendor = obj.value(u"vendor").toString();
        info.version = obj.value(u"version").toString();
        info.path = obj.value(u"path").toString();
        info.format = obj.value(u"format").toString(QStringLiteral("vst3"));
        info.isInstrument = obj.value(u"isInstrument").toBool(false);
        if (!info.uid.isEmpty() && !info.path.isEmpty()) {
            out.push_back(std::move(info));
        }
    }
    return out;
}

struct SyncWaiter {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool cancelled = false;
    bool dispatched = false;
    bool ok = false;
    QJsonObject reply;
    QString error;
};

}  // namespace

QString findVstHostExecutable(const QString& overridePath) {
    if (isExecutableFile(overridePath)) return QFileInfo(overridePath).canonicalFilePath();
    const QString env = qEnvironmentVariable("NODETOOL_VST_HOST").trimmed();
    if (isExecutableFile(env)) return QFileInfo(env).canonicalFilePath();

    const QString name = hostBinaryName();
    QStringList candidates;
    const QString appDir = QCoreApplication::instance() ? QCoreApplication::applicationDirPath() : QDir::currentPath();
    candidates << QDir(appDir).filePath(name);
    candidates << QDir(appDir).filePath(QStringLiteral("vst-host/") + name);
    candidates << QDir(appDir).filePath(QStringLiteral("../Resources/vst-host/") + name);

    // Development checkout discovery: walk up from appDir and cwd to find native/vst-host/build or electron/vst-host.
    QStringList roots{appDir, QDir::currentPath()};
    for (const QString& start : roots) {
        QDir dir(start);
        for (int depth = 0; depth < 6; ++depth) {
            candidates << dir.filePath(QStringLiteral("native/vst-host/build/NodeToolVstHost_artefacts/Release/") + name);
            candidates << dir.filePath(QStringLiteral("native/vst-host/build/NodeToolVstHost_artefacts/Debug/") + name);
            candidates << dir.filePath(QStringLiteral("native/vst-host/build/NodeToolVstHost_artefacts/") + name);
            candidates << dir.filePath(QStringLiteral("electron/vst-host/") + name);
            if (!dir.cdUp()) break;
        }
    }

    const QString appData = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (!appData.isEmpty()) {
        candidates << QDir(appData).filePath(QStringLiteral("vst-host/") + name);
    }

    for (const QString& candidate : candidates) {
        if (isExecutableFile(candidate)) return QFileInfo(candidate).canonicalFilePath();
    }
    return {};
}

QVariantMap pluginInfoToVariant(const VstPluginInfo& info) {
    return QVariantMap{
        {QStringLiteral("uid"), info.uid},
        {QStringLiteral("name"), info.name},
        {QStringLiteral("vendor"), info.vendor},
        {QStringLiteral("version"), info.version},
        {QStringLiteral("path"), info.path},
        {QStringLiteral("isInstrument"), info.isInstrument},
        {QStringLiteral("format"), info.format},
        {QStringLiteral("key"), info.path + QChar('\n') + info.uid},
    };
}

// Worker living exclusively on VstHostClient::m_thread. Owns the QProcess and
// matches JSON-line replies to pending callers.
class VstHostClient::HostWorker final : public QObject {
public:
    using Callback = std::function<void(bool ok, const QJsonObject& reply, const QString& error)>;

    explicit HostWorker(VstHostClient* owner) : m_owner(owner) {}

    void sendRequest(const QString& executable, QJsonObject request, int timeoutMs, Callback callback) {
        if (m_shuttingDown) {
            callback(false, {}, QStringLiteral("VST host is shutting down"));
            return;
        }
        if (!ensureStarted(executable)) {
            callback(false, {},
                     executable.isEmpty()
                         ? QStringLiteral("NodeToolVstHost is not installed.")
                         : QStringLiteral("Failed to start NodeToolVstHost at %1").arg(executable));
            return;
        }
        const int id = m_nextId++;
        request.insert(QStringLiteral("id"), id);
        auto timer = std::make_unique<QTimer>();
        timer->setSingleShot(true);
        timer->setInterval(timeoutMs);
        QObject::connect(timer.get(), &QTimer::timeout, this, [this, id]() { failOne(id, QStringLiteral("VST host request timed out")); });
        timer->start();
        m_pending.emplace(id, Pending{std::move(callback), std::move(timer)});

        const QByteArray line = QJsonDocument(request).toJson(QJsonDocument::Compact) + '\n';
        if (m_process->write(line) != line.size()) {
            failOne(id, QStringLiteral("Failed to write request to NodeToolVstHost"));
        }
    }

    void terminateOnWorkerThread() {
        if (m_process && m_process->state() != QProcess::NotRunning) {
            m_process->kill();
            m_process->waitForFinished(1500);
        }
        m_process.reset();
    }

    void shutdownOnWorkerThread() {
        m_shuttingDown = true;
        if (m_process) {
            m_process->disconnect(this);
            if (m_process->state() != QProcess::NotRunning) {
                m_process->write("{\"cmd\":\"quit\"}\n");
                m_process->closeWriteChannel();
                if (!m_process->waitForFinished(1500)) {
                    m_process->kill();
                    m_process->waitForFinished(1500);
                }
            }
        }
        m_process.reset();
        failAll(QStringLiteral("VST host shut down"));
    }

private:
    struct Pending {
        Callback callback;
        std::unique_ptr<QTimer> timer;
    };

    bool ensureStarted(const QString& executable) {
        if (executable.isEmpty()) return false;
        if (m_process && m_process->state() != QProcess::NotRunning && m_startedPath == executable) {
            return true;
        }
        if (m_process) {
            if (m_process->state() != QProcess::NotRunning) {
                m_process->write("{\"cmd\":\"quit\"}\n");
                m_process->closeWriteChannel();
                m_process->waitForFinished(1000);
            }
            m_process.reset();
            failAll(QStringLiteral("VST host restarted"));
        }
        auto proc = std::make_unique<QProcess>();
        proc->setProgram(executable);
        proc->setProcessChannelMode(QProcess::SeparateChannels);
        QObject::connect(proc.get(), &QProcess::readyReadStandardOutput, this, &HostWorker::onStdout, Qt::DirectConnection);
        QObject::connect(proc.get(), qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
                         [this](int, QProcess::ExitStatus) { onExited(); }, Qt::DirectConnection);
        QObject::connect(proc.get(), &QProcess::errorOccurred, this,
                         [this](QProcess::ProcessError) { onExited(); }, Qt::DirectConnection);
        proc->start(QIODevice::ReadWrite);
        if (!proc->waitForStarted(5000)) {
            return false;
        }
        m_buffer.clear();
        m_startedPath = executable;
        m_process = std::move(proc);
        return true;
    }

    void onStdout() {
        if (!m_process) return;
        m_buffer.append(m_process->readAllStandardOutput());
        while (true) {
            const qsizetype nl = m_buffer.indexOf('\n');
            if (nl < 0) break;
            const QByteArray line = m_buffer.left(nl).trimmed();
            m_buffer.remove(0, nl + 1);
            if (line.isEmpty()) continue;
            QJsonParseError err{};
            const QJsonDocument doc = QJsonDocument::fromJson(line, &err);
            if (err.error != QJsonParseError::NoError || !doc.isObject()) continue;
            handleLine(doc.object());
        }
    }

    void handleLine(const QJsonObject& msg) {
        if (msg.contains(u"event")) {
            const QString event = msg.value(u"event").toString();
            const QString instance = msg.value(u"instance").toString();
            const QString state = msg.value(u"state").toString();
            const QPointer<VstHostClient> owner = m_owner;
            if (!owner) return;
            if (event == u"state") {
                QMetaObject::invokeMethod(owner, [owner, instance, state]() {
                    if (owner) emit owner->pluginStateChanged(instance, state);
                }, Qt::QueuedConnection);
            } else if (event == u"editorClosed") {
                QMetaObject::invokeMethod(owner, [owner, instance, state]() {
                    if (owner) emit owner->pluginEditorClosed(instance, state);
                }, Qt::QueuedConnection);
            }
            return;
        }
        const int id = msg.value(u"id").toInt(-1);
        auto it = m_pending.find(id);
        if (it == m_pending.end()) return;
        Pending p = std::move(it->second);
        m_pending.erase(it);
        if (p.timer) p.timer->stop();
        const bool ok = msg.value(u"ok").toBool(false);
        const QString error = ok ? QString() : msg.value(u"error").toString(QStringLiteral("VST host error"));
        p.callback(ok, msg, error);
    }

    void onExited() {
        failAll(QStringLiteral("VST host process exited unexpectedly"));
        const QPointer<VstHostClient> owner = m_owner;
        if (owner) {
            owner->m_hostEpoch.fetch_add(1, std::memory_order_acq_rel);
        }
        if (owner && !m_shuttingDown) {
            QMetaObject::invokeMethod(owner, [owner]() {
                if (owner) emit owner->hostExited();
            }, Qt::QueuedConnection);
        }
    }

    void failOne(int id, const QString& reason) {
        auto it = m_pending.find(id);
        if (it == m_pending.end()) return;
        Pending p = std::move(it->second);
        m_pending.erase(it);
        if (p.timer) p.timer->stop();
        p.callback(false, {}, reason);
    }

    void failAll(const QString& reason) {
        auto pending = std::move(m_pending);
        m_pending.clear();
        for (auto& [_, p] : pending) {
            if (p.timer) p.timer->stop();
            p.callback(false, {}, reason);
        }
    }

    QPointer<VstHostClient> m_owner;
    std::unique_ptr<QProcess> m_process;
    QString m_startedPath;
    QByteArray m_buffer;
    int m_nextId = 1;
    std::unordered_map<int, Pending> m_pending;
    bool m_shuttingDown = false;
};

VstHostClient::VstHostClient(QObject* parent) : QObject(parent) {
    m_worker = std::make_unique<HostWorker>(this);
    m_worker->moveToThread(&m_thread);
    m_thread.setObjectName(QStringLiteral("VstHostClient"));
    m_thread.start();
}

VstHostClient::~VstHostClient() { shutdown(); }

void VstHostClient::shutdown() {
    if (m_shutDown) return;
    m_shutDown = true;
    if (m_worker && m_thread.isRunning()) {
        HostWorker* worker = m_worker.get();
        QMetaObject::invokeMethod(
            worker,
            [this]() {
                if (m_worker) {
                    m_worker->shutdownOnWorkerThread();
                    m_worker.reset();
                }
            },
            Qt::BlockingQueuedConnection);
    } else {
        m_worker.reset();
    }
    if (m_thread.isRunning()) {
        m_thread.quit();
        m_thread.wait();
    }
}

void VstHostClient::setOverrideExecutable(const QString& path) {
    std::lock_guard<std::mutex> lock(m_configMutex);
    m_overrideExecutable = path;
    m_hasScanned = false;
    m_cachedPlugins.clear();
}

void VstHostClient::setExtraScanDirs(const QStringList& dirs) {
    std::lock_guard<std::mutex> lock(m_configMutex);
    m_extraScanDirs = dirs;
    m_hasScanned = false;
    m_cachedPlugins.clear();
}

QString VstHostClient::executablePath() const {
    QString overridePath;
    {
        std::lock_guard<std::mutex> lock(m_configMutex);
        overridePath = m_overrideExecutable;
    }
    return findVstHostExecutable(overridePath);
}

bool VstHostClient::available() const { return !executablePath().isEmpty(); }

QString VstHostClient::unavailableReason() const {
    if (available()) return {};
    return QStringLiteral(
        "The VST host (NodeToolVstHost) is not installed. Build native/vst-host or set NODETOOL_VST_HOST.");
}

bool VstHostClient::sendSync(const QJsonObject& request, QJsonObject* reply, QString* error, int timeoutMs, std::stop_token stop) {
    if (stop.stop_requested()) {
        if (error) *error = QStringLiteral("Plugin request cancelled");
        return false;
    }
    if (m_shutDown || !m_worker || !m_thread.isRunning()) {
        if (error) *error = QStringLiteral("VST host is not running");
        return false;
    }
    const QString exe = executablePath();
    if (exe.isEmpty()) {
        if (error) *error = unavailableReason();
        return false;
    }
    // Shared with the queued request callback, which can finish after cancellation.
    auto waiter = std::make_shared<SyncWaiter>();
    const QPointer<HostWorker> worker(m_worker.get());
    std::stop_callback cancelled(stop, [worker, waiter] {
        if (!worker) { return; }
        QMetaObject::invokeMethod(worker, [worker, waiter] {
            if (!worker) { return; }
            bool dispatched;
            {
                std::lock_guard<std::mutex> lock(waiter->mutex);
                dispatched = waiter->dispatched;
            }
            // A dispatched mutation cannot be recalled through the JSON-line protocol.
            // End its process before reporting cancellation or accepting another request.
            if (dispatched) { worker->terminateOnWorkerThread(); }
            {
                std::lock_guard<std::mutex> lock(waiter->mutex);
                waiter->cancelled = true;
            }
            waiter->cv.notify_all();
        }, Qt::QueuedConnection);
    });
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, request, timeoutMs, waiter, stop]() {
            if (!worker || stop.stop_requested()) { return; }
            {
                std::lock_guard<std::mutex> lock(waiter->mutex);
                waiter->dispatched = true;
            }
            worker->sendRequest(exe, request, timeoutMs, [waiter](bool ok, const QJsonObject& r, const QString& err) {
                {
                    std::lock_guard<std::mutex> lock(waiter->mutex);
                    waiter->done = true;
                    waiter->ok = ok;
                    waiter->reply = r;
                    waiter->error = err;
                }
                waiter->cv.notify_one();
            });
        },
        Qt::QueuedConnection);

    std::unique_lock<std::mutex> lock(waiter->mutex);
    const bool finished = waiter->cv.wait_for(lock, std::chrono::milliseconds(timeoutMs + 2000),
                                              [&] { return waiter->cancelled || (waiter->done && !stop.stop_requested()); });
    if (stop.stop_requested()) {
        waiter->cv.wait_for(lock, std::chrono::milliseconds(2000), [&] { return waiter->cancelled; });
        if (error) *error = QStringLiteral("Plugin request cancelled");
        return false;
    }
    if (!finished) {
        if (error) *error = QStringLiteral("VST host request timed out");
        return false;
    }
    if (!waiter->ok) {
        if (error) *error = waiter->error;
        return false;
    }
    if (reply) *reply = waiter->reply;
    return true;
}

bool VstHostClient::listPresets(const QJsonObject& target, QJsonObject* reply, QString* error, std::stop_token stop) {
    auto request = target;
    request.insert(QStringLiteral("cmd"), QStringLiteral("listPresets"));
    return sendSync(request, reply, error, 30000, stop);
}

bool VstHostClient::selectPreset(const QJsonObject& target, QJsonObject* reply, QString* error, std::stop_token stop) {
    auto request = target;
    request.insert(QStringLiteral("cmd"), QStringLiteral("selectPreset"));
    return sendSync(request, reply, error, 30000, stop);
}

bool VstHostClient::getParameters(const QJsonObject& target, QJsonObject* reply, QString* error, std::stop_token stop) {
    auto request = target;
    request.insert(QStringLiteral("cmd"), QStringLiteral("getParameters"));
    return sendSync(request, reply, error, 30000, stop);
}

bool VstHostClient::setParameters(const QJsonObject& target, QJsonObject* reply, QString* error, std::stop_token stop) {
    auto request = target;
    request.insert(QStringLiteral("cmd"), QStringLiteral("setParameters"));
    return sendSync(request, reply, error, 30000, stop);
}

bool VstHostClient::scanSync(bool rescan, std::vector<VstPluginInfo>* out, QString* error, int timeoutMs, std::stop_token stop) {
    QStringList dirs;
    {
        std::lock_guard<std::mutex> lock(m_configMutex);
        if (!rescan && m_hasScanned) {
            if (out) *out = m_cachedPlugins;
            return true;
        }
        dirs = m_extraScanDirs;
    }
    QJsonArray dirArray;
    for (const QString& d : dirs) dirArray.append(d);
    QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("scan")},
        {QStringLiteral("dirs"), dirArray},
        {QStringLiteral("includeEffects"), true},
    };
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs, stop)) return false;
    auto plugins = parsePlugins(reply);
    {
        std::lock_guard<std::mutex> lock(m_configMutex);
        m_cachedPlugins = plugins;
        m_hasScanned = true;
    }
    if (out) *out = std::move(plugins);
    return true;
}

void VstHostClient::scanAsync(bool rescan) {
    QStringList dirs;
    {
        std::lock_guard<std::mutex> lock(m_configMutex);
        if (!rescan && m_hasScanned) {
            QVariantList list;
            for (const auto& p : m_cachedPlugins) list.append(pluginInfoToVariant(p));
            const QPointer<VstHostClient> self(this);
            QMetaObject::invokeMethod(this, [self, list]() {
                if (self) emit self->scanFinished(list, {});
            }, Qt::QueuedConnection);
            return;
        }
        dirs = m_extraScanDirs;
    }
    const QString exe = executablePath();
    if (exe.isEmpty()) {
        const QString reason = unavailableReason();
        const QPointer<VstHostClient> self(this);
        QMetaObject::invokeMethod(this, [self, reason]() {
            if (self) emit self->scanFinished({}, reason);
        }, Qt::QueuedConnection);
        return;
    }
    QJsonArray dirArray;
    for (const QString& d : dirs) dirArray.append(d);
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("scan")},
        {QStringLiteral("dirs"), dirArray},
        {QStringLiteral("includeEffects"), true},
    };
    const QPointer<VstHostClient> self(this);
    HostWorker* worker = m_worker.get();
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, req, self]() {
            worker->sendRequest(exe, req, 180000, [self](bool ok, const QJsonObject& reply, const QString& err) {
                QVariantList list;
                if (ok && self) {
                    auto plugins = parsePlugins(reply);
                    for (const auto& p : plugins) list.append(pluginInfoToVariant(p));
                    {
                        std::lock_guard<std::mutex> lock(self->m_configMutex);
                        self->m_cachedPlugins = std::move(plugins);
                        self->m_hasScanned = true;
                    }
                }
                if (self) {
                    QMetaObject::invokeMethod(self, [self, list, err]() {
                        if (self) emit self->scanFinished(list, err);
                    }, Qt::QueuedConnection);
                }
            });
        },
        Qt::QueuedConnection);
}

bool VstHostClient::renderInstrument(const QString& path, const QString& uid, const QString& state,
                                     double sampleRate, std::int64_t frames, const std::vector<VstNoteEvent>& events,
                                     std::vector<float>* interleavedOut, QString* error, int timeoutMs) {
    if (!interleavedOut || frames <= 0) {
        if (interleavedOut) interleavedOut->clear();
        return frames == 0;
    }
    QJsonArray evArr;
    for (const auto& e : events) {
        evArr.append(QJsonObject{
            {QStringLiteral("pitch"), e.pitch},
            {QStringLiteral("velocity"), e.velocity},
            {QStringLiteral("startFrame"), static_cast<qint64>(e.startFrame)},
            {QStringLiteral("gateOffFrame"), static_cast<qint64>(e.gateOffFrame)},
        });
    }
    const QString outPath = tempPlanarPath("render");
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("render")},
        {QStringLiteral("instance"), QStringLiteral("render:") + uid},
        {QStringLiteral("path"), path},
        {QStringLiteral("uid"), uid},
        {QStringLiteral("state"), state},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("frames"), static_cast<qint64>(frames)},
        {QStringLiteral("events"), evArr},
        {QStringLiteral("out"), outPath},
    };
    QJsonObject reply;
    const bool ok = sendSync(req, &reply, error, timeoutMs);
    bool readOk = false;
    if (ok) {
        readOk = readInterleavedFromPlanar(outPath, frames, interleavedOut);
        if (!readOk && error) *error = QStringLiteral("Failed to read VST render output");
    }
    QFile::remove(outPath);
    return ok && readOk;
}

bool VstHostClient::processAudio(const QString& path, const QString& uid, const QString& state,
                                 double sampleRate, std::span<const float> interleavedIn,
                                 std::vector<float>* interleavedOut, QString* error, int timeoutMs) {
    const std::int64_t frames = static_cast<std::int64_t>(interleavedIn.size() / 2);
    if (!interleavedOut || frames <= 0) {
        if (interleavedOut) interleavedOut->clear();
        return frames == 0;
    }
    const QString inPath = tempPlanarPath("in");
    const QString outPath = tempPlanarPath("out");
    if (!writePlanarFromInterleaved(inPath, interleavedIn)) {
        if (error) *error = QStringLiteral("Failed to write VST process input");
        QFile::remove(inPath);
        return false;
    }
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("process")},
        {QStringLiteral("instance"), QStringLiteral("process:") + uid},
        {QStringLiteral("path"), path},
        {QStringLiteral("uid"), uid},
        {QStringLiteral("state"), state},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("frames"), static_cast<qint64>(frames)},
        {QStringLiteral("in"), inPath},
        {QStringLiteral("out"), outPath},
    };
    QJsonObject reply;
    const bool ok = sendSync(req, &reply, error, timeoutMs);
    bool readOk = false;
    if (ok) {
        readOk = readInterleavedFromPlanar(outPath, frames, interleavedOut);
        if (!readOk && error) *error = QStringLiteral("Failed to read VST process output");
    }
    QFile::remove(inPath);
    QFile::remove(outPath);
    return ok && readOk;
}

bool VstHostClient::openLive(const QString& instance, const QString& path, const QString& uid, const QString& state,
                             double sampleRate, int maxBlockFrames, const QString& shmPath, const QString& sockPath,
                             int* latencySamples, QString* error, int timeoutMs) {
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("openLive")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("path"), path},
        {QStringLiteral("uid"), uid},
        {QStringLiteral("state"), state},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("maxBlockFrames"), maxBlockFrames},
        {QStringLiteral("shmPath"), shmPath},
        {QStringLiteral("sockPath"), sockPath},
    };
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (latencySamples) *latencySamples = reply.value(u"latencySamples").toInt(0);
    return true;
}

bool VstHostClient::prepareLive(const QString& instance, double sampleRate, int maxBlockFrames,
                                int* latencySamples, QString* error, int timeoutMs) {
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("prepareLive")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("maxBlockFrames"), maxBlockFrames},
    };
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (latencySamples) *latencySamples = reply.value(u"latencySamples").toInt(0);
    return true;
}

bool VstHostClient::setLiveState(const QString& instance, const QString& state, QString* error, int timeoutMs) {
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("setLiveState")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("state"), state},
    };
    QJsonObject reply;
    return sendSync(req, &reply, error, timeoutMs);
}

void VstHostClient::closeLiveAsync(const QString& instance) {
    const QString exe = executablePath();
    if (exe.isEmpty() || m_shutDown || !m_worker) return;
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("closeLive")},
        {QStringLiteral("instance"), instance},
    };
    HostWorker* worker = m_worker.get();
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, req]() { worker->sendRequest(exe, req, 15000, [](bool, const QJsonObject&, const QString&) {}); },
        Qt::QueuedConnection);
}

void VstHostClient::terminateHostForTest() {
    if (m_shutDown || !m_worker || !m_thread.isRunning()) return;
    const QPointer<HostWorker> worker(m_worker.get());
    QMetaObject::invokeMethod(
        worker,
        [worker]() { if (worker) { worker->terminateOnWorkerThread(); } },
        Qt::BlockingQueuedConnection);
}

void VstHostClient::openEditorAsync(const QString& instance, const QString& path, const QString& uid,
                                    const QString& state, const QString& title) {
    const QString exe = executablePath();
    if (exe.isEmpty()) {
        const QString reason = unavailableReason();
        const QPointer<VstHostClient> self(this);
        QMetaObject::invokeMethod(this, [self, instance, reason]() {
            if (self) emit self->editorOpened(instance, reason);
        }, Qt::QueuedConnection);
        return;
    }
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("openEditor")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("path"), path},
        {QStringLiteral("uid"), uid},
        {QStringLiteral("state"), state},
        {QStringLiteral("title"), title},
    };
    const QPointer<VstHostClient> self(this);
    HostWorker* worker = m_worker.get();
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, req, instance, self]() {
            worker->sendRequest(exe, req, 30000, [self, instance](bool ok, const QJsonObject&, const QString& err) {
                if (self) {
                    QMetaObject::invokeMethod(self, [self, instance, error = ok ? QString() : err]() {
                        if (self) emit self->editorOpened(instance, error);
                    }, Qt::QueuedConnection);
                }
            });
        },
        Qt::QueuedConnection);
}

void VstHostClient::restoreStateAsync(const QString& instance, const QJsonObject& slot) {
    const QString exe = executablePath();
    if (exe.isEmpty() || m_shutDown || !m_worker) {
        emit stateRestored(instance, slot.value("state").toString(),
                           exe.isEmpty() ? unavailableReason() : QStringLiteral("VST host has shut down."));
        return;
    }
    const auto plugin = slot.value("plugin").toObject();
    const QJsonObject req{{"cmd", "setState"}, {"instance", instance},
                          {"path", plugin.value("path")}, {"uid", plugin.value("uid")},
                          {"state", slot.value("state")}};
    const QPointer<HostWorker> worker(m_worker.get());
    const QPointer<VstHostClient> self(this);
    QMetaObject::invokeMethod(worker, [worker, exe, req, instance, self] {
        if (!worker) { return; }
        worker->sendRequest(exe, req, 30000, [self, instance, state = req.value("state").toString()](bool ok, const QJsonObject&, const QString& err) {
            if (self) {
                QMetaObject::invokeMethod(self, [self, instance, state, error = ok ? QString() : err] {
                    if (self) { emit self->stateRestored(instance, state, error); }
                }, Qt::QueuedConnection);
            }
        });
    }, Qt::QueuedConnection);
}

void VstHostClient::closeEditorAsync(const QString& instance) {
    const QString exe = executablePath();
    if (exe.isEmpty() || m_shutDown || !m_worker) return;
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("closeEditor")},
        {QStringLiteral("instance"), instance},
    };
    const QPointer<VstHostClient> self(this);
    HostWorker* worker = m_worker.get();
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, req, instance, self]() {
            worker->sendRequest(exe, req, 15000, [self, instance](bool, const QJsonObject&, const QString&) {
                if (self) {
                    QMetaObject::invokeMethod(self, [self, instance]() {
                        if (self) emit self->editorClosedReply(instance);
                    }, Qt::QueuedConnection);
                }
            });
        },
        Qt::QueuedConnection);
}

void VstHostClient::disposeAsync(const QString& instance) {
    const QString exe = executablePath();
    if (exe.isEmpty() || m_shutDown || !m_worker) return;
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("dispose")},
        {QStringLiteral("instance"), instance},
    };
    HostWorker* worker = m_worker.get();
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, req]() { worker->sendRequest(exe, req, 15000, [](bool, const QJsonObject&, const QString&) {}); },
        Qt::QueuedConnection);
}

std::shared_ptr<VstHostClient> sharedVstHostClient() {
    // Shared ownership is required because both the process-level MixPlanStage
    // callbacks and the QML VstHostModel singleton borrow the same helper process.
    static std::mutex mutex;
    static std::weak_ptr<VstHostClient> weak;
    std::lock_guard<std::mutex> lock(mutex);
    auto client = weak.lock();
    if (!client) {
        client = std::make_shared<VstHostClient>();
        weak = client;
        if (auto* app = QCoreApplication::instance()) {
            const std::weak_ptr<VstHostClient> shutdownRef = client;
            QObject::connect(app, &QCoreApplication::aboutToQuit, app, [shutdownRef]() {
                if (auto c = shutdownRef.lock()) c->shutdown();
            });
        }
    }
    return client;
}

}  // namespace nt::audio::vst
