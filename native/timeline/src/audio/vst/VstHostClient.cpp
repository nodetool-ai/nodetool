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

// Thread-safe latency target registry shared by VstHostClient and HostWorker
// so HostWorker updates targets on m_thread without dereferencing VstHostClient.
struct VstHostClient::LatencyTargetRegistry {
    std::mutex mutex;
    std::unordered_map<std::string, std::weak_ptr<VstLatencyTarget>> targets;

    void registerTarget(const QString& instance, std::weak_ptr<VstLatencyTarget> target) {
        std::lock_guard<std::mutex> lock(mutex);
        targets[instance.toStdString()] = std::move(target);
    }

    bool unregisterTarget(const QString& instance, const VstLatencyTarget* target) {
        std::lock_guard<std::mutex> lock(mutex);
        const auto it = targets.find(instance.toStdString());
        if (it == targets.end()) return true;
        const auto existing = it->second.lock();
        if (!existing || existing.get() == target) {
            targets.erase(it);
            return true;
        }
        return false;
    }

    void notify(const QString& instance, int latencySamples, std::uint64_t generation) {
        std::shared_ptr<VstLatencyTarget> target;
        {
            std::lock_guard<std::mutex> lock(mutex);
            const auto key = instance.toStdString();
            if (auto it = targets.find(key); it != targets.end()) {
                target = it->second.lock();
                if (!target) { targets.erase(it); }
            }
        }
        if (target) {
            (void)updateMonotonicVstLatency(*target, latencySamples, generation);
        }
    }
};

// Worker living exclusively on VstHostClient::m_thread. Owns the QProcess and
// matches JSON-line replies to pending callers.
class VstHostClient::HostWorker final : public QObject {
public:
    using Callback = std::function<void(bool ok, const QJsonObject& reply, const QString& error)>;

    HostWorker(VstHostClient* owner, std::shared_ptr<LatencyTargetRegistry> latencyRegistry)
        : m_owner(owner), m_latencyRegistry(std::move(latencyRegistry)) {}

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
        const auto cmd=request.value("cmd").toString();
        const auto instance=request.value("instance").toString();
        const auto key=instance.toStdString();
        if (cmd=="setLiveState") {
            auto restore=m_restorations.find(key);
            if (restore!=m_restorations.end() && restore->second.state==request.value("state").toString()) {
                if (auto pending=m_pending.find(restore->second.id); pending!=m_pending.end()) {
                    auto original=std::move(pending->second.callback);
                    pending->second.callback=[original=std::move(original),joined=std::move(callback)](bool ok,const QJsonObject& reply,const QString& error) {
                        original(ok,reply,error);
                        joined(ok,reply,error);
                    };
                    return;
                }
                callback(true, {}, {});
                return;
            }
            m_restorations.erase(key);
        } else if (cmd=="openLive" || cmd=="openEditor" || cmd=="dispose") {
            m_restorations.erase(key);
        }
        // Consume one live-load receipt. The host verifies the current state before
        // adopting the generation, so failed loads or intervening editor edits
        // still perform the requested restoration.
        if (cmd=="setState") {
            const auto edit=m_assistantEdits.find(key);
            if (edit!=m_assistantEdits.end()) {
                if (edit->second.result==request.value("state").toString()) {
                    request.insert("expectedState",edit->second.captured);
                }
                m_assistantEdits.erase(edit);
            }
            const auto live=m_liveLoads.find(key);
            if (live!=m_liveLoads.end() && live->second==request.value("state").toString()) {
                request.insert("cmd", "joinLiveState");
            }
        }
        if (cmd=="setLiveState") {
            m_liveLoads[key]=request.value("state").toString();
        } else if (cmd!="getState" && cmd!="getParameters") {
            m_liveLoads.erase(key);
        }
        const int id = m_nextId++;
        if (cmd=="openEditor") {
            m_editors.erase(key);
            m_editorRequests[key]=id;
            const QPointer<HostWorker> self(this);
            callback=[self,key,id,request,finished=std::move(callback)](bool ok,const QJsonObject& reply,const QString& error) {
                if (self) {
                    const auto pending=self->m_editorRequests.find(key);
                    if (pending!=self->m_editorRequests.end() && pending->second==id) {
                        if (ok) { self->m_editors[key]={{"path",request.value("path")},{"uid",request.value("uid")}}; }
                        self->m_editorRequests.erase(pending);
                    }
                }
                finished(ok,reply,error);
            };
        } else if (cmd=="closeEditor" || cmd=="dispose") {
            m_editorRequests.erase(key);
            m_editors.erase(key);
            m_assistantEdits.erase(key);
        }
        if (cmd=="setState") {
            const auto state=request.value("state").toString();
            m_restorations[key]={id,state,static_cast<quint64>(request.value("generation").toDouble())};
            const QPointer<HostWorker> self(this);
            callback=[self,key,id,finished=std::move(callback)](bool ok,const QJsonObject& reply,const QString& error) {
                if (self) {
                    auto it=self->m_restorations.find(key);
                    if (!ok && it!=self->m_restorations.end() && it->second.id==id) {
                        self->m_restorations.erase(it);
                    }
                }
                finished(ok,reply,error);
            };
        }
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

