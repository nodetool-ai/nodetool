#include "SetupController.h"
#include <QJsonDocument>
#include <QNetworkReply>
#include <QUrlQuery>
#include <QStandardPaths>
#include <QRegularExpression>
#include <QTimer>
#include <QHostAddress>
#include <QGuiApplication>
#include <QClipboard>
#include <QSet>
#ifdef Q_OS_UNIX
#include <csignal>
#include <unistd.h>
#endif
namespace nodetool::node_editor {
void SetupController::configure(const QUrl &origin, const QString &token,
                                const QString &user) {
    stopProcess();
    listProcess_.disconnect(this);
    listProcess_.kill();
    listProcess_.waitForFinished(1000);
    runtimes_ = {};
    checkedWorkflow_.clear();
    offered_.clear();
    lastRuntimes_.clear();
    progress_.clear();
    guidance_.clear();
    guidanceIds_.clear();
    cli_ = qEnvironmentVariable("NODETOOL_CLI");
    if (cli_.isEmpty()) {
        cli_ = QStandardPaths::findExecutable("nodetool");
    }
    ++identityEpoch_;
    firstWorkflowEligible_ = false;
    ++epoch_;
    origin_ = origin;
    token_ = token;
    user_ = user;
    packs_ = {};
    templates_ = {};
    statuses_ = {};
    last_.clear();
    state_.clear();
    error_.clear();
    emit changed();
    if (!origin.isEmpty()) {
        refresh();
        request(
            "workflows.list", {{"limit", 1}}, false,
            [this](const QJsonObject &data) {
                if (data["workflows"].isArray()) {
                    firstWorkflowEligible_ =
                        data["workflows"].toArray().isEmpty();
                }
            },
            true);
    }
}
void SetupController::request(const QString &route, const QJsonObject &body,
                              bool mutation,
                              std::function<void(QJsonObject)> done,
                              bool identityOnly) {
    if (origin_.isEmpty()) {
        state_ = "failed";
        error_ = tr("Connect to a server to check dependencies.");
        emit changed();
        return;
    }
    auto url = origin_;
    url.setPath("/trpc/" + (route.contains('.') ? route : "packs." + route));
    if (!mutation) {
        QUrlQuery query;
        query.addQueryItem(
            "input", QString::fromUtf8(
                         QJsonDocument(body).toJson(QJsonDocument::Compact)));
        url.setQuery(query);
    }
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!token_.isEmpty()) {
        request.setRawHeader("Authorization", "Bearer " + token_.toUtf8());
    }
    request.setRawHeader("X-User-Id", user_.toUtf8());
    auto reply = mutation ? network_.post(request, QJsonDocument(body).toJson(
                                                       QJsonDocument::Compact))
                          : network_.get(request);
    const auto epoch = identityOnly ? identityEpoch_ : epoch_;
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, epoch, done, identityOnly] {
                reply->deleteLater();
                if (epoch != (identityOnly ? identityEpoch_ : epoch_)) {
                    return;
                }
                const auto response =
                    QJsonDocument::fromJson(reply->readAll()).object();
                if (reply->error() != QNetworkReply::NoError ||
                    response.contains("error")) {
                    if (identityOnly) {
                        return;
                    }
                    state_ = "failed";
                    error_ = tr("Could not update dependencies. Check the "
                                "server connection and retry.");
                    emit changed();
                    return;
                }
                done(response["result"].toObject()["data"].toObject());
                emit changed();
            });
}
void SetupController::refresh() {
    if (installProcess_.state() != QProcess::NotRunning) {
        return;
    }
    ++epoch_;
    last_.clear();
    state_ = "loading";
    error_.clear();
    emit changed();
    loadRuntimes();
    request("listBuiltins", {}, false, [this](const QJsonObject &data) {
        packs_ = data["packs"].toArray();
        state_ = "ready";
    });
}
void SetupController::enable(const QString &id) {
    if (state_ == "installing") {
        return;
    }
    bool allowed = false;
    for (auto value : packs_) {
        const auto pack = value.toObject();
        if (pack["id"] == id && !pack["enabled"].toBool()) {
            allowed = true;
        }
    }
    if (!allowed) {
        return;
    }
    ++epoch_;
    last_ = id;
    lastRuntimes_.clear();
    state_ = "installing";
    error_.clear();
    emit changed();
    request("setBuiltinEnabled", {{"id", id}, {"enabled", true}}, true,
            [this](const QJsonObject &data) {
                packs_ = data["packs"].toArray();
                state_ = "installed";
                emit registryRefreshRequested();
            });
}
void SetupController::cancel() {
    if (installProcess_.state() != QProcess::NotRunning) {
        cancelled_ = true;
        queue_.clear();
        signalInstall(false);
        QTimer::singleShot(1000, &installProcess_, [this] {
            if (cancelled_ && installProcess_.state() != QProcess::NotRunning) {
                signalInstall(true);
            }
        });
        state_ = "cancelled";
        error_ = tr("Installation cancelled. The package may be partially installed. Refresh its status before retrying.");
        emit changed();
        return;
    }
    ++epoch_;
    state_ = "cancelled";
    error_ = tr("Stopped waiting. A pack operation already accepted by the "
                "server may still finish. Refresh to check its status.");
    emit changed();
}
} // namespace nodetool::node_editor

