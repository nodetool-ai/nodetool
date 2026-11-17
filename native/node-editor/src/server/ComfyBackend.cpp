#include "ComfyBackend.h"
#include <QDateTime>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QSet>
#include <QUrlQuery>
#include "nodetool/account/qt/ServerToken.h"

namespace nodetool::node_editor {
namespace {
const QString comfyPrefix = QStringLiteral("comfy.");

QString hostOf(const QString &url) {
    const QUrl parsed(url.contains(QStringLiteral("://")) ? url : QStringLiteral("http://") + url);
    if (!parsed.isValid() || parsed.host().isEmpty()) { return url; }
    return parsed.port() < 0 ? parsed.host() : QStringLiteral("%1:%2").arg(parsed.host()).arg(parsed.port());
}

QString plural(qsizetype count, const QString &one, const QString &many) {
    return QStringLiteral("%1 %2").arg(count).arg(count == 1 ? one : many);
}

QString errorMessage(const QJsonObject &body, const QString &fallback) {
    const auto message = body["error"].toObject()["message"].toString();
    if (!message.isEmpty()) { return message; }
    const auto detail = body["detail"];
    return detail.isString() && !detail.toString().isEmpty() ? detail.toString() : fallback;
}

QStringList stringList(const QJsonValue &value) {
    QStringList list;
    for (const auto &entry : value.toArray()) { list.append(entry.toString()); }
    return list;
}
QString dollars(double value) { return QStringLiteral("$") + QString::number(value, 'f', 2); }

// "NVIDIA GeForce RTX 5090" reads as "RTX 5090".
QString gpuName(QString name) {
    name.remove(QStringLiteral("NVIDIA "));
    name.remove(QStringLiteral("GeForce "));
    return name.trimmed();
}

bool billing(const QString &status) {
    return status != QLatin1String("terminated") && status != QLatin1String("error");
}
}  // namespace

QString comfyEndpointFromWsUrl(const QString &wsUrl) {
    static const QRegularExpression scheme(QStringLiteral("^ws(s?):"));
    auto endpoint = wsUrl;
    return endpoint.replace(scheme, QStringLiteral("http\\1:"));
}

QString comfyPresetPrice(const QJsonObject &preset) {
    const auto hourly = preset["hourlyUsd"].toObject();
    const auto min = hourly["min"].toDouble(), max = hourly["max"].toDouble();
    if (max <= 0) { return {}; }
    return (qFuzzyCompare(min, max) || min <= 0 ? dollars(max) : dollars(min) + QStringLiteral("–") + dollars(max)) + QStringLiteral("/hr");
}

QString comfyRentConfirmText(const QJsonObject &preset) {
    QStringList gpus;
    for (const auto &gpu : preset["gpus"].toArray()) { gpus.append(gpuName(gpu.toString())); }
    const auto label = preset["label"].toString();
    QString text = QObject::tr("Rent a ComfyUI worker with %1 on RunPod?").arg(label);
    if (!gpus.isEmpty()) { text += QStringLiteral("\n\n") + QObject::tr("GPU: %1").arg(gpus.join(QObject::tr(" or "))); }
    const auto price = comfyPresetPrice(preset);
    if (!price.isEmpty()) {
        text += QStringLiteral("\n") + QObject::tr("Price: %1, billed to your RunPod account from now until you release the worker.").arg(price);
    }
    const auto lifetime = preset["maxLifetimeMinutes"].toInt();
    if (lifetime > 0) {
        const auto span = lifetime % 60 != 0 ? QObject::tr("%1 minutes").arg(lifetime)
                          : lifetime == 60   ? QObject::tr("1 hour")
                                             : QObject::tr("%1 hours").arg(lifetime / 60);
        text += QStringLiteral("\n") + QObject::tr("It shuts down by itself after %1.").arg(span);
    }
    text += QStringLiteral("\n\n") + QObject::tr("Starting takes a few minutes. The Comfy target switches to the worker when ComfyUI is ready.");
    return text;
}

QString comfyRentLabel(const QString &presetLabel, qint64 elapsedMs) {
    const auto minutes = elapsedMs / 60000;
    const auto base = QObject::tr("Starting %1 worker…").arg(presetLabel);
    return minutes < 1 ? base : base + QStringLiteral(" ") + QObject::tr("%1 min").arg(minutes);
}

QString comfyTargetKind(const QString &target, const QString &serverUrl) {
    if (!target.isEmpty()) { return target; }
    return serverUrl.isEmpty() ? QStringLiteral("cloud") : QStringLiteral("server");
}

QString comfyTargetLabel(const QString &target, const QString &serverUrl, const QString &workerUrl) {
    const auto kind = comfyTargetKind(target, serverUrl);
    if (kind == QLatin1String("server")) {
        return serverUrl.isEmpty() ? QStringLiteral("Server: not set") : QStringLiteral("Server: ") + hostOf(serverUrl);
    }
    if (kind == QLatin1String("worker")) {
        return workerUrl.isEmpty() ? QStringLiteral("Worker: not set") : QStringLiteral("Worker: ") + hostOf(workerUrl);
    }
    return QStringLiteral("Comfy Cloud");
}

QString describeComfyServer(const QJsonObject &status) {
    const auto version = status["version"].toString();
    const auto name = version.isEmpty() ? QStringLiteral("ComfyUI") : QStringLiteral("ComfyUI ") + version;
    auto device = status["device"].toString();
    if (device.isEmpty()) { return name; }
    // "cuda:0 NVIDIA GeForce RTX 4070 : cudaMallocAsync" reads as the GPU name.
    static const QRegularExpression prefix(QStringLiteral("^[a-z]+:\\d+\\s+"), QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression suffix(QStringLiteral("\\s*:\\s*\\w+$"));
    device.remove(prefix);
    device.remove(suffix);
    return name + QStringLiteral(" on ") + device.trimmed();
}

QString describeComfyModels(const QJsonObject &status) {
    const auto models = status["models"].toObject();
    QStringList parts;
    if (models["checkpoints"].isArray()) { parts.append(plural(models["checkpoints"].toArray().size(), QStringLiteral("checkpoint"), QStringLiteral("checkpoints"))); }
    if (models["diffusion_models"].isArray()) { parts.append(plural(models["diffusion_models"].toArray().size(), QStringLiteral("diffusion model"), QStringLiteral("diffusion models"))); }
    if (models["loras"].isArray()) { parts.append(plural(models["loras"].toArray().size(), QStringLiteral("LoRA"), QStringLiteral("LoRAs"))); }
    return parts.join(QStringLiteral(", "));
}

QString pickStarterCheckpoint(const QStringList &checkpoints) {
    static const QRegularExpression xl(QStringLiteral("xl"), QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression refiner(QStringLiteral("refiner"), QRegularExpression::CaseInsensitiveOption);
    for (const auto &name : checkpoints) {
        if (name.contains(xl) && !name.contains(refiner)) { return name; }
    }
    for (const auto &name : checkpoints) {
        if (!name.contains(refiner)) { return name; }
    }
    return checkpoints.value(0);
}

QJsonObject comfyStarterPrompt(const QString &checkpoint, int seed) {
    const auto link = [](const char *node, int output) { return QJsonArray{QString::fromLatin1(node), output}; };
    int steps = 4;
    double cfg = 1;
    QString scheduler = QStringLiteral("simple");
    if (!checkpoint.isEmpty()) {
        // Steps and CFG for the checkpoint's family, judged from its file name.
        if (checkpoint.contains(QStringLiteral("schnell"), Qt::CaseInsensitive)) {
            steps = 4;
        } else if (checkpoint.contains(QStringLiteral("flux"), Qt::CaseInsensitive)) {
            steps = 20;
        } else {
            steps = 25;
            cfg = 7;
            scheduler = QStringLiteral("normal");
        }
    }
    return {
        {"4", QJsonObject{{"class_type", "CheckpointLoaderSimple"},
                          {"inputs", QJsonObject{{"ckpt_name", checkpoint.isEmpty() ? QStringLiteral("flux1-schnell-fp8.safetensors") : checkpoint}}}}},
        {"6", QJsonObject{{"class_type", "CLIPTextEncode"},
                          {"inputs", QJsonObject{{"text", "A cinematic still of a lighthouse on a cliff at dusk, volumetric fog, 35mm film"}, {"clip", link("4", 1)}}},
                          {"_meta", QJsonObject{{"title", "Prompt"}}}}},
        {"7", QJsonObject{{"class_type", "CLIPTextEncode"},
                          {"inputs", QJsonObject{{"text", ""}, {"clip", link("4", 1)}}},
                          {"_meta", QJsonObject{{"title", "Negative prompt"}}}}},
        {"5", QJsonObject{{"class_type", "EmptyLatentImage"},
                          {"inputs", QJsonObject{{"width", 1024}, {"height", 576}, {"batch_size", 1}}}}},
        {"3", QJsonObject{{"class_type", "KSampler"},
                          {"inputs", QJsonObject{{"seed", seed}, {"steps", steps}, {"cfg", cfg}, {"sampler_name", "euler"},
                                                 {"scheduler", scheduler}, {"denoise", 1}, {"model", link("4", 0)},
                                                 {"positive", link("6", 0)}, {"negative", link("7", 0)}, {"latent_image", link("5", 0)}}}}},
        {"8", QJsonObject{{"class_type", "VAEDecode"}, {"inputs", QJsonObject{{"samples", link("3", 0)}, {"vae", link("4", 2)}}}}},
        {"9", QJsonObject{{"class_type", "SaveImage"}, {"inputs", QJsonObject{{"filename_prefix", "nodetool"}, {"images", link("8", 0)}}}}}};
}

QJsonArray nextComfyRecords(const QJsonArray &previous, const QJsonArray &incoming) {
    QSet<QString> types;
    for (const auto &value : incoming) { types.insert(value.toObject()["node_type"].toString()); }
    auto next = incoming;
    for (const auto &value : previous) {
        auto record = value.toObject();
        if (types.contains(record["node_type"].toString())) { continue; }
        record["hidden"] = true;
        next.append(record);
    }
    return next;
}

QJsonArray mergeComfyCatalog(const QJsonArray &base, const QJsonArray &records) {
    if (records.isEmpty()) { return base; }
    QSet<QString> types;
    for (const auto &value : records) { types.insert(value.toObject()["node_type"].toString()); }
    QJsonArray merged;
    for (const auto &value : base) {
        if (!types.contains(value.toObject()["node_type"].toString())) { merged.append(value); }
    }
    for (const auto &value : records) { merged.append(value); }
    return merged;
}

QJsonArray comfyMenuMetadata(const QJsonArray &metadata, bool comfy) {
    QJsonArray result;
    for (const auto &value : metadata) {
        auto entry = value.toObject();
        const auto type = entry["node_type"].toString(entry["type"].toString());
        if (type.startsWith(comfyPrefix) != comfy) { entry["hidden"] = true; }
        result.append(entry);
    }
    return result;
}

bool comfyWorkflow(const QJsonObject &workflow) {
    return workflow["run_mode"].toString() == QLatin1String("comfy");
}

ComfyBackend::ComfyBackend(QObject *parent) : QObject(parent), network_(this) {
    rentTimer_.setInterval(4000);
    connect(&rentTimer_, &QTimer::timeout, this, &ComfyBackend::pollRent);
}

ComfyBackend::~ComfyBackend() {
    // Replies are children of network_. Cancel them so none finishes into a half-destroyed object.
    for (auto *reply : network_.findChildren<QNetworkReply *>()) {
        disconnect(reply, nullptr, this, nullptr);
        reply->abort();
    }
}

void ComfyBackend::configure(const QUrl &origin, const QString &token, const QString &user) {
    if (origin_ == origin && token_ == token && user_ == user) { return; }
    ++epoch_;
    origin_ = origin;
    token_ = token;
    user_ = user;
    target_.clear();
    serverUrl_.clear();
    workerUrl_.clear();
    workers_ = {};
    status_ = {};
    statusUrl_.clear();
    statusState_ = QStringLiteral("idle");
    statusText_.clear();
    modelsText_.clear();
    creating_ = false;
    settingsRead_ = false;
    presets_ = {};
    runpodKey_ = keyStatusRead_ = false;
    endRent();
    targetBeforeRent_ = {};
    emit changed();
    if (!origin_.isEmpty()) { refresh(); }
}

QVariantList ComfyBackend::workers() const {
    QVariantList rows;
    for (const auto &value : workers_) {
        const auto worker = value.toObject();
        const auto status = worker["status"].toString();
        if (status != QLatin1String("running") && status != QLatin1String("attached")) { continue; }
        const auto wsUrl = worker["ws_url"].toString();
        rows.append(QVariantMap{{"id", worker["id"].toString()}, {"name", worker["profile_name"].toString()},
                                {"host", hostOf(wsUrl)}, {"wsUrl", wsUrl}, {"token", worker["token"].toString()}});
    }
    return rows;
}

void ComfyBackend::send(const QUrl &url, const QByteArray &method, const QJsonObject &body, bool trpcReply, Done done) {
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    nodetool::account::qt::attachServerToken(request, origin_, token_);
    if (!user_.isEmpty()) { request.setRawHeader("X-User-Id", user_.toUtf8()); }
    const auto payload = method == "GET" ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact);
    auto *reply = network_.sendCustomRequest(request, method, payload);
    const auto epoch = epoch_;
    connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, trpcReply, done = std::move(done)] {
        reply->deleteLater();
        if (epoch != epoch_) { return; }
        const auto json = QJsonDocument::fromJson(reply->readAll());
        const auto object = json.object();
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        if (reply->error() != QNetworkReply::NoError || object.contains("error") || (!trpcReply && object.contains("detail"))) {
            const auto fallback = status > 0 ? tr("The server answered HTTP %1").arg(status) : reply->errorString();
            done({}, errorMessage(object, fallback));
            return;
        }
        if (!trpcReply) {
            done(json.isArray() ? QJsonValue(json.array()) : QJsonValue(object), {});
            return;
        }
        // A QJsonValue copy: operator[] on the temporary object returns a reference into it.
        QJsonValue data = object.value("result").toObject().value("data");
        if (data.isObject() && data.toObject().contains("json")) { data = data.toObject()["json"]; }
        done(data, {});
    });
}