    void sendAssistantRequest(const QString& executable,const QJsonObject& original,QJsonObject isolated,
                              std::chrono::steady_clock::time_point deadline,std::function<bool()> active,Callback callback) {
        const QPointer<HostWorker> self(this);
        const auto originalInstance=original.value("instance").toString().toStdString();
        auto dispatch=[self,executable,originalInstance,isolated=std::move(isolated),deadline,active,callback]
            (const QJsonObject& captured) mutable {
            const auto remaining=std::chrono::duration_cast<std::chrono::milliseconds>(deadline-std::chrono::steady_clock::now()).count();
            if (!self || !active() || remaining<=0) { callback(false,{},QStringLiteral("Plugin request expired or cancelled")); return; }
            if (captured.value("state").isString()) { isolated.insert("state",captured.value("state")); }
            const auto temporary=isolated.value("instance").toString();
            const bool mutation=isolated.value("cmd")=="setParameters" || isolated.value("cmd")=="selectPreset";
            self->sendRequest(executable,std::move(isolated),static_cast<int>(remaining),
                [self,executable,temporary,originalInstance,mutation,captured,callback=std::move(callback)](bool ok,const QJsonObject& reply,const QString& error) {
                    if (self && ok && mutation && self->m_editors.contains(originalInstance) && captured.value("state").isString() && reply.value("state").isString()) {
                        self->m_assistantEdits[originalInstance]={captured.value("state").toString(),reply.value("state").toString()};
                    }
                    callback(ok,reply,error);
                    if (self) { self->disposeTemporary(executable,temporary); }
                });
        };
        const auto instance=original.value("instance").toString();
        const auto editor=m_editors.find(instance.toStdString());
        if (editor==m_editors.end() || editor->second.value("path")!=original.value("path") ||
            editor->second.value("uid")!=original.value("uid")) {
            dispatch({});
            return;
        }
        const auto remaining=std::chrono::duration_cast<std::chrono::milliseconds>(deadline-std::chrono::steady_clock::now()).count();
        if (!active() || remaining<=0) { dispatch({}); return; }
        // A closed editor has no state to capture. The disposable request can use the document state.
        sendRequest(executable,{{"cmd","getState"},{"instance",instance}},static_cast<int>(remaining),
            [self,instance,callback,dispatch=std::move(dispatch)](bool ok,const QJsonObject& reply,const QString& error) mutable {
                if (!ok && error.startsWith("Unknown instance")) {
                    if (self) { self->m_editors.erase(instance.toStdString()); }
                    dispatch({});
                    return;
                }
                if (!ok || !reply.value("state").isString()) { callback(false,{},ok ? QStringLiteral("Editor returned no plugin state") : error); return; }
                dispatch(reply);
            });
    }

