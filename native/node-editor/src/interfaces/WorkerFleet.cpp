#include "WorkerFleet.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLocale>
#include <QNetworkReply>
#include <QUrlQuery>
#include <optional>
#include <utility>
#include "nodetool/account/qt/ServerToken.h"

namespace nodetool::node_editor {
namespace {

// Statuses the panel shows. `stopped` is a paused, resumable pod. `terminated` stays hidden.
const QSet<QString> &shownStatuses() {
    static const QSet<QString> statuses{"provisioning", "running", "attached", "stopping", "stopped"};
    return statuses;
}
// Statuses that bill for the GPU. A paused pod bills only a little storage.
const QSet<QString> &billingStatuses() {
    static const QSet<QString> statuses{"provisioning", "running", "attached", "stopping"};
    return statuses;
}

QString money(double value) {
    return QLocale(QLocale::English, QLocale::UnitedStates).toCurrencyString(value, QStringLiteral("$"), 2);
}

QString plural(qint64 value, const QString &unit) {
    return QStringLiteral("%1 %2%3").arg(value).arg(unit, value == 1 ? QString() : QStringLiteral("s"));
}

QString uptime(const QString &createdAt, qint64 now) {
    const auto started = QDateTime::fromString(createdAt, Qt::ISODateWithMs);
    if (!started.isValid()) { return QStringLiteral("—"); }
    const auto seconds = std::max<qint64>(0, (now - started.toMSecsSinceEpoch()) / 1000);
    if (seconds < 60) { return plural(seconds, QStringLiteral("second")); }
    if (seconds < 3600) { return plural(seconds / 60, QStringLiteral("minute")); }
    if (seconds < 86400) { return plural(seconds / 3600, QStringLiteral("hour")); }
    return plural(seconds / 86400, QStringLiteral("day"));
}

QVariantList toList(const QJsonValue &value) {
    return value.isArray() ? value.toArray().toVariantList() : QVariantList{};
}

std::optional<int> positive(const QVariant &value) {
    bool ok = false;
    const auto number = value.toString().trimmed().toDouble(&ok);
    if (!ok || number <= 0) { return std::nullopt; }
    return static_cast<int>(number);
}

}  // namespace

WorkerFleet::WorkerFleet(QObject *parent)
    : QObject(parent), clock_([] { return QDateTime::currentMSecsSinceEpoch(); }) {
    instancesTimer_.setInterval(10000);
    connect(&instancesTimer_, &QTimer::timeout, this, &WorkerFleet::loadInstances);
    healthTimer_.setInterval(4000);
    connect(&healthTimer_, &QTimer::timeout, this, &WorkerFleet::pollHealth);
}

WorkerFleet::~WorkerFleet() = default;

void WorkerFleet::setServer(const QUrl &base, const QString &token) {
    if (base == base_ && token == token_) { return; }
    base_ = base;
    token_ = token;
    ++epoch_;
    available_ = base.isValid() && !base.isEmpty();
    profiles_.clear();
    instances_.clear();
    presets_.clear();
    apiKeyStatus_.clear();
    health_.clear();
    probing_.clear();
    autoAttach_.clear();
    loaded_ = false;
    loading_ = busy_ = provisioning_ = false;
    stoppingId_.clear();
    startingPresetId_.clear();
    error_.clear();
    orphanWarning_.clear();
    emit changed();
    if (active_) { refresh(); }
}

void WorkerFleet::setTransport(Transport transport) {
    transport_ = std::move(transport);
    available_ = true;
    emit changed();
}

void WorkerFleet::setClock(std::function<qint64()> clock) { clock_ = std::move(clock); }

void WorkerFleet::request(const QString &procedure, const QJsonObject &input, bool mutation, Reply reply) {
    const auto epoch = epoch_;
    auto guarded = [this, epoch, reply = std::move(reply)](const QJsonValue &data, const QString &error) {
        if (epoch == epoch_) { reply(data, error); }
    };
    if (transport_) {
        transport_(procedure, input, mutation, std::move(guarded));
        return;
    }
    if (!available_) { return; }
    // Parented to this fleet, which deletes it.
    if (!network_) { network_ = new QNetworkAccessManager(this); }
    auto url = base_.resolved(QUrl("/trpc/" + procedure));
    const auto body = QJsonDocument(input).toJson(QJsonDocument::Compact);
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem("input", QString::fromUtf8(body));
        url.setQuery(query);
    }
    QNetworkRequest httpRequest(url);
    httpRequest.setTransferTimeout(60000);
    httpRequest.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    nodetool::account::qt::attachServerToken(httpRequest, base_, token_);
    httpRequest.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    auto *httpReply = mutation ? network_->post(httpRequest, body) : network_->get(httpRequest);
    connect(httpReply, &QNetworkReply::finished, this, [httpReply, guarded = std::move(guarded)] {
        httpReply->deleteLater();
        const auto bytes = httpReply->readAll();
        const auto envelope = QJsonDocument::fromJson(bytes).object();
        auto data = envelope["result"].toObject()["data"];
        if (data.isObject() && data.toObject().contains("json")) { data = data.toObject()["json"]; }
        if (httpReply->error() != QNetworkReply::NoError || envelope.contains("error") || !envelope.contains("result")) {
            const auto error = envelope["error"].toObject();
            auto message = error["message"].toString();
            if (message.isEmpty()) { message = error["json"].toObject()["message"].toString(httpReply->errorString()); }
            guarded({}, message);
            return;
        }
        guarded(data, {});
    });
}