void ComfyBackend::rest(const QByteArray &method, const QString &path, const QJsonObject &body, Done done) {
    if (origin_.isEmpty()) {
        done({}, tr("Connect to a server first."));
        return;
    }
    auto url = origin_;
    url.setPath(path);
    send(url, method, body, false, std::move(done));
}

void ComfyBackend::trpc(const QString &route, const QJsonObject &body, bool mutation, Done done) {
    if (origin_.isEmpty()) {
        done({}, tr("Connect to a server first."));
        return;
    }
    auto url = origin_;
    url.setPath(QStringLiteral("/trpc/") + route);
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem("input", QString::fromUtf8(QJsonDocument(body).toJson(QJsonDocument::Compact)));
        url.setQuery(query);
    }
    send(url, mutation ? "POST" : "GET", body, true, std::move(done));
}

void ComfyBackend::readSettings(std::function<void()> then) {
    trpc(QStringLiteral("settings.list"), {}, false, [this, then = std::move(then)](const QJsonValue &data, const QString &error) {
        if (!error.isEmpty()) {
            emit errorOccurred(tr("Comfy settings could not load: %1").arg(error));
            return;
        }
        QString target, server, worker;
        for (const auto &value : data.toObject()["settings"].toArray()) {
            const auto setting = value.toObject();
            const auto key = setting["env_var"].toString();
            const auto text = setting["value"].isNull() ? QString{} : setting["value"].toVariant().toString().trimmed();
            if (key == QLatin1String("COMFY_TARGET")) { target = text; }
            if (key == QLatin1String("COMFY_SERVER_URL")) { server = text; }
            if (key == QLatin1String("COMFY_WORKER_URL")) { worker = text; }
        }
        // The first read for an account counts as a move, so a Comfy tab loads its catalog.
        const bool targetMoved = !settingsRead_ || comfyTargetKind(target, server) != kind() || server != serverUrl_ || worker != workerUrl_;
        target_ = target;
        serverUrl_ = server;
        workerUrl_ = worker;
        settingsRead_ = true;
        emit changed();
        if (targetMoved) { emit targetChanged(); }
        // useComfyServerStatus checks again whenever the saved address changes.
        if (serverUrl_ != statusUrl_) { checkStatus(); }
        if (then) { then(); }
    });
}