    void disposeTemporary(const QString& executable, const QString& instance) {
        if (m_shuttingDown || !m_process || m_process->state() != QProcess::Running || m_startedPath != executable) { return; }
        sendRequest(executable, {{"cmd", "dispose"}, {"instance", instance}}, 15000,
                    [](bool, const QJsonObject&, const QString&) {});
    }

    std::size_t editorRequestCount() const { return m_editorRequests.size(); }

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
        m_restorations.clear();
        m_liveLoads.clear();
        m_editors.clear();
        m_editorRequests.clear();
        m_assistantEdits.clear();
    }

private:
    // Worker-thread-only restoration receipts join pool syncs to the same state load.
    struct Restoration { int id; QString state; quint64 generation; };
    std::unordered_map<std::string,Restoration> m_restorations;
    // Worker-owned, single-use receipts for in-flight or completed live loads.
    std::unordered_map<std::string,QString> m_liveLoads;
    std::unordered_map<std::string,QJsonObject> m_editors;
    std::unordered_map<std::string,int> m_editorRequests;
    // Worker-owned last assistant mutation per open editor. Cleared on restore or editor disposal.
    struct AssistantEdit { QString captured; QString result; };
    std::unordered_map<std::string,AssistantEdit> m_assistantEdits;

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
        m_restorations.clear();
        m_liveLoads.clear();
        m_editors.clear();
        m_editorRequests.clear();
        m_assistantEdits.clear();
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
            const auto generation = static_cast<quint64>(msg.value("generation").toDouble());
            const auto restoration=m_restorations.find(instance.toStdString());
            if (restoration!=m_restorations.end() && generation>=restoration->second.generation) {
                m_restorations.erase(restoration);
            }
            const QPointer<VstHostClient> owner = m_owner;
            if (event == u"latencyChanged") {
                const int latencySamples = std::clamp(msg.value(u"latencySamples").toInt(0), 0, kMaxVstLatencySamples);
                const auto latencyGen = static_cast<std::uint64_t>(
                    std::max<qint64>(0, msg.value(u"latencyGeneration").toInteger(0)));
                if (m_latencyRegistry) {
                    m_latencyRegistry->notify(instance, latencySamples, latencyGen);
                }
                if (owner) {
                    QMetaObject::invokeMethod(owner, [owner, instance, latencySamples]() {
                        if (owner) emit owner->pluginLatencyChanged(instance, latencySamples);
                    }, Qt::QueuedConnection);
                }
                return;
            }
            if (!owner) return;
            if (event == u"state") {
                QMetaObject::invokeMethod(owner, [owner, instance, state, generation]() {
                    if (owner) emit owner->pluginStateChanged(instance, state, generation);
                }, Qt::QueuedConnection);
            } else if (event == u"editorClosed") {
                m_editors.erase(instance.toStdString());
                m_editorRequests.erase(instance.toStdString());
                m_assistantEdits.erase(instance.toStdString());
                QMetaObject::invokeMethod(owner, [owner, instance, state, generation]() {
                    if (owner) emit owner->pluginEditorClosed(instance, state, generation);
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
        m_restorations.clear();
        m_liveLoads.clear();
        m_editors.clear();
        m_editorRequests.clear();
        m_assistantEdits.clear();
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
    // Shared with VstHostClient so latency notifications never dereference m_owner across threads.
    std::shared_ptr<LatencyTargetRegistry> m_latencyRegistry;
    std::unique_ptr<QProcess> m_process;
    QString m_startedPath;
    QByteArray m_buffer;
    int m_nextId = 1;
    std::unordered_map<int, Pending> m_pending;
    bool m_shuttingDown = false;
};

VstHostClient::VstHostClient(QObject* parent)
    : QObject(parent),
      m_latencyRegistry(std::make_shared<LatencyTargetRegistry>()) {
    m_worker = std::make_unique<HostWorker>(this, m_latencyRegistry);
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
    const auto deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(timeoutMs);
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
            {
                std::lock_guard<std::mutex> lock(waiter->mutex);
                waiter->cancelled = true;
            }
            waiter->cv.notify_all();
        }, Qt::QueuedConnection);
    });
    QMetaObject::invokeMethod(
        worker,
        [worker, exe, request, timeoutMs, deadline, waiter, stop]() {
            if (!worker || stop.stop_requested()) { return; }
            auto dispatched = request;
            const auto cmd = request.value("cmd").toString();
            const bool isolated = cmd == "listPresets" || cmd == "selectPreset" || cmd == "getParameters" || cmd == "setParameters";
            const auto temporary = isolated ? "request:" + QUuid::createUuid().toString(QUuid::Id128) : QString();
            // Assistant results become live only through the document commit. An
            // abandoned request must never alter an editor or live audio instance.
            if (isolated) { dispatched.insert("instance", temporary); }
            auto completed = [waiter](bool ok, const QJsonObject& r, const QString& err) {
                {
                    std::lock_guard<std::mutex> lock(waiter->mutex);
                    waiter->done = true;
                    waiter->ok = ok;
                    waiter->reply = r;
                    waiter->error = err;
                }
                waiter->cv.notify_one();
            };
            if (isolated) {
                auto active=[waiter,stop] { std::lock_guard<std::mutex> guard(waiter->mutex); return !waiter->cancelled && !stop.stop_requested(); };
                worker->sendAssistantRequest(exe,request,std::move(dispatched),deadline,std::move(active),std::move(completed));
            }
            else { worker->sendRequest(exe,std::move(dispatched),timeoutMs,std::move(completed)); }
        },
        Qt::QueuedConnection);

    std::unique_lock<std::mutex> lock(waiter->mutex);
    const bool finished = waiter->cv.wait_until(lock, deadline,
                                              [&] { return waiter->cancelled || (waiter->done && !stop.stop_requested()); });
    if (stop.stop_requested()) {
        waiter->cv.wait_for(lock, std::chrono::milliseconds(2000), [&] { return waiter->cancelled; });
        if (error) *error = QStringLiteral("Plugin request cancelled");
        return false;
    }
    if (!finished) {
        waiter->cancelled=true;
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
                             int* latencySamples, QString* error, int timeoutMs,
                             std::uint64_t* latencyGeneration, int renderQuantumFrames,
                             int* configuredQuantumOut) {
    QJsonObject req{
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
    if (renderQuantumFrames > 0) {
        req.insert(QStringLiteral("renderQuantumFrames"), renderQuantumFrames);
    }
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (latencySamples) *latencySamples = std::clamp(reply.value(u"latencySamples").toInt(0), 0, kMaxVstLatencySamples);
    if (latencyGeneration) {
        *latencyGeneration = static_cast<std::uint64_t>(std::max<qint64>(0, reply.value(u"latencyGeneration").toInteger(0)));
    }
    if (configuredQuantumOut) {
        *configuredQuantumOut = reply.value(u"renderQuantumFrames").toInt(renderQuantumFrames > 0 ? renderQuantumFrames : maxBlockFrames);
    }
    return true;
}

bool VstHostClient::prepareLive(const QString& instance, double sampleRate, int maxBlockFrames,
                                int* latencySamples, QString* error, int timeoutMs,
                                std::uint64_t* latencyGeneration, int renderQuantumFrames,
                                bool schedulingOnly, int* configuredQuantumOut) {
    QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("prepareLive")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("maxBlockFrames"), maxBlockFrames},
    };
    if (renderQuantumFrames > 0) {
        req.insert(QStringLiteral("renderQuantumFrames"), renderQuantumFrames);
    }
    if (schedulingOnly) {
        req.insert(QStringLiteral("schedulingOnly"), true);
    }
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (latencySamples) *latencySamples = std::clamp(reply.value(u"latencySamples").toInt(0), 0, kMaxVstLatencySamples);
    if (latencyGeneration) {
        *latencyGeneration = static_cast<std::uint64_t>(std::max<qint64>(0, reply.value(u"latencyGeneration").toInteger(0)));
    }
    if (configuredQuantumOut) {
        *configuredQuantumOut = reply.value(u"renderQuantumFrames").toInt(renderQuantumFrames > 0 ? renderQuantumFrames : maxBlockFrames);
    }
    return true;
}