void WorkerFleet::setActive(bool active) {
    if (active_ == active) { return; }
    active_ = active;
    if (active) {
        instancesTimer_.start();
        healthTimer_.start();
        refresh();
    } else {
        instancesTimer_.stop();
        healthTimer_.stop();
    }
}

void WorkerFleet::refresh() {
    if (!available_) { return; }
    loadInstances();
    loadProfiles();
    loadApiKeyStatus();
    if (presets_.isEmpty()) {
        request("worker.comfyPresets", {}, false, [this](const QJsonValue &data, const QString &error) {
            if (!error.isEmpty()) { return; }
            presets_ = toList(data);
            emit changed();
        });
    }
}

void WorkerFleet::loadInstances() {
    if (!available_) { return; }
    if (!loaded_ && !loading_) {
        loading_ = true;
        emit changed();
    }
    request("worker.instances.list", {}, false, [this](const QJsonValue &data, const QString &error) {
        loading_ = false;
        if (error.isEmpty()) {
            loaded_ = true;
            instances_ = toList(data);
            QSet<QString> running;
            for (const auto &value : std::as_const(instances_)) {
                const auto instance = value.toMap();
                if (instance["status"] == "running") { running.insert(instance["id"].toString()); }
            }
            // A worker that left `running` needs no probe and no health.
            for (auto it = health_.begin(); it != health_.end();) {
                it = running.contains(it.key()) ? std::next(it) : health_.erase(it);
            }
        }
        emit changed();
        pollHealth();
    });
}

void WorkerFleet::loadProfiles() {
    request("worker.profiles.list", {}, false, [this](const QJsonValue &data, const QString &error) {
        if (!error.isEmpty()) { return; }
        profiles_ = toList(data);
        emit changed();
    });
}

void WorkerFleet::loadApiKeyStatus() {
    request("worker.apiKeyStatus", {}, false, [this](const QJsonValue &data, const QString &error) {
        if (!error.isEmpty()) { return; }
        apiKeyStatus_ = data.toObject().toVariantMap();
        emit changed();
    });
}

void WorkerFleet::pollHealth() {
    // `running` means only that the pod's port is mapped. The probe says when the worker serves.
    for (const auto &value : std::as_const(instances_)) {
        const auto instance = value.toMap();
        if (instance["status"] == "running") { probe(instance["id"].toString()); }
    }
}