void ComfyBackend::refresh() {
    readSettings();
    loadWorkers();
    // A server without a worker manager offers no presets.
    trpc(QStringLiteral("worker.comfyPresets"), {}, false, [this](const QJsonValue &data, const QString &error) {
        presets_ = error.isEmpty() ? data.toArray() : QJsonArray{};
        emit changed();
    });
    trpc(QStringLiteral("worker.apiKeyStatus"), {}, false, [this](const QJsonValue &data, const QString &error) {
        keyStatusRead_ = error.isEmpty();
        runpodKey_ = data.toObject()["runpod"].toBool();
        emit changed();
    });
}

void ComfyBackend::loadWorkers() {
    trpc(QStringLiteral("worker.instances.list"), {}, false, [this](const QJsonValue &data, const QString &error) {
        // A server without a worker manager lists none.
        workers_ = error.isEmpty() ? data.toArray() : QJsonArray{};
        emit changed();
    });
}

QJsonObject ComfyBackend::preset(const QString &id) const {
    for (const auto &value : presets_) {
        if (value.toObject()["id"].toString() == id) { return value.toObject(); }
    }
    return {};
}

QVariantList ComfyBackend::rentPresets() const {
    QVariantList rows;
    for (const auto &value : presets_) {
        const auto preset = value.toObject();
        rows.append(QVariantMap{{"id", preset["id"].toString()}, {"label", preset["label"].toString()},
                                {"price", comfyPresetPrice(preset)}, {"confirm", comfyRentConfirmText(preset)}});
    }
    return rows;
}

