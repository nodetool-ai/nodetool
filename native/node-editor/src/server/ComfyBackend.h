#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <functional>
#include <optional>

namespace nodetool::node_editor {

// Pure parts of the web Comfy backend, so tests can check them without a server.
// web/src/components/panels/ComfyTargetSelector.tsx comfyTargetLabel.
QString comfyTargetLabel(const QString &target, const QString &serverUrl, const QString &workerUrl);
// "cloud", "server" or "worker". An unset target follows the legacy server-first rule.
QString comfyTargetKind(const QString &target, const QString &serverUrl);
// web/src/lib/comfy/comfyServerStatus.ts describeComfyServer and describeComfyModels.
QString describeComfyServer(const QJsonObject &status);
QString describeComfyModels(const QJsonObject &status);
// web/src/lib/comfy/comfyStarterGraph.ts pickStarterCheckpoint.
QString pickStarterCheckpoint(const QStringList &checkpoints);
// comfyStarterGraph's API-format prompt, on `checkpoint` when it is not empty.
QJsonObject comfyStarterPrompt(const QString &checkpoint, int seed);
// mergeComfyCatalog in web/src/serverState/useComfyNodeMetadata.ts: the new
// target's records, plus the previous target's comfy records it lacks, hidden,
// because a card on the canvas still needs its metadata.
QJsonArray nextComfyRecords(const QJsonArray &previous, const QJsonArray &incoming);
// The base catalog with the Comfy records merged in by node type.
QJsonArray mergeComfyCatalog(const QJsonArray &base, const QJsonArray &records);
// NodeMenu.tsx: a Comfy workflow offers only ComfyUI node classes and no other
// workflow offers them. Entries of the other kind come back hidden.
QJsonArray comfyMenuMetadata(const QJsonArray &metadata, bool comfyWorkflow);
bool comfyWorkflow(const QJsonObject &workflow);
// comfyEndpointFromWsUrl in packages/compute/src/comfy-server.ts: a ComfyUI
// pod's stored WebSocket URL as the HTTP endpoint the target points at.
QString comfyEndpointFromWsUrl(const QString &wsUrl);
// A Comfy preset's listed price (worker.comfyPresets hourlyUsd), such as
// "$0.72–$1.19/hr", or one figure when the range is a single price.
QString comfyPresetPrice(const QJsonObject &preset);
// The confirm text before renting a preset: GPU, price, who bills, and the
// automatic shutdown.
QString comfyRentConfirmText(const QJsonObject &preset);
// The toolbar label while a rented worker starts, such as
// "Starting MiniMax H3 worker… 3 min".
QString comfyRentLabel(const QString &presetLabel, qint64 elapsedMs);

// Where Comfy workflows run, as the web ComfyTargetSelector and
// LocalComfyConnect read and write it: the COMFY_TARGET, COMFY_SERVER_URL and
// COMFY_WORKER_URL settings, the running workers, the saved ComfyUI's status,
// the target's node catalog and new Comfy workflows.
//
// UI thread only. The window that owns the tabs owns it as a member, and a
// reply that finishes after configure() changed the account is ignored.
class ComfyBackend final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString target READ target NOTIFY changed)
    Q_PROPERTY(QString serverUrl READ serverUrl NOTIFY changed)
    Q_PROPERTY(QString workerUrl READ workerUrl NOTIFY changed)
    Q_PROPERTY(QString label READ label NOTIFY changed)
    // "idle" (no address saved), "checking", "connected" or "error".
    Q_PROPERTY(QString statusState READ statusState NOTIFY changed)
    Q_PROPERTY(QString statusText READ statusText NOTIFY changed)
    Q_PROPERTY(QString modelsText READ modelsText NOTIFY changed)
    Q_PROPERTY(QVariantList workers READ workers NOTIFY changed)
    // Renting a ComfyUI worker from the target control: the presets
    // (worker.comfyPresets), whether RunPod has a key, the rent in progress and
    // the rented ComfyUI workers that still bill.
    Q_PROPERTY(QVariantList rentPresets READ rentPresets NOTIFY changed)
    Q_PROPERTY(bool rentKeyMissing READ rentKeyMissing NOTIFY changed)
    Q_PROPERTY(bool renting READ renting NOTIFY changed)
    Q_PROPERTY(QString rentLabel READ rentLabel NOTIFY changed)
    Q_PROPERTY(QVariantList rentedWorkers READ rentedWorkers NOTIFY changed)
