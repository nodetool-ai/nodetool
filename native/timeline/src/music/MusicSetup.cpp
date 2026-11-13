#include "music/MusicSetup.h"

#include "server/ServerSource.h"

#include <QJsonArray>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace {

QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }

QJsonObject modelSet(const QJsonObject& status, const char* name) {
    return status.value(u"models").toObject().value(QLatin1String(name)).toObject();
}

// The words for a refusal (aceStepSetupRefusalSchema). Empty: say nothing.
QString refusalText(const QString& reason) {
    if (reason == u"busy") return QStringLiteral("Another setup step is running. Wait for it to finish.");
    if (reason == u"not_admin") return QStringLiteral("Only an administrator of this server can set up music generation.");
    if (reason == u"no_models_dir") return QStringLiteral("This server has no folder for models, so it cannot download them.");
    return {};
}

}  // namespace

MusicSetupModel::MusicSetupModel(QObject* parent)
    : QObject(parent), m_target(nt::server::serverSaveTarget()), m_transport(this), m_poll(this) {
    m_poll.setInterval(kPollIntervalMs);
    connect(&m_poll, &QTimer::timeout, this, &MusicSetupModel::refresh);
    connect(&m_transport, &nt::ai::GenerationTransport::message, this, &MusicSetupModel::receive);
    connect(&m_transport, &nt::ai::GenerationTransport::readyChanged, this, [this] {
        m_opening = false;
        if (m_transport.ready()) sendPending();
    });
    connect(&m_transport, &nt::ai::GenerationTransport::error, this, [this](const QString& error) {
        m_opening = false;
        // Nothing queued survives a failed connection: "Check again" asks anew.
        m_pending.clear();
        if (m_state == u"checking") setState(QStringLiteral("error"));
        setMessage(QStringLiteral("Could not reach the NodeTool server: ") + error);
    });
    connect(&m_transport, &nt::ai::GenerationTransport::disconnected, this, [this] {
        m_opening = false;
        m_requests.clear();
        m_pending.clear();
        updatePolling();
    });
}

MusicSetupModel::~MusicSetupModel() { m_poll.stop(); }

bool MusicSetupModel::addInstrumentReady() const {
    if (m_state == u"remote") return true;
    return m_state == u"ready" && modelSet(m_status, "add_instrument").value(u"missing").toArray().isEmpty();
}

bool MusicSetupModel::binaryInstalled() const {
    return m_status.value(u"binary").toObject().value(u"installed").toBool();
}

QString MusicSetupModel::blockedReason() const {
    const auto binary = m_status.value(u"binary").toObject();
    const auto blocked = binary.value(u"blocked").toString();
    if (binary.value(u"installed").toBool() || blocked.isEmpty()) return {};
    // The server's own message names environment variables; these name the situation.
    if (blocked == u"digest-unset") return QStringLiteral("This build has no ACE-Step archive yet, so the music engine cannot be installed.");
    if (blocked == u"unsupported-platform") return QStringLiteral("The music engine runs on Macs with Apple silicon. This server cannot install it.");
    if (blocked == u"no-install-dir") return QStringLiteral("This server has no folder to install the music engine in.");
    return QStringLiteral("The music engine cannot be installed on this server.");
}

bool MusicSetupModel::modelsAvailable() const { return m_status.value(u"models").toObject().value(u"available").toBool(); }

bool MusicSetupModel::firstRunModelsPresent() const {
    const auto set = modelSet(m_status, "first_run");
    return !set.isEmpty() && set.value(u"missing").toArray().isEmpty();
}

double MusicSetupModel::firstRunBytes() const { return modelSet(m_status, "first_run").value(u"approx_bytes").toDouble(); }
double MusicSetupModel::firstRunMissingBytes() const { return modelSet(m_status, "first_run").value(u"missing_bytes").toDouble(); }
double MusicSetupModel::addInstrumentMissingBytes() const {
    return modelSet(m_status, "add_instrument").value(u"missing_bytes").toDouble();
}

QVariantMap MusicSetupModel::operation() const {
    if (m_operation.isEmpty()) return {};
    const auto percent = m_operation.value(u"percent");
    return {{"kind", m_operation.value(u"kind").toString()},
            {"set", m_operation.value(u"set").toString()},
            {"state", m_operation.value(u"state").toString()},
            {"stage", m_operation.value(u"stage").toString()},
            {"percent", percent.isDouble() ? percent.toDouble() : -1.0},
            {"downloadedBytes", m_operation.value(u"downloaded_bytes").toDouble()},
            {"totalBytes", m_operation.value(u"total_bytes").toDouble()},
            {"error", m_operation.value(u"error").toString()}};
}