QString ComfyBackend::rentLabel() const {
    if (!renting()) { return {}; }
    return comfyRentLabel(preset(rentPreset_)["label"].toString(rentPreset_), QDateTime::currentMSecsSinceEpoch() - rentStarted_);
}

QVariantList ComfyBackend::rentedWorkers() const {
    QSet<QString> profiles;
    for (const auto &value : presets_) { profiles.insert(value.toObject()["profileName"].toString()); }
    QVariantList rows;
    for (auto i = workers_.size() - 1; i >= 0; --i) {
        const auto worker = workers_[i].toObject();
        const auto status = worker["status"].toString();
        // The rent in progress has its own Cancel row.
        if (!profiles.contains(worker["profile_name"].toString()) || !billing(status) || worker["id"].toString() == rentInstance_) { continue; }
        const auto cost = worker["estimated_cost_usd"];
        const auto endpoint = comfyEndpointFromWsUrl(worker["ws_url"].toString());
        rows.append(QVariantMap{{"id", worker["id"].toString()}, {"name", worker["profile_name"].toString()}, {"status", status},
                                {"cost", cost.isDouble() ? dollars(cost.toDouble()) : QString{}},
                                {"current", QVariant(kind() == QLatin1String("server") && !endpoint.isEmpty() && serverUrl_ == endpoint)}});
    }
    return rows;
}