void WorkerFleet::probe(const QString &id) {
    // A ready worker needs no more probes, except to attach one started here.
    if (probing_.contains(id) || health_.value(id)["healthy"].toBool()) { return; }
    probing_.insert(id);
    request("worker.health", {{"id", id}}, true, [this, id](const QJsonValue &data, const QString &error) {
        probing_.remove(id);
        health_.insert(id, error.isEmpty() ? data.toObject() : QJsonObject{{"healthy", false}});
        emit changed();
        const auto health = health_.value(id);
        // A worker started here attaches the moment it answers. A ComfyUI pod has nothing to attach.
        if (autoAttach_.contains(id) && health["healthy"].toBool() && !busy_ && health["comfyEndpoint"].toString().isEmpty()) {
            autoAttach_.remove(id);
            // Never take over a worker the user attached in the meantime.
            if (!hasAttached()) { attach(id); }
        }
    });
}

bool WorkerFleet::hasAttached() const {
    for (const auto &value : instances_) {
        if (value.toMap()["status"] == "attached") { return true; }
    }
    return false;
}

QVariantList WorkerFleet::instances() const {
    QVariantList shown;
    const auto now = clock_();
    for (const auto &value : instances_) {
        auto instance = value.toMap();
        const auto status = instance["status"].toString();
        if (!shownStatuses().contains(status)) { continue; }
        const auto id = instance["id"].toString();
        const auto health = health_.value(id);
        const bool running = status == "running";
        const bool healthy = health["healthy"].toBool();
        const bool booting = running && !healthy;
        const auto comfy = health["comfyEndpoint"].toString();
        const bool autoAttach = autoAttach_.contains(id);
        QString displayStatus = running ? (healthy ? "ready" : "booting") : status;
        static const QHash<QString, QString> labels{
            {"provisioning", "Provisioning"}, {"running", "Running"}, {"attached", "Attached"}, {"stopping", "Stopping"},
            {"stopped", "Paused"}, {"error", "Error"}, {"ready", "Ready"}, {"booting", "Booting"}};
        // The tone of the web StatusIndicator: running (pulsing), success, error or default.
        QString tone = running ? (healthy ? "success" : "running")
                       : status == "provisioning" || status == "stopping" ? "running"
                       : status == "attached" ? "success"
                       : status == "error" ? "error"
                                           : "default";
        QString hint;
        if (status == "provisioning") {
            hint = "Renting the GPU. This can take a few minutes.";
        } else if (!comfy.isEmpty() && running) {
            hint = healthy ? "Copy the URL into Run ComfyUI Workflow. Anyone with this URL can use the pod."
                           : "ComfyUI is loading. The first start can take several minutes.";
        } else if (booting) {
            hint = autoAttach ? "GPU is up. The worker is loading and attaches when it is ready."
                              : "GPU is up — worker is still loading";
        } else if (running && healthy) {
            hint = autoAttach ? "Worker is ready. Attaching…" : "Worker is responding — safe to attach";
        }
        const auto cost = instance["estimated_cost_usd"];
        instance["displayStatus"] = displayStatus;
        instance["statusLabel"] = labels.value(displayStatus, displayStatus);
        instance["tone"] = tone;
        instance["pulse"] = status == "provisioning" || status == "stopping" || booting;
        instance["hint"] = hint;
        instance["healthy"] = healthy;
        instance["booting"] = booting;
        instance["comfyEndpoint"] = comfy;
        instance["uptime"] = uptime(instance["created_at"].toString(), now);
        instance["cost"] = cost.isNull() || !cost.isValid() ? QStringLiteral("—") : money(cost.toDouble());
        shown.append(instance);
    }
    return shown;
}

QString WorkerFleet::rateText() const {
    double total = 0;
    bool any = false;
    for (const auto &value : instances_) {
        const auto instance = value.toMap();
        const auto status = instance["status"].toString();
        if (!shownStatuses().contains(status)) { continue; }
        any = true;
        if (billingStatuses().contains(status)) { total += instance["estimated_cost_usd"].toDouble(); }
    }
    return any ? money(total) + "/hr" : QString();
}