bool MusicSetupModel::busy() const { return m_operation.value(u"state").toString() == u"running"; }

QString MusicSetupModel::formatBytes(double bytes) {
    if (!std::isfinite(bytes) || bytes <= 0) return QStringLiteral("0 MB");
    if (bytes >= 1e9) return QStringLiteral("%1 GB").arg(bytes / 1e9, 0, 'f', 1);
    return QStringLiteral("%1 MB").arg(std::max(1.0, std::round(bytes / 1e6)), 0, 'f', 0);
}

void MusicSetupModel::refresh() {
    if (m_state == u"offline" || m_state == u"error") {
        if (!m_target) return;
        setState(QStringLiteral("checking"));
    }
    send(QStringLiteral("acestep_setup_status"));
}

void MusicSetupModel::install() {
    setMessage({});
    send(QStringLiteral("acestep_install"));
}

void MusicSetupModel::downloadModels(const QString& set) {
    if (set != u"first_run" && set != u"add_instrument") return;
    setMessage({});
    send(QStringLiteral("acestep_download_models"), {{"set", set}});
}

void MusicSetupModel::cancel() { send(QStringLiteral("acestep_setup_cancel")); }

void MusicSetupModel::send(const QString& command, const QJsonObject& data) {
    if (!m_target) return;
    if (!m_transport.ready() && !m_opening) {
        m_opening = true;
        m_transport.configure(m_target->server, m_target->token);
        m_transport.open();
    }
    // A status request already queued answers this one too.
    const bool queued = std::any_of(m_pending.begin(), m_pending.end(), [&](const auto& p) { return p.first == command; });
    if (command != u"acestep_setup_status" || !queued) m_pending.emplace_back(command, data);
    if (m_transport.ready()) sendPending();
}

void MusicSetupModel::sendPending() {
    auto pending = std::move(m_pending);
    m_pending.clear();
    for (const auto& [command, data] : pending) {
        const auto id = newId();
        if (m_transport.send(command, data, id)) m_requests.insert(id);
    }
}

void MusicSetupModel::receive(const QJsonObject& message) {
    const auto type = message.value(u"type").toString();
    if (type == u"acestep_setup_progress") {
        applyOperation(message.value(u"operation").toObject());
        return;
    }
    if (type != u"rpc_response") return;
    const auto id = message.value(u"request_id").toString();
    if (!m_requests.remove(id)) return;
    if (message.value(u"error").isObject()) {
        if (m_state == u"checking") setState(QStringLiteral("error"));
        setMessage(message.value(u"error").toObject().value(u"message").toString());
        return;
    }
    const auto result = message.value(u"result").toObject();
    if (!result.value(u"accepted").toBool(true)) {
        const auto reason = result.value(u"reason").toString();
        setMessage(reason == u"blocked" ? blockedReason() : refusalText(reason));
    }
    applyStatus(result.value(u"status").toObject());
}

void MusicSetupModel::applyStatus(const QJsonObject& status) {
    if (status.isEmpty()) return;
    m_status = status;
    m_operation = status.value(u"operation").toObject();
    QString next;
    if (status.value(u"remote").toBool()) {
        next = QStringLiteral("remote");
    } else if (binaryInstalled() && firstRunModelsPresent()) {
        next = QStringLiteral("ready");
    } else {
        next = QStringLiteral("setup");
    }
    m_state = next;
    updatePolling();
    emit changed();
}

void MusicSetupModel::applyOperation(const QJsonObject& operation) {
    if (operation.isEmpty()) return;
    m_operation = operation;
    if (operation.value(u"state").toString() != u"running") {
        // The operation ended: the files on disk changed.
        refresh();
    }
    updatePolling();
    emit changed();
}

void MusicSetupModel::setMessage(const QString& message) {
    if (m_message == message) return;
    m_message = message;
    emit changed();
}

void MusicSetupModel::setState(const QString& state) {
    if (m_state == state) return;
    m_state = state;
    emit changed();
}

void MusicSetupModel::updatePolling() {
    // Progress frames reach only the session that started the operation.
    const bool polling = busy() && m_transport.ready();
    if (polling && !m_poll.isActive()) m_poll.start();
    if (!polling) m_poll.stop();
}