void ComfyBackend::setRentTiming(int pollMs, qint64 timeoutMs) {
    rentTimer_.setInterval(pollMs);
    rentTimeoutMs_ = timeoutMs;
}

void ComfyBackend::rentWorker(const QString &presetId) {
    if (renting() || preset(presetId).isEmpty()) { return; }
    rentPreset_ = presetId;
    rentInstance_.clear();
    rentCancelled_ = false;
    rentStarted_ = QDateTime::currentMSecsSinceEpoch();
    // The target to return to when this worker is released. A rent that
    // follows another rented worker keeps the first one's.
    if (rentedWorkers().isEmpty() || targetBeforeRent_.isEmpty()) {
        targetBeforeRent_ = {{"COMFY_TARGET", kind()}};
        if (!serverUrl_.isEmpty()) { targetBeforeRent_.insert("COMFY_SERVER_URL", serverUrl_); }
    }
    emit changed();
    const auto label = preset(presetId)["label"].toString();
    trpc(QStringLiteral("worker.startComfyPreset"), {{"presetId", presetId}}, true, [this, label](const QJsonValue &data, const QString &error) {
        if (!error.isEmpty()) {
            endRent();
            emit errorOccurred(tr("The %1 worker could not start: %2").arg(label, error));
            return;
        }
        const auto id = data.toObject()["id"].toString();
        if (rentCancelled_) {
            endRent();
            releaseWorker(id);
            return;
        }
        rentInstance_ = id;
        loadWorkers();
        rentTimer_.start();
    });
}