bool VstHostClient::probeLiveLatency(const QString& instance, double sampleRate, int maxBlockFrames,
                                     int* latencySamples, QString* error, int timeoutMs,
                                     std::uint64_t* latencyGeneration) {
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("getLatency")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("sampleRate"), sampleRate},
        {QStringLiteral("maxBlockFrames"), maxBlockFrames},
    };
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (latencySamples) *latencySamples = std::clamp(reply.value(u"latencySamples").toInt(0), 0, kMaxVstLatencySamples);
    if (latencyGeneration) {
        *latencyGeneration = static_cast<std::uint64_t>(std::max<qint64>(0, reply.value(u"latencyGeneration").toInteger(0)));
    }
    return true;
}

bool VstHostClient::setLiveState(const QString& instance, const QString& state, QString* error, int timeoutMs,
                                 int* latencySamples, std::uint64_t* latencyGeneration) {
    const QJsonObject req{
        {QStringLiteral("cmd"), QStringLiteral("setLiveState")},
        {QStringLiteral("instance"), instance},
        {QStringLiteral("state"), state},
    };
    QJsonObject reply;
    if (!sendSync(req, &reply, error, timeoutMs)) return false;
    if (reply.contains(u"latencySamples")) {
        if (latencySamples) {
            *latencySamples = std::clamp(reply.value(u"latencySamples").toInt(0), 0, kMaxVstLatencySamples);
        }
        if (latencyGeneration) {
            *latencyGeneration = static_cast<std::uint64_t>(std::max<qint64>(0, reply.value(u"latencyGeneration").toInteger(0)));
        }
    }
    return true;
}