public:
    explicit ComfyBackend(QObject *parent = nullptr);
    ~ComfyBackend() override;
    void configure(const QUrl &origin, const QString &token, const QString &user);
    bool configured() const { return !origin_.isEmpty(); }
    // The settings have been read once for this account.
    bool ready() const { return settingsRead_; }
    QString target() const { return target_; }
    QString kind() const { return comfyTargetKind(target_, serverUrl_); }
    QString serverUrl() const { return serverUrl_; }
    QString workerUrl() const { return workerUrl_; }
    QString label() const { return comfyTargetLabel(target_, serverUrl_, workerUrl_); }
    QString statusState() const { return statusState_; }
    QString statusText() const { return statusText_; }
    QString modelsText() const { return modelsText_; }
    QJsonObject status() const { return status_; }
    // Running or attached workers: {id, name, host, wsUrl, token}.
    QVariantList workers() const;
    // The presets a worker can be rented with: {id, label, price, confirm}.
    // Empty when the server has no worker manager.
    QVariantList rentPresets() const;
    // The server reported no RunPod API key, so renting would fail.
    bool rentKeyMissing() const { return keyStatusRead_ && !runpodKey_; }
    bool renting() const { return !rentPreset_.isEmpty(); }
    // The toolbar label while a rented worker starts. Empty otherwise.
    QString rentLabel() const;
    // The preset workers that bill until released, newest first:
    // {id, name, status, cost, current}. current: the target points at it.
    QVariantList rentedWorkers() const;
    // The toolbar text: the rent in progress, else the target's label.
    QString toolbarLabel() const { return renting() ? rentLabel() : label(); }
    // How often a starting worker is polled, and how long it may take before
    // the wait stops. A test shortens both.
    void setRentTiming(int pollMs, qint64 timeoutMs);
    // Rents a ComfyUI worker with the preset (worker.startComfyPreset), polls it
    // until ComfyUI answers, then points the Comfy target at it. The caller has
    // confirmed the cost.
    Q_INVOKABLE void rentWorker(const QString &presetId);
    // Ends the rent in progress and releases its worker.
    Q_INVOKABLE void cancelRent();
    // Terminates a rented worker, which ends its billing. When the target
    // points at it, the target returns to where it was before the rent.
    Q_INVOKABLE void releaseWorker(const QString &id);
    // Reads the settings and the workers, then checks the saved ComfyUI.
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void checkStatus();
    Q_INVOKABLE void selectCloud();
    Q_INVOKABLE void selectServer(const QString &url);
    // A Comfy preset pod has no worker bridge, so it becomes a server with its URL.
    Q_INVOKABLE void selectWorker(const QString &id);
    // GET /api/comfy/nodes. `done` gets the records or the error.
    void loadCatalog(std::function<void(QJsonArray, QString)> done);
    // useStartComfyWorkflow: the starter graph on one of the saved server's
    // checkpoints, saved as a new Comfy workflow. Emits workflowCreated.
    Q_INVOKABLE void createWorkflow(const QString &projectId = {});
    // The starter graph as a NodeTool graph of comfy.* nodes, from POST
    // /api/comfy/import-graph. `done` gets the graph or the error.
    void starterGraph(std::function<void(QJsonObject, QString)> done);
signals:
    void changed();
    // The target changed, so a loaded Comfy catalog is stale.
    void targetChanged();
    void workflowCreated(const QString &id);
    void errorOccurred(const QString &message);
    // A rented worker is ready and the target points at it, or it was released.
    void noticeOccurred(const QString &message);
private:
    using Done = std::function<void(QJsonValue, QString)>;
    void rest(const QByteArray &method, const QString &path, const QJsonObject &body, Done done);
    void trpc(const QString &route, const QJsonObject &body, bool mutation, Done done);
    void send(const QUrl &url, const QByteArray &method, const QJsonObject &body, bool trpcReply, Done done);
    void apply(const QJsonObject &settings, const QJsonObject &secrets = {});
    void readSettings(std::function<void()> then = {});
    void loadWorkers();
    void pollRent();
    void endRent();
    QJsonObject preset(const QString &id) const;
    QNetworkAccessManager network_;
    QUrl origin_;
    QString token_, user_;
    QString target_, serverUrl_, workerUrl_;
    QString statusState_ = QStringLiteral("idle"), statusText_, modelsText_;
    QJsonObject status_;
    QJsonArray workers_;
    QString statusUrl_;
    quint64 epoch_ = 0;
    quint64 statusEpoch_ = 0;
    bool creating_ = false;
    bool settingsRead_ = false;
    QJsonArray presets_;
    bool runpodKey_ = false, keyStatusRead_ = false;
    // The rent in progress: its preset, its instance once the server made one,
    // when it started, and the target to return to when its worker goes.
    QString rentPreset_, rentInstance_;
    qint64 rentStarted_ = 0;
    bool rentCancelled_ = false, rentProbing_ = false;
    QJsonObject targetBeforeRent_;
    QTimer rentTimer_;
    qint64 rentTimeoutMs_ = 30 * 60 * 1000;
};
}  // namespace nodetool::node_editor