void ComfyBackend::pollRent() {
    if (!renting() || rentInstance_.isEmpty()) { return; }
    const auto label = preset(rentPreset_)["label"].toString(rentPreset_);
    if (QDateTime::currentMSecsSinceEpoch() - rentStarted_ > rentTimeoutMs_) {
        endRent();
        emit errorOccurred(tr("The %1 worker did not start ComfyUI in time. It still bills until you release it from the Comfy target menu.").arg(label));
        return;
    }
    // The label counts the minutes, and the instance list shows a failed boot.
    emit changed();
    loadWorkers();
    for (const auto &value : workers_) {
        const auto worker = value.toObject();
        if (worker["id"].toString() == rentInstance_ && !billing(worker["status"].toString())) {
            endRent();
            emit errorOccurred(tr("The %1 worker stopped while it was starting (%2).").arg(label, worker["status"].toString()));
            return;
        }
    }
    if (rentProbing_) { return; }
    rentProbing_ = true;
    const auto id = rentInstance_;
    trpc(QStringLiteral("worker.health"), {{"id", id}}, false, [this, id, label](const QJsonValue &data, const QString &) {
        rentProbing_ = false;
        if (!renting() || rentInstance_ != id) { return; }
        const auto health = data.toObject();
        const auto endpoint = health["comfyEndpoint"].toString();
        if (!health["healthy"].toBool() || endpoint.isEmpty()) { return; }
        endRent();
        apply({{"COMFY_TARGET", "server"}, {"COMFY_SERVER_URL", endpoint}});
        emit noticeOccurred(tr("The %1 worker is ready. Comfy workflows now run on it.").arg(label));
    });
}

void ComfyBackend::endRent() {
    rentTimer_.stop();
    rentPreset_.clear();
    rentInstance_.clear();
    rentProbing_ = false;
    emit changed();
}

void ComfyBackend::cancelRent() {
    if (!renting()) { return; }
    if (rentInstance_.isEmpty()) {
        // startComfyPreset has not answered yet: release the worker when it does.
        rentCancelled_ = true;
        return;
    }
    const auto id = rentInstance_;
    endRent();
    releaseWorker(id);
}

void ComfyBackend::releaseWorker(const QString &id) {
    QString name, endpoint;
    for (const auto &value : workers_) {
        const auto worker = value.toObject();
        if (worker["id"].toString() == id) {
            name = worker["profile_name"].toString();
            endpoint = comfyEndpointFromWsUrl(worker["ws_url"].toString());
        }
    }
    if (rentInstance_ == id) { endRent(); }
    trpc(QStringLiteral("worker.terminate"), {{"id", id}}, true, [this, name, endpoint](const QJsonValue &, const QString &error) {
        loadWorkers();
        const auto shown = name.isEmpty() ? tr("ComfyUI") : name;
        if (!error.isEmpty()) {
            emit errorOccurred(tr("%1 could not be released, so it may still bill: %2").arg(shown, error));
            return;
        }
        // A target on the released worker would fail every run, so it goes back.
        if (!endpoint.isEmpty() && kind() == QLatin1String("server") && serverUrl_ == endpoint) {
            const auto previous = targetBeforeRent_;
            const bool backToSame = previous["COMFY_SERVER_URL"].toString() == endpoint;
            apply(previous.isEmpty() || backToSame ? QJsonObject{{"COMFY_TARGET", "cloud"}} : previous);
        }
        targetBeforeRent_ = {};
        emit noticeOccurred(tr("%1 was released. Its billing has ended.").arg(shown));
    });
}

void ComfyBackend::checkStatus() {
    statusUrl_ = serverUrl_;
    const auto epoch = ++statusEpoch_;
    status_ = {};
    modelsText_.clear();
    if (serverUrl_.isEmpty()) {
        statusState_ = QStringLiteral("idle");
        statusText_.clear();
        emit changed();
        return;
    }
    statusState_ = QStringLiteral("checking");
    statusText_ = tr("Checking ComfyUI at %1…").arg(serverUrl_);
    emit changed();
    rest("GET", QStringLiteral("/api/comfy/server-status"), {}, [this, epoch](const QJsonValue &data, const QString &error) {
        if (epoch != statusEpoch_) { return; }
        if (!error.isEmpty()) {
            statusState_ = QStringLiteral("error");
            statusText_ = error;
        } else {
            status_ = data.toObject();
            statusState_ = QStringLiteral("connected");
            statusText_ = tr("Connected to %1").arg(describeComfyServer(status_));
            modelsText_ = describeComfyModels(status_);
        }
        emit changed();
    });
}