void VstHostClient::registerLatencyTarget(const QString& instance, std::weak_ptr<VstLatencyTarget> target) {
    if (m_latencyRegistry) {
        m_latencyRegistry->registerTarget(instance, std::move(target));
    }
}

bool VstHostClient::unregisterLatencyTarget(const QString& instance, const VstLatencyTarget* target) {
    if (m_latencyRegistry) {
        return m_latencyRegistry->unregisterTarget(instance, target);
    }
    return true;
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

std::size_t VstHostClient::editorRequestCountForTest() {
    std::size_t count=0;
    if (m_shutDown || !m_worker || !m_thread.isRunning()) { return count; }
    const QPointer<HostWorker> worker(m_worker.get());
    QMetaObject::invokeMethod(worker,[worker,&count] {
        if (worker) { count=worker->editorRequestCount(); }
    },Qt::BlockingQueuedConnection);
    return count;
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
                                    const QString& state, const QString& title, quint64 generation) {
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
        {QStringLiteral("generation"), static_cast<double>(generation)},
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

void VstHostClient::restoreStateAsync(const QString& instance, const QJsonObject& slot, quint64 generation) {
    const QString exe = executablePath();
    if (exe.isEmpty() || m_shutDown || !m_worker) {
        emit stateRestored(instance, slot.value("state").toString(),
                           exe.isEmpty() ? unavailableReason() : QStringLiteral("VST host has shut down."), generation);
        return;
    }
    const auto plugin = slot.value("plugin").toObject();
    const QJsonObject req{{"cmd", "setState"}, {"instance", instance}, {"generation", static_cast<double>(generation)},
                          {"path", plugin.value("path")}, {"uid", plugin.value("uid")},
                          {"state", slot.value("state")}};
    const QPointer<HostWorker> worker(m_worker.get());
    const QPointer<VstHostClient> self(this);
    QMetaObject::invokeMethod(worker, [worker, exe, req, instance, self] {
        if (!worker) { return; }
        worker->sendRequest(exe, req, 30000, [self, instance, state = req.value("state").toString(), generation = static_cast<quint64>(req.value("generation").toDouble())](bool ok, const QJsonObject&, const QString& err) {
            if (self) {
                QMetaObject::invokeMethod(self, [self, instance, state, generation, error = ok ? QString() : err] {
                    if (self) { emit self->stateRestored(instance, state, error, generation); }
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