void nodetool::node_editor::SetupController::browseTemplates() {
    ++epoch_;
    last_.clear();
    state_ = "loading";
    error_.clear();
    emit changed();
    request("workflows.examples", {}, false, [this](const QJsonObject &data) {
        templates_ = data["workflows"].toArray();
        state_ = "templates";
    });
}
void nodetool::node_editor::SetupController::chooseTemplate(int index) {
    if (index < 0 || index >= templates_.size()) {
        return;
    }
    const auto item = templates_[index].toObject();
    ++epoch_;
    state_ = "loading";
    emit changed();
    const auto id = item["id"].toString();
    const auto seed = id.endsWith(".json", Qt::CaseInsensitive)
                          ? id.left(id.size() - 5)
                          : item["name"].toString();
    QJsonObject body{{"name", item["name"]},
                     {"access", "private"},
                     {"graph", QJsonObject{{"nodes", QJsonArray{}},
                                           {"edges", QJsonArray{}}}},
                     {"from_example_name", seed}};
    body["from_example_package"] = item["package_name"].isString()
                                       ? item["package_name"]
                                       : QJsonValue("nodetool-base");
    request(
        "workflows.create", body, true,
        [this](const QJsonObject &workflow) { emit templateChosen(workflow); });
}

namespace nodetool::node_editor {
namespace {
QSet<QObject *> installingScopes;
bool safeRuntimeId(const QString &id) {
    static const QRegularExpression pattern("^[a-z][a-z0-9-]*$");
    return pattern.match(id).hasMatch();
}
}
SetupController::~SetupController() {
    stopProcess();
    listProcess_.disconnect(this);
    listProcess_.kill();
    listProcess_.waitForFinished(1000);
}
void SetupController::signalInstall(bool force) {
#ifdef Q_OS_UNIX
    if (processGroup_ > 0) {
        ::kill(-processGroup_, force ? SIGKILL : SIGTERM);
    }
#endif
    if (force) {
        installProcess_.kill();
    } else {
        installProcess_.terminate();
    }
}
void SetupController::stopProcess() {
    installProcess_.disconnect(this);
    if (installProcess_.state() != QProcess::NotRunning) {
        signalInstall(false);
        if (!installProcess_.waitForFinished(1000)) {
            signalInstall(true);
            installProcess_.waitForFinished(1000);
        }
    }
    signalInstall(true);
    processGroup_ = 0;
    releaseInstallScope();
    queue_.clear();
}
void SetupController::releaseInstallScope() {
    if (ownsInstallScope_) {
        installingScopes.remove(installScope_ ? installScope_.data() : this);
        ownsInstallScope_ = false;
    }
}
bool SetupController::localServer() const {
    const auto host = origin_.host().toLower();
    return (origin_.scheme() == "http" || origin_.scheme() == "https")
        && (host == "localhost" || QHostAddress(host).isLoopback());
}
bool SetupController::canInstall() const {
    return localServer() && !cli_.isEmpty();
}
void SetupController::loadRuntimes(bool preserveState) {
    if (!cli_.isEmpty()) {
        if (listProcess_.state() != QProcess::NotRunning) {
            return;
        }
        listProcess_.disconnect(this);
        connect(&listProcess_, &QProcess::finished, this, [this, preserveState](int code, QProcess::ExitStatus status) {
            const auto data = QJsonDocument::fromJson(listProcess_.readAllStandardOutput()).object();
            if (code != 0 || status != QProcess::NormalExit || !data["packages"].isArray()) {
                error_ = tr("Could not read nodetool runtime list --json (exit %1). ").arg(code)
                    + QString::fromUtf8(listProcess_.readAllStandardError());
                if (!preserveState) {
                    state_ = "failed";
                }
                emit changed();
                return;
            }
            runtimes_ = {};
            if (localServer()) {
                statuses_ = {};
            }
            for (const auto &value : data["packages"].toArray()) {
                auto row = value.toObject();
                const auto id = row["id"].toString();
                if (!safeRuntimeId(id) || !row["installed"].isBool()) {
                    continue;
                }
                row["status"] = row["installed"].toBool() ? "installed" : "missing";
                row["installCommand"] = "nodetool runtime add " + id;
                runtimes_.append(row);
                if (localServer()) {
                    statuses_[id] = row["installed"];
                }
            }
            emit changed();
        });
        connect(&listProcess_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
            if (error == QProcess::FailedToStart) {
                cli_.clear();
                loadRuntimes();
            }
        });
        listProcess_.start(cli_, {"runtime", "list", "--json"});
    }
    if (cli_.isEmpty() || !localServer()) {
        request("runtimeStatuses", {}, false, [this](const QJsonObject &data) {
            statuses_ = {};
            for (const auto &value : data["statuses"].toArray()) {
                const auto row = value.toObject();
                statuses_[row["id"].toString()] = row["installed"];
            }
            if (cli_.isEmpty()) {
                runtimes_ = data["statuses"].toArray();
            }
        });
    }
}
void SetupController::installRuntime(const QString &id) {
    startInstalls({id});
}
void SetupController::installAll() {
    QStringList ids = offered_;
    if (ids.isEmpty()) {
        for (const auto &value : runtimes_) {
            const auto row = value.toObject();
            if (!row["installed"].toBool()) {
                ids.append(row["id"].toString());
            }
        }
    }
    startInstalls(ids);
}
void SetupController::startInstalls(const QStringList &ids) {
    if (installProcess_.state() != QProcess::NotRunning || ids.isEmpty()) {
        return;
    }
    for (const auto &id : ids) {
        bool known = false;
        for (const auto &value : runtimes_) {
            known |= value.toObject()["id"].toString() == id;
        }
        if (!safeRuntimeId(id) || (canInstall() && !known)) {
            state_ = "failed";
            error_ = tr("Unknown or invalid runtime id: %1").arg(id);
            emit changed();
            return;
        }
    }
    if (!canInstall()) {
        if (guidanceIds_ != ids) {
            guidance_.clear();
        }
        guidanceIds_ = ids;
        if (guidance_.isEmpty()) {
            guidance_ = tr("Run on the machine running the NodeTool server:\n")
                + "nodetool runtime add " + ids.join(' ');
        }
        state_ = "remote";
        emit changed();
        return;
    }
    auto *scope = installScope_ ? installScope_.data() : this;
    if (installingScopes.contains(scope)) {
        error_ = tr("Another runtime installation is running in this window.");
        emit changed();
        return;
    }
    installingScopes.insert(scope);
    ownsInstallScope_ = true;
    ++epoch_;
    lastRuntimes_ = ids;
    queue_ = ids;
    cancelled_ = false;
    progress_.clear();
    error_.clear();
    nextInstall();
}
void SetupController::readProgress() {
    progress_ += QString::fromUtf8(installProcess_.readAllStandardOutput());
    progress_ += QString::fromUtf8(installProcess_.readAllStandardError());
    if (progress_.size() > 65536) {
        progress_ = progress_.right(65536);
    }
    emit changed();
}
void SetupController::nextInstall() {
    if (queue_.isEmpty()) {
        releaseInstallScope();
        state_ = "installed";
        loadRuntimes(true);
        emit registryRefreshRequested();
        emit changed();
        return;
    }
#ifdef Q_OS_UNIX
    QProcess::UnixProcessParameters parameters;
    parameters.flags = QProcess::UnixProcessFlag::CreateNewSession;
    installProcess_.setUnixProcessParameters(parameters);
#endif
    const auto id = queue_.takeFirst();
    state_ = "installing";
    for (qsizetype i = 0; i < runtimes_.size(); ++i) {
        auto row = runtimes_[i].toObject();
        if (row["id"] == id) {
            row["status"] = "installing";
            runtimes_[i] = row;
        }
    }
    installProcess_.disconnect(this);
    connect(&installProcess_, &QProcess::started, this, [this] {
        processGroup_ = installProcess_.processId();
    });
    connect(&installProcess_, &QProcess::readyReadStandardOutput, this, &SetupController::readProgress);
    connect(&installProcess_, &QProcess::readyReadStandardError, this, &SetupController::readProgress);
    connect(&installProcess_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) {
            state_ = "failed";
            error_ = installProcess_.errorString();
            releaseInstallScope();
            emit changed();
        }
    });
    connect(&installProcess_, &QProcess::finished, this, [this, id](int code, QProcess::ExitStatus status) {
        readProgress();
        signalInstall(true);
        processGroup_ = 0;
        for (qsizetype i = 0; i < runtimes_.size(); ++i) {
            auto row = runtimes_[i].toObject();
            if (row["id"] == id) {
                row["status"] = cancelled_ ? "cancelled" : (code == 0 && status == QProcess::NormalExit ? "installed" : "failed");
                row["installed"] = !cancelled_ && code == 0 && status == QProcess::NormalExit;
                runtimes_[i] = row;
            }
        }
        if (cancelled_) {
            releaseInstallScope();
            return;
        }
        progress_ += tr("\n%1: CLI exit %2\n").arg(id).arg(code);
        if (code != 0 || status != QProcess::NormalExit) {
            state_ = "failed";
            error_ = tr("Installation failed (CLI exit %1).\n").arg(code)
                + progress_.split('\n').mid(qMax(0, progress_.split('\n').size() - 10)).join('\n');
            queue_.clear();
            releaseInstallScope();
            emit changed();
            return;
        }
        nextInstall();
    });
    installProcess_.start(cli_, {"runtime", "add", id});
    emit changed();
}
void SetupController::showAllRuntimes() {
    offered_.clear();
    emit changed();
}
QVariantList SetupController::runtimes() const {
    QVariantList rows;
    for (const auto &value : runtimes_) {
        auto row = value.toObject();
        if (!localServer()) {
            const auto id = row["id"].toString();
            row["installed"] = statuses_[id].toBool();
            row["status"] = statuses_.contains(id) ? (statuses_[id].toBool() ? "installed" : "missing") : "unknown";
            row["version"] = "";
        }
        if (offered_.isEmpty() || offered_.contains(row["id"].toString())) {
            rows.append(row.toVariantMap());
        }
    }
    return rows;
}
void SetupController::copyGuidance() {
    QGuiApplication::clipboard()->setText(guidance_);
}
void SetupController::missingRuntime(const QJsonObject &details) {
    guidance_.clear();
    for (const auto &key : {"managed", "bringYourOwn", "restart"}) {
        if (details[key].isString()) {
            if (!guidance_.isEmpty()) {
                guidance_ += '\n';
            }
            guidance_ += details[key].toString();
        }
    }
    offered_ = {details["runtimePackage"].toString()};
    guidanceIds_ = offered_;
    state_ = "remote";
    error_.clear();
    emit changed();
    emit runtimeOfferRequested();
}
void SetupController::offerWorkflow(const QJsonObject &workflow, const QJsonArray &metadata) {
    const auto id = workflow["id"].toString();
    const auto nodes = workflow["nodes"].toArray();
    if (id.isEmpty() || id == checkedWorkflow_ || nodes.isEmpty() || statuses_.isEmpty() || metadata.isEmpty()) {
        return;
    }
    checkedWorkflow_ = id;
    offered_.clear();
    for (const auto &node : nodes) {
        for (const auto &value : metadata) {
            const auto meta = value.toObject();
            if (meta["node_type"] != node.toObject()["type"]) {
                continue;
            }
            for (const auto &runtime : meta["required_runtimes"].toArray()) {
                const auto runtimeId = runtime.toString();
                if (!statuses_[runtimeId].toBool() && !offered_.contains(runtimeId)) {
                    offered_.append(runtimeId);
                }
            }
        }
    }
    if (!offered_.isEmpty()) {
        emit runtimeOfferRequested();
    }
}
}