void WorkerFleet::fail(const QString &error) {
    error_ = error;
    emit changed();
}

void WorkerFleet::clearError() {
    if (error_.isEmpty()) { return; }
    error_.clear();
    emit changed();
}

void WorkerFleet::dismissOrphanWarning() {
    orphanWarning_.clear();
    emit changed();
}

void WorkerFleet::lifecycle(const QString &procedure, const QJsonObject &input, std::function<void()> done) {
    request(procedure, input, true, [this, done = std::move(done)](const QJsonValue &, const QString &error) {
        if (error.isEmpty()) {
            error_.clear();
        } else {
            error_ = "Worker action failed: " + error;
        }
        if (done) { done(); }
        emit changed();
        loadInstances();
    });
}

void WorkerFleet::startWorker(const QString &profileName, std::function<void(const QString &)> done) {
    request("worker.provision", {{"profileName", profileName}}, true,
            [this, done = std::move(done)](const QJsonValue &data, const QString &error) {
                if (error.isEmpty()) {
                    autoAttach_.insert(data.toObject()["id"].toString());
                    loadInstances();
                }
                done(error);
            });
}

void WorkerFleet::provision(const QString &profileName) {
    if (provisioning_ || profileName.isEmpty()) { return; }
    provisioning_ = true;
    emit changed();
    startWorker(profileName, [this](const QString &error) {
        provisioning_ = false;
        error_ = error.isEmpty() ? QString() : "Worker action failed: " + error;
        emit changed();
        emit provisionFinished(error.isEmpty());
    });
}

void WorkerFleet::startPreset(const QString &presetId) {
    if (!startingPresetId_.isEmpty()) { return; }
    startingPresetId_ = presetId;
    emit changed();
    lifecycle("worker.startComfyPreset", {{"presetId", presetId}}, [this] {
        startingPresetId_.clear();
        loadProfiles();
    });
}

void WorkerFleet::stop(const QString &id) {
    stoppingId_ = id;
    emit changed();
    lifecycle("worker.stop", {{"id", id}}, [this] { stoppingId_.clear(); });
}

void WorkerFleet::resume(const QString &id) {
    stoppingId_ = id;
    emit changed();
    lifecycle("worker.resume", {{"id", id}}, [this] { stoppingId_.clear(); });
}

void WorkerFleet::terminate(const QString &id) {
    stoppingId_ = id;
    emit changed();
    lifecycle("worker.terminate", {{"id", id}}, [this] { stoppingId_.clear(); });
}

void WorkerFleet::stopAll() { lifecycle("worker.stopAll", {}); }

void WorkerFleet::attach(const QString &id) {
    busy_ = true;
    emit changed();
    lifecycle("worker.attach", {{"id", id}}, [this] { busy_ = false; });
}

void WorkerFleet::detach() {
    busy_ = true;
    emit changed();
    lifecycle("worker.detach", {}, [this] { busy_ = false; });
}

void WorkerFleet::reconcile() {
    busy_ = true;
    emit changed();
    request("worker.reconcile", {}, true, [this](const QJsonValue &data, const QString &error) {
        busy_ = false;
        if (!error.isEmpty()) {
            error_ = "Could not reconcile workers: " + error;
        } else {
            error_.clear();
            const auto summary = data.toObject();
            const auto count = summary["orphans"].toArray().size();
            orphanWarning_.clear();
            if (count > 0) {
                orphanWarning_["title"] = count == 1
                    ? QStringLiteral("1 orphaned worker may still be billing — stop it in your provider console")
                    : QStringLiteral("%1 orphaned workers may still be billing — stop them in your provider console").arg(count);
                orphanWarning_["details"] = QStringLiteral("%1 live, ~%2/hr")
                                                .arg(summary["liveCount"].toInt())
                                                .arg(money(summary["estimatedCostUsd"].toDouble()));
            }
        }
        emit changed();
        loadInstances();
    });
}

