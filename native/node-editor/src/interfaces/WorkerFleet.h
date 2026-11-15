#pragma once
#include <QHash>
#include <QJsonObject>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QObject>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <functional>

namespace nodetool::node_editor {

// What WorkersPanel.qml reads and does: the GPU workers the server rents
// (web/src/hooks/useWorkers.ts and web/src/components/workers/WorkersPanel.tsx).
// It lists profiles and instances, polls each booting worker until it answers,
// attaches a worker started here once it is ready, and runs the lifecycle
// mutations. Instances bill continuously, so Stop, Terminate and Stop all are
// one click away.
//
// The default transport calls the server's tRPC routes. A test sets its own
// transport with setTransport().
//
// UI thread only.
class WorkerFleet : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool available READ available NOTIFY changed)
    Q_PROPERTY(QVariantList profiles READ profiles NOTIFY changed)
    // The shown instances, each with display fields: displayStatus, tone,
    // hint, uptime, cost, healthy, booting, comfyEndpoint.
    Q_PROPERTY(QVariantList instances READ instances NOTIFY changed)
    Q_PROPERTY(QVariantList comfyPresets READ comfyPresets NOTIFY changed)
    // {runpod, vast, verda}: whether each provider has an API key. Empty while unknown.
    Q_PROPERTY(QVariantMap apiKeyStatus READ apiKeyStatus NOTIFY changed)
    // The hourly cost of the billing instances, such as "$1.20/hr". Empty with no instances.
    Q_PROPERTY(QString rateText READ rateText NOTIFY changed)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool provisioning READ provisioning NOTIFY changed)
    Q_PROPERTY(QString stoppingId READ stoppingId NOTIFY changed)
    Q_PROPERTY(QString startingPresetId READ startingPresetId NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // {title, details} after a reconcile found orphans. Empty otherwise.
    Q_PROPERTY(QVariantMap orphanWarning READ orphanWarning NOTIFY changed)
public:
    using Reply = std::function<void(const QJsonValue &data, const QString &error)>;
    using Transport = std::function<void(const QString &procedure, const QJsonObject &input, bool mutation, Reply reply)>;

    explicit WorkerFleet(QObject *parent = nullptr);
    ~WorkerFleet() override;

    // An empty base disables the panel. A new server clears the state.
    void setServer(const QUrl &base, const QString &token);
    void setTransport(Transport transport);
    // The clock for uptime, in ms since the epoch. A test fixes it.
    void setClock(std::function<qint64()> clock);

    bool available() const { return available_; }
    QVariantList profiles() const { return profiles_; }
    QVariantList instances() const;
    QVariantList comfyPresets() const { return presets_; }
    QVariantMap apiKeyStatus() const { return apiKeyStatus_; }
    QString rateText() const;
    bool loading() const { return loading_; }
    bool busy() const { return busy_; }
    bool provisioning() const { return provisioning_; }
    QString stoppingId() const { return stoppingId_; }
    QString startingPresetId() const { return startingPresetId_; }
    QString error() const { return error_; }
    QVariantMap orphanWarning() const { return orphanWarning_; }

    // The panel polls only while it is open.
    Q_INVOKABLE void setActive(bool active);
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void provision(const QString &profileName);
    Q_INVOKABLE void startPreset(const QString &presetId);
    Q_INVOKABLE void stop(const QString &id);
    Q_INVOKABLE void resume(const QString &id);
    Q_INVOKABLE void terminate(const QString &id);
    Q_INVOKABLE void stopAll();
    Q_INVOKABLE void attach(const QString &id);
    Q_INVOKABLE void detach();
    Q_INVOKABLE void reconcile();
    // The fields of WorkerProfilesDialog: name, target, image, gpu, vcpu,
    // disk, token_policy, idle_timeout_minutes, max_lifetime_minutes. Blank
    // numbers are left out. With start, provisions the profile after it saves.
    Q_INVOKABLE void createProfile(const QVariantMap &form, bool start);
    Q_INVOKABLE void deleteProfile(const QString &name);
    // Checks the key with the provider, then stores it. force stores a key the check could not verify.
    Q_INVOKABLE void saveApiKey(const QString &target, const QString &key, bool force);
    Q_INVOKABLE void clearError();
    Q_INVOKABLE void dismissOrphanWarning();
    // "RunPod A40", with a number when a profile already has the name.
    Q_INVOKABLE QString suggestProfileName(const QString &base) const;
    Q_INVOKABLE QString providerLabel(const QString &target) const;

signals:
    void changed();
    // A provision started from the Start dialog finished. The dialog closes on success.
    void provisionFinished(bool ok);
    // A profile form saved (and started, when asked). error is empty on success.
    void profileFinished(const QString &error, bool started);
    // The API key form: "saved", "rejected" or "failed".
    void apiKeyFinished(const QString &target, const QString &result);

private:
    void request(const QString &procedure, const QJsonObject &input, bool mutation, Reply reply);
    void loadInstances();
    void loadProfiles();
    void loadApiKeyStatus();
    void pollHealth();
    void probe(const QString &id);
    void startWorker(const QString &profileName, std::function<void(const QString &error)> done);
    // Runs a lifecycle mutation, shows its failure in the banner and reloads the instances.
    void lifecycle(const QString &procedure, const QJsonObject &input, std::function<void()> done = {});
    void fail(const QString &error);
    bool hasAttached() const;

    Transport transport_;
    std::function<qint64()> clock_;
    QNetworkAccessManager *network_ = nullptr;
    QUrl base_;
    QString token_;
    // Replies from an earlier server are dropped.
    int epoch_ = 0;
    bool available_ = false;
    bool active_ = false;
    QVariantList profiles_;
    QVariantList instances_;
    QVariantList presets_;
    QVariantMap apiKeyStatus_;
    QHash<QString, QJsonObject> health_;
    QSet<QString> probing_;
    QSet<QString> autoAttach_;
    bool loading_ = false;
    bool loaded_ = false;
    bool busy_ = false;
    bool provisioning_ = false;
    QString stoppingId_;
    QString startingPresetId_;
    QString error_;
    QVariantMap orphanWarning_;
    QTimer instancesTimer_;
    QTimer healthTimer_;
};

}  // namespace nodetool::node_editor