void ComfyBackend::apply(const QJsonObject &settings, const QJsonObject &secrets) {
    trpc(QStringLiteral("settings.update"), {{"settings", settings}, {"secrets", secrets}}, true,
         [this](const QJsonValue &, const QString &error) {
             if (!error.isEmpty()) {
                 emit errorOccurred(tr("The Comfy target could not change: %1").arg(error));
                 return;
             }
             readSettings();
         });
}

void ComfyBackend::selectCloud() { apply({{"COMFY_TARGET", "cloud"}}); }

void ComfyBackend::selectServer(const QString &url) {
    const auto trimmed = url.trimmed();
    if (trimmed.isEmpty()) { return; }
    apply({{"COMFY_TARGET", "server"}, {"COMFY_SERVER_URL", trimmed}});
}

void ComfyBackend::selectWorker(const QString &id) {
    QVariantMap worker;
    for (const auto &row : workers()) {
        if (row.toMap()["id"].toString() == id) { worker = row.toMap(); }
    }
    if (worker.isEmpty()) { return; }
    trpc(QStringLiteral("worker.health"), {{"id", id}}, false, [this, worker](const QJsonValue &data, const QString &) {
        const auto health = data.toObject();
        const auto endpoint = health["comfyEndpoint"].toString();
        if (!endpoint.isEmpty()) {
            if (!health["healthy"].toBool()) {
                emit errorOccurred(tr("%1 is running, but ComfyUI is not ready yet. The target did not change. Try again when ComfyUI has started.")
                                       .arg(worker["name"].toString()));
                return;
            }
            apply({{"COMFY_TARGET", "server"}, {"COMFY_SERVER_URL", endpoint}});
            return;
        }
        apply({{"COMFY_TARGET", "worker"}, {"COMFY_WORKER_URL", worker["wsUrl"].toString()}},
              {{"COMFY_WORKER_TOKEN", worker["token"].toString()}});
    });
}

void ComfyBackend::loadCatalog(std::function<void(QJsonArray, QString)> done) {
    rest("GET", QStringLiteral("/api/comfy/nodes"), {}, [done = std::move(done)](const QJsonValue &data, const QString &error) {
        if (error.isEmpty() && !data.isArray()) {
            done({}, QStringLiteral("Invalid Comfy node catalog"));
            return;
        }
        done(data.toArray(), error);
    });
}

void ComfyBackend::starterGraph(std::function<void(QJsonObject, QString)> done) {
    // starterCheckpointForTarget: only the user's own server has a checkpoint list.
    const auto checkpoint = kind() == QLatin1String("server") && statusState_ == QLatin1String("connected")
                                ? pickStarterCheckpoint(stringList(status_["models"].toObject()["checkpoints"]))
                                : QString{};
    // A fresh seed per graph, so a first run is never a cached result.
    const auto prompt = comfyStarterPrompt(checkpoint, static_cast<int>(QRandomGenerator::global()->bounded(1u << 31)));
    rest("POST", QStringLiteral("/api/comfy/import-graph"), {{"workflow", prompt}}, [done = std::move(done)](const QJsonValue &graph, const QString &error) {
        if (!error.isEmpty() || !graph.toObject()["nodes"].isArray()) {
            done({}, error.isEmpty() ? QStringLiteral("Invalid graph") : error);
            return;
        }
        done(graph.toObject(), {});
    });
}

void ComfyBackend::createWorkflow(const QString &projectId) {
    if (creating_) { return; }
    creating_ = true;
    const auto fail = [this](const QString &error) {
        creating_ = false;
        emit errorOccurred(tr("Could not create Comfy workflow: %1").arg(error));
    };
    starterGraph([this, projectId, fail](const QJsonObject &graph, const QString &error) {
        if (!error.isEmpty()) {
            fail(error);
            return;
        }
        QJsonObject body{{"name", "New Comfy Workflow"}, {"access", "private"}, {"run_mode", "comfy"}, {"graph", graph}};
        if (!projectId.isEmpty()) { body.insert("project_id", projectId); }
        rest("POST", QStringLiteral("/api/workflows"), body, [this, fail](const QJsonValue &workflow, const QString &error) {
            const auto id = workflow.toObject()["id"].toString();
            if (!error.isEmpty() || id.isEmpty()) {
                fail(error.isEmpty() ? QStringLiteral("Server returned an invalid workflow") : error);
                return;
            }
            creating_ = false;
            emit workflowCreated(id);
        });
    });
}
}  // namespace nodetool::node_editor