void WorkerFleet::createProfile(const QVariantMap &form, bool start) {
    const auto target = form["target"].toString();
    QJsonObject input{{"name", form["name"].toString().trimmed()},
                      {"target", target},
                      {"image", form["image"].toString().trimmed()},
                      {"token_policy", form.value("token_policy", "generate").toString()}};
    QJsonObject spec;
    const auto gpu = form["gpu"].toString().trimmed();
    if (!gpu.isEmpty()) { spec["gpu"] = gpu; }
    // A RunPod pod with no GPU id is a CPU pod and carries a vCPU count.
    if (target == "runpod" && gpu.isEmpty()) {
        if (const auto vcpu = positive(form["vcpu"])) { spec["vcpu"] = *vcpu; }
    }
    if (const auto disk = positive(form["disk"])) { spec["disk"] = *disk; }
    if (!spec.isEmpty()) { input["spec"] = spec; }
    if (const auto idle = positive(form["idle_timeout_minutes"])) { input["idle_timeout_minutes"] = *idle; }
    if (const auto lifetime = positive(form["max_lifetime_minutes"])) { input["max_lifetime_minutes"] = *lifetime; }
    const auto name = input["name"].toString();
    request("worker.profiles.create", input, true, [this, name, start](const QJsonValue &, const QString &error) {
        if (!error.isEmpty()) {
            emit profileFinished("Could not create profile: " + error, false);
            return;
        }
        loadProfiles();
        if (!start) {
            emit profileFinished({}, false);
            return;
        }
        startWorker(name, [this](const QString &startError) {
            emit profileFinished(startError.isEmpty() ? QString() : "The profile was saved, but the worker did not start: " + startError,
                                 startError.isEmpty());
        });
    });
}

void WorkerFleet::deleteProfile(const QString &name) {
    request("worker.profiles.delete", {{"name", name}}, true, [this](const QJsonValue &, const QString &error) {
        if (!error.isEmpty()) {
            emit profileFinished("Could not delete profile: " + error, false);
            return;
        }
        loadProfiles();
    });
}

void WorkerFleet::saveApiKey(const QString &target, const QString &key, bool force) {
    static const QHash<QString, QString> secretKeys{{"runpod", "RUNPOD_API_KEY"}, {"vast", "VAST_API_KEY"}};
    const auto secret = secretKeys.value(target);
    const auto value = key.trimmed();
    if (secret.isEmpty() || value.isEmpty()) { return; }
    auto store = [this, target, secret, value] {
        request("settings.secrets.upsert", {{"key", secret}, {"value", value}}, true,
                [this, target](const QJsonValue &, const QString &error) {
                    emit apiKeyFinished(target, error.isEmpty() ? "saved" : "failed");
                    if (error.isEmpty()) { loadApiKeyStatus(); }
                });
    };
    if (force) {
        store();
        return;
    }
    request("settings.secrets.validate", {{"key", secret}, {"value", value}}, true,
            [this, target, store](const QJsonValue &data, const QString &error) {
                if (!error.isEmpty()) {
                    emit apiKeyFinished(target, "failed");
                } else if (data.toObject()["status"] == "invalid") {
                    emit apiKeyFinished(target, "rejected");
                } else {
                    store();
                }
            });
}

QString WorkerFleet::suggestProfileName(const QString &base) const {
    QSet<QString> taken;
    for (const auto &value : profiles_) { taken.insert(value.toMap()["name"].toString()); }
    if (!taken.contains(base)) { return base; }
    int suffix = 2;
    while (taken.contains(QStringLiteral("%1 %2").arg(base).arg(suffix))) { ++suffix; }
    return QStringLiteral("%1 %2").arg(base).arg(suffix);
}

QString WorkerFleet::providerLabel(const QString &target) const {
    if (target == "runpod") { return QStringLiteral("RunPod"); }
    if (target == "vast") { return QStringLiteral("Vast.ai"); }
    if (target == "verda") { return QStringLiteral("Verda"); }
    return target;
}

}  // namespace nodetool::node_editor
