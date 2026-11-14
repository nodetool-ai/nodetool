#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
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
signals:
    void changed();
    // The target changed, so a loaded Comfy catalog is stale.
    void targetChanged();
    void workflowCreated(const QString &id);
    void errorOccurred(const QString &message);
private:
    using Done = std::function<void(QJsonValue, QString)>;
    void rest(const QByteArray &method, const QString &path, const QJsonObject &body, Done done);
    void trpc(const QString &route, const QJsonObject &body, bool mutation, Done done);
    void send(const QUrl &url, const QByteArray &method, const QJsonObject &body, bool trpcReply, Done done);
    void apply(const QJsonObject &settings, const QJsonObject &secrets = {});
    void readSettings(std::function<void()> then = {});
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
};
}  // namespace nodetool::node_editor
